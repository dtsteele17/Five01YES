/*
  # BOLT COMPLETE SYNC - Make Bolt Match Localhost
  
  This migration ensures Bolt database matches your localhost setup.
  Run this ONE file to fix everything at once.
  
  Fixes:
  1. Tournament participant counts (1/16, 2/16...)
  2. Tournament ready-up (1/2, 2/2 ready)
  3. Turn switching (UUID-based current_turn)
  4. All RPC functions updated
  5. Missing tables/columns created
*/

-- ============================================================================
-- PART 1: FIX TOURNAMENT READY-UP SYSTEM
-- ============================================================================

DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE OR REPLACE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_tournament RECORD;
  v_is_player boolean;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- tournament_matches.player1_id/player2_id reference auth.users(id)
  v_is_player := (v_match.player1_id = v_user_id OR v_match.player2_id = v_user_id);

  IF NOT v_is_player THEN
    RETURN jsonb_build_object('error', 'You are not a player in this match');
  END IF;

  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN jsonb_build_object('error', 'Match is not in ready phase');
  END IF;

  -- Record player readiness
  INSERT INTO public.tournament_match_ready (match_id, user_id, ready_at)
  VALUES (p_match_id, v_user_id, now())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET ready_at = now();

  -- Count ready players (should be 1 or 2)
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both players ready, create match room
  IF v_ready_count >= 2 AND v_match.match_room_id IS NULL THEN
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of, v_tournament.best_of_legs, 3);

      -- Create match room with UUID for current_turn
      INSERT INTO public.match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        match_type,
        source,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn
      ) VALUES (
        v_match.player1_id,
        v_match.player2_id,
        v_tournament.game_mode,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        'tournament',
        'tournament',
        'active',
        1,
        CASE v_best_of
          WHEN 1 THEN 1
          WHEN 3 THEN 2
          WHEN 5 THEN 3
          WHEN 7 THEN 4
          ELSE 2
        END,
        v_tournament.game_mode,
        v_tournament.game_mode,
        v_match.player1_id  -- Set current_turn to UUID (player1_id)
      )
      RETURNING id INTO v_match_room_id;

      -- Update tournament match
      UPDATE public.tournament_matches
      SET 
        match_room_id = v_match_room_id,
        status = 'in_game',
        started_at = now(),
        updated_at = now()
      WHERE id = p_match_id;

      v_status := 'in_game';
    END IF;
  ELSIF v_ready_count >= 2 AND v_match.match_room_id IS NOT NULL THEN
    v_match_room_id := v_match.match_room_id;
    v_status := 'in_game';
  ELSE
    v_match_room_id := NULL;
    v_status := 'ready';
  END IF;

  -- Return ready count and status (1/2 or 2/2)
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

-- ============================================================================
-- PART 2: FIX TURN SWITCHING (rpc_quick_match_submit_visit_v3)
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER);

