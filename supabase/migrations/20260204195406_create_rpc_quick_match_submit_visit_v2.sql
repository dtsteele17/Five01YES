/*
  # Create rpc_quick_match_submit_visit_v2 Function

  ## Summary
  Creates the unified `rpc_quick_match_submit_visit_v2` RPC function for all quick match visit submissions.
  This function accepts p_room_id, p_score, p_darts, and p_is_bust parameters.

  ## Parameters
  - p_room_id (UUID) - The match room ID
  - p_score (INTEGER) - The score achieved in this visit
  - p_darts (JSONB) - Array of dart objects with structure: { mult: 'S'|'D'|'T'|'B', n: number }
  - p_is_bust (BOOLEAN) - Explicit bust flag from client

  ## Changes
  1. Creates new RPC function with standardized naming
  2. Implements full visit submission logic with:
     - Manual bust handling when p_is_bust = true
     - Automatic bust detection (below_zero, left_on_one)
     - Double-out validation
     - Leg and match completion logic
     - Turn switching

  ## Security
  - SECURITY DEFINER for proper permission handling
  - Validates user authentication
  - Verifies user is in the match
  - Checks turn validation
*/

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
  v_is_checkout BOOLEAN;
  v_other_player_id UUID;
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
  v_darts_thrown INTEGER;
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
    RAISE EXCEPTION 'Room is not active';
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

  -- Calculate darts thrown from p_darts array
  v_darts_thrown := jsonb_array_length(p_darts);
  IF v_darts_thrown IS NULL OR v_darts_thrown = 0 THEN
    v_darts_thrown := 3; -- Default to 3 darts
  END IF;

  -- Check for explicit bust from client
  IF p_is_bust THEN
    v_is_bust := TRUE;
    v_bust_reason := 'manual_bust';
    v_new_remaining := v_current_remaining; -- Score doesn't change on bust
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
        -- Get the last dart
        IF jsonb_array_length(p_darts) > 0 THEN
          v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);

          -- Check if last dart is a double
          IF (v_last_dart->>'mult' = 'D') OR
             (v_last_dart->>'mult' = 'B' AND (v_last_dart->>'n')::INTEGER = 50) THEN
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

  -- Insert visit event
  INSERT INTO match_events (
    room_id,
    player_id,
    event_type,
    payload
  ) VALUES (
    p_room_id,
    v_user_id,
    'visit',
    jsonb_build_object(
      'score', p_score,
      'remaining', v_new_remaining,
      'is_bust', v_is_bust,
      'bust_reason', v_bust_reason,
      'is_checkout', v_is_checkout,
      'leg', v_room.current_leg,
      'darts', p_darts,
      'darts_thrown', v_darts_thrown
    )
  );

  -- Update remaining score for current player
  IF v_is_player1 THEN
    UPDATE match_rooms
    SET player1_remaining = v_new_remaining
    WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms
    SET player2_remaining = v_new_remaining
    WHERE id = p_room_id;
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
      SET
        status = 'finished',
        winner_id = v_winner_id,
        summary = jsonb_build_object(
          'player1_legs', v_player1_legs,
          'player2_legs', v_player2_legs
        )
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
      SET
        current_leg = v_next_leg,
        leg_starter_id = v_next_leg_starter,
        current_turn = CASE WHEN v_next_leg_starter = player1_id THEN 'player1' ELSE 'player2' END,
        player1_remaining = v_room.game_mode,
        player2_remaining = v_room.game_mode,
        summary = jsonb_build_object(
          'player1_legs', v_player1_legs,
          'player2_legs', v_player2_legs
        )
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- Switch turn
    UPDATE match_rooms
    SET current_turn = CASE
      WHEN current_turn = 'player1' THEN 'player2'
      ELSE 'player1'
    END
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

GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v2(UUID, INTEGER, JSONB, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.rpc_quick_match_submit_visit_v2 IS 'Unified RPC function for all quick match visit submissions. Handles manual bust flag, automatic bust detection, double-out validation, and match progression.';
