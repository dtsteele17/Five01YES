/*
  # Drop and Recreate rpc_quick_match_submit_visit_v3 Function

  ## Summary
  Drops all versions of v3 and recreates with the correct signature that stores visits 
  in `quick_match_visits` table.

  ## Parameters
  - p_room_id (UUID) - The match room ID
  - p_score (INTEGER) - The score achieved in this visit (0-180)
  - p_darts (JSONB) - Array of dart objects: [{ n: number, mult: "S"|"D"|"T"|"SB"|"DB" }]
  - p_is_bust (BOOLEAN) - Explicit bust flag from client (from Bust button)
  - p_darts_thrown (INTEGER) - Number of darts thrown (1-3, Miss counts as thrown)
  - p_darts_at_double (INTEGER) - Darts at double attempt from popup (0-3)
*/

-- Drop all existing v3 versions
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER);

-- Create the correct version
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

  -- Verify it's their turn
  IF (v_is_player1 AND v_room.current_turn != 'player1') OR
     (NOT v_is_player1 AND v_room.current_turn != 'player2') THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

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

  -- Update remaining score for current player
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_remaining = v_new_remaining WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms SET player2_remaining = v_new_remaining WHERE id = p_room_id;
  END IF;

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
      SET status = 'finished', winner_id = v_winner_id,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs)
      WHERE id = p_room_id;
    ELSE
      -- Start new leg
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player
      IF v_room.leg_starter_id = v_room.player1_id THEN
        v_next_leg_starter := v_room.player2_id;
      ELSE
        v_next_leg_starter := v_room.player1_id;
      END IF;

      UPDATE match_rooms
      SET current_leg = v_next_leg,
          leg_starter_id = v_next_leg_starter,
          current_turn = CASE WHEN v_next_leg_starter = player1_id THEN 'player1' ELSE 'player2' END,
          player1_remaining = v_room.game_mode,
          player2_remaining = v_room.game_mode,
          summary = jsonb_build_object('player1_legs', v_player1_legs, 'player2_legs', v_player2_legs)
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- Switch turn
    UPDATE match_rooms
    SET current_turn = CASE WHEN current_turn = 'player1' THEN 'player2' ELSE 'player1' END
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

COMMENT ON FUNCTION public.rpc_quick_match_submit_visit_v3 IS 'V3: Stores visits in quick_match_visits table with full dart details, darts_thrown, and darts_at_double. Handles manual bust, automatic bust detection, double-out validation (only when remaining <= 50), and match progression.';