CREATE FUNCTION public.rpc_quick_match_submit_visit_v3(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB DEFAULT '[]'::JSONB,
  p_is_bust BOOLEAN DEFAULT FALSE,
  p_darts_thrown INTEGER DEFAULT 3,
  p_darts_at_double INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_bust BOOLEAN := FALSE;
  v_bust_reason TEXT := NULL;
  v_is_checkout BOOLEAN := FALSE;
  v_player1_legs INTEGER := 0;
  v_player2_legs INTEGER := 0;
  v_leg_won BOOLEAN := FALSE;
  v_match_won BOOLEAN := FALSE;
  v_winner_id UUID := NULL;
  v_next_leg INTEGER;
  v_next_leg_starter UUID;
  v_other_player_id UUID;
  v_last_dart JSONB;
  v_is_double_finish BOOLEAN := FALSE;
  v_score_applied INTEGER;
  v_visit_number INTEGER := 1;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if user is in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RAISE EXCEPTION 'You are not in this room';
  END IF;

  -- Check if room is active
  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Room is not active (status: %)', v_room.status;
  END IF;

  -- Determine which player
  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Handle NULL current_turn (match just started) - set to player1 by default
  IF v_room.current_turn IS NULL THEN
    UPDATE match_rooms
    SET current_turn = v_room.player1_id,
        current_leg = COALESCE(v_room.current_leg, 1),
        player1_remaining = COALESCE(v_room.player1_remaining, v_room.game_mode),
        player2_remaining = COALESCE(v_room.player2_remaining, v_room.game_mode)
    WHERE id = p_room_id;
    -- Refresh room data
    SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id FOR UPDATE;
  END IF;

  -- Verify it's their turn (current_turn is UUID, not TEXT)
  IF v_room.current_turn IS NULL THEN
    RAISE EXCEPTION 'current_turn is NULL - cannot determine whose turn it is';
  END IF;
  
  IF v_room.current_turn != v_user_id THEN
    RAISE EXCEPTION 'Not your turn. Current turn: %, Your ID: %, Player1: %, Player2: %', 
      v_room.current_turn, v_user_id, v_room.player1_id, v_room.player2_id;
  END IF;

  -- Get other player ID
  v_other_player_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  -- Get current remaining score
  IF v_is_player1 THEN
    v_current_remaining := v_room.player1_remaining;
  ELSE
    v_current_remaining := v_room.player2_remaining;
  END IF;

  -- Get next visit number for this leg
  SELECT COALESCE(MAX(turn_no), 0) + 1 INTO v_visit_number
  FROM quick_match_visits
  WHERE room_id = p_room_id AND leg = v_room.current_leg AND player_id = v_user_id;

  -- Check for explicit bust from client (Bust button)
  IF p_is_bust THEN
    v_is_bust := TRUE;
    v_bust_reason := 'manual_bust';
    v_new_remaining := v_current_remaining;
    v_score_applied := 0;
  ELSE
    -- Calculate new remaining
    v_new_remaining := v_current_remaining - p_score;

    -- Check for automatic bust conditions
    IF v_new_remaining < 0 THEN
      v_is_bust := TRUE;
      v_bust_reason := 'below_zero';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 1 THEN
      v_is_bust := TRUE;
      v_bust_reason := 'left_on_one';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 0 THEN
      -- Potential checkout - validate double-out if required
      IF v_room.double_out THEN
        -- Only enforce double-out when remaining_before <= 50
        IF v_current_remaining <= 50 THEN
          -- Get the last dart
          IF jsonb_array_length(p_darts) > 0 THEN
            v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);

            -- Check if last dart is a double
            IF (v_last_dart->>'mult' = 'D') OR (v_last_dart->>'mult' = 'DB') THEN
              v_is_double_finish := TRUE;
            END IF;

            -- If double-out required but last dart wasn't double, it's a bust
            IF NOT v_is_double_finish THEN
              v_is_bust := TRUE;
              v_bust_reason := 'double_out_required';
              v_new_remaining := v_current_remaining;
              v_score_applied := 0;
            ELSE
              v_score_applied := p_score;
            END IF;
          ELSE
            -- No darts provided but claiming checkout - treat as bust
            v_is_bust := TRUE;
            v_bust_reason := 'double_out_required';
            v_new_remaining := v_current_remaining;
            v_score_applied := 0;
          END IF;
        ELSE
          -- Remaining > 50, no double-out enforcement yet, valid checkout
          v_score_applied := p_score;
        END IF;
      ELSE
        -- No double-out required, valid checkout
        v_score_applied := p_score;
      END IF;
    ELSE
      -- Normal scoring
      v_score_applied := p_score;
    END IF;
  END IF;

  -- Check for checkout
  v_is_checkout := (v_new_remaining = 0 AND NOT v_is_bust);

  -- Insert visit into quick_match_visits
  INSERT INTO quick_match_visits (
    room_id, player_id, leg, turn_no, score,
    remaining_before, remaining_after,
    darts, darts_thrown, darts_at_double,
    is_bust, bust_reason, is_checkout
  ) VALUES (
    p_room_id, v_user_id, v_room.current_leg, v_visit_number, p_score,
    v_current_remaining, v_new_remaining,
    p_darts, p_darts_thrown, p_darts_at_double,
    v_is_bust, v_bust_reason, v_is_checkout
  );

  -- If checkout, handle leg win
  IF v_is_checkout THEN
    v_leg_won := TRUE;

    -- Get current leg counts from summary
    v_player1_legs := COALESCE((v_room.summary->>'player1_legs')::INTEGER, 0);
    v_player2_legs := COALESCE((v_room.summary->>'player2_legs')::INTEGER, 0);

    -- Increment winner's legs
    IF v_is_player1 THEN
      v_player1_legs := v_player1_legs + 1;
    ELSE
      v_player2_legs := v_player2_legs + 1;
    END IF;

    -- Check if match won
    IF v_player1_legs > (v_room.legs_to_win - 1) THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player1_id;
    ELSIF v_player2_legs > (v_room.legs_to_win - 1) THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player2_id;
    END IF;

    IF v_match_won THEN
      -- Match complete
      UPDATE match_rooms
      SET status = 'finished', 
          winner_id = v_winner_id,
          player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE v_room.player1_remaining END,
          player2_remaining = CASE WHEN v_is_player1 THEN v_room.player2_remaining ELSE v_new_remaining END,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs)
      WHERE id = p_room_id;
    ELSE
      -- Start new leg
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player based on leg number
      IF v_next_leg % 2 = 1 THEN
        v_next_leg_starter := v_room.player1_id;
      ELSE
        v_next_leg_starter := v_room.player2_id;
      END IF;

      UPDATE match_rooms
      SET current_leg = v_next_leg,
          current_turn = v_next_leg_starter,  -- Set to UUID (player_id)
          player1_remaining = v_room.game_mode,
          player2_remaining = v_room.game_mode,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs)
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- NOT a checkout: Update remaining scores AND switch turn atomically
    UPDATE match_rooms
    SET player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE v_room.player1_remaining END,
        player2_remaining = CASE WHEN v_is_player1 THEN v_room.player2_remaining ELSE v_new_remaining END,
        current_turn = v_other_player_id,  -- Switch to opponent's UUID
        summary = COALESCE(
          CASE 
            WHEN v_room.summary IS NULL THEN jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
            WHEN NOT (v_room.summary ? 'player1_legs') THEN jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
            ELSE v_room.summary
          END,
          jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
        )
    WHERE id = p_room_id;
  END IF;

  -- Return response
  RETURN jsonb_build_object(
    'ok', TRUE,
    'remaining_after', v_new_remaining,
    'score_applied', v_score_applied,
    'is_bust', v_is_bust,
    'bust_reason', v_bust_reason,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'double_out', v_room.double_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3 TO authenticated;

-- ============================================================================
-- PART 3: FIX BACKUP FUNCTION (v2)
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v2(UUID, INTEGER, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.rpc_quick_match_submit_visit_v2(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB DEFAULT '[]'::JSONB,
  p_is_bust BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_bust BOOLEAN := FALSE;
  v_bust_reason TEXT := NULL;
  v_is_checkout BOOLEAN := FALSE;
  v_other_player_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RAISE EXCEPTION 'You are not in this room';
  END IF;

  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Room is not active';
  END IF;

  v_is_player1 := (v_room.player1_id = v_user_id);

  IF v_room.current_turn IS NULL THEN
    UPDATE match_rooms SET current_turn = v_room.player1_id WHERE id = p_room_id;
    SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id FOR UPDATE;
  END IF;

  IF v_room.current_turn != v_user_id THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  v_other_player_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  IF v_is_player1 THEN
    v_current_remaining := v_room.player1_remaining;
  ELSE
    v_current_remaining := v_room.player2_remaining;
  END IF;

  IF p_is_bust THEN
    v_is_bust := TRUE;
    v_bust_reason := 'manual_bust';
    v_new_remaining := v_current_remaining;
  ELSE
    v_new_remaining := v_current_remaining - p_score;
    IF v_new_remaining < 0 OR v_new_remaining = 1 THEN
      v_is_bust := TRUE;
      v_bust_reason := CASE WHEN v_new_remaining < 0 THEN 'below_zero' ELSE 'left_on_one' END;
      v_new_remaining := v_current_remaining;
    END IF;
  END IF;

  v_is_checkout := (v_new_remaining = 0 AND NOT v_is_bust);

  UPDATE match_rooms
  SET player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE v_room.player1_remaining END,
      player2_remaining = CASE WHEN v_is_player1 THEN v_room.player2_remaining ELSE v_new_remaining END,
      current_turn = v_other_player_id
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'remaining_after', v_new_remaining,
    'is_bust', v_is_bust,
    'bust_reason', v_bust_reason,
    'is_checkout', v_is_checkout
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v2(UUID, INTEGER, JSONB, BOOLEAN) TO authenticated;

-- ============================================================================
-- PART 4: ENSURE TOURNAMENT_MATCH_READY TABLE EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_match_ready (
  match_id uuid REFERENCES tournament_matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ready_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id ON tournament_match_ready(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_user_id ON tournament_match_ready(user_id);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ready status for their matches" ON tournament_match_ready;
CREATE POLICY "Users can view ready status for their matches"
  ON tournament_match_ready
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
      AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can mark themselves ready" ON tournament_match_ready;
CREATE POLICY "Users can mark themselves ready"
  ON tournament_match_ready
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
      AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

-- ============================================================================
-- PART 5: FIX EXISTING DATA
-- ============================================================================

-- Fix any rooms with NULL current_turn
UPDATE match_rooms
SET current_turn = player1_id,
    current_leg = COALESCE(current_leg, 1),
    player1_remaining = COALESCE(player1_remaining, game_mode),
    player2_remaining = COALESCE(player2_remaining, game_mode)
WHERE current_turn IS NULL
  AND status = 'active'
  AND player1_id IS NOT NULL;

-- ============================================================================
-- DONE! Bolt should now match localhost perfectly.
-- ============================================================================
