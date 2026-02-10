/*
  # BOLT FIX: Tournament Ready-Up System
  
  This fixes the tournament ready-up flow to show:
  - 1/16, 2/16... participants correctly
  - 1/2 ready, 2/2 ready status correctly
  - Auto-create match room when both players ready
  - Proper redirect to match
  
  Run this in Bolt SQL Editor.
*/

-- ============================================================================
-- PART 1: Fix ready_up_tournament_match function
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

  -- Record player readiness using auth.uid() (which is auth.users.id)
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
      -- Note: Only use columns that exist in match_rooms table
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

  -- Return ready count and status
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

COMMENT ON FUNCTION ready_up_tournament_match IS 'Marks player as ready for tournament match. Returns ready_count (1/2 or 2/2) and creates match room when both players ready.';

-- ============================================================================
-- PART 2: Ensure tournament_match_ready table exists with correct structure
-- ============================================================================

-- Ensure tournament_match_ready table exists
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  match_id uuid REFERENCES tournament_matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ready_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id ON tournament_match_ready(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_user_id ON tournament_match_ready(user_id);

-- Enable RLS
ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see ready status for matches they're in
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

-- RLS Policy: Users can insert their own ready status
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
-- PART 3: Fix tournament participant count queries
-- ============================================================================

-- Create a view for accurate participant counts
CREATE OR REPLACE VIEW v_tournament_participant_counts AS
SELECT 
  tournament_id,
  COUNT(*)::integer AS participant_count
FROM tournament_participants
WHERE status_type IN ('registered', 'checked-in')
GROUP BY tournament_id;

-- ============================================================================
-- DONE! Tournament ready-up system fixed.
-- ============================================================================
