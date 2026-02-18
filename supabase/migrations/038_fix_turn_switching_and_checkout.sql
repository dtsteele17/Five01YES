-- ============================================================================
-- FIX: Turn switching and checkout issues in 301/501
-- ============================================================================

-- Drop and recreate the RPC function with fixes
CREATE OR REPLACE FUNCTION rpc_quick_match_submit_visit_v3(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB DEFAULT '[]'::JSONB,
  p_is_bust BOOLEAN DEFAULT FALSE,
  p_darts_thrown INTEGER DEFAULT 3,
  p_darts_at_double INTEGER DEFAULT 0,
  p_is_typed_score BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_user_id UUID;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_checkout BOOLEAN := FALSE;
  v_visit_id UUID;
  v_visit_number INTEGER := 1;
  v_player1_legs INTEGER;
  v_player2_legs INTEGER;
  v_next_leg INTEGER;
  v_next_leg_starter UUID;
  v_is_double_finish BOOLEAN := FALSE;
  v_score_applied INTEGER;
  v_bust_reason TEXT := NULL;
  v_actual_bust BOOLEAN := FALSE;
  v_next_player_id UUID;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Lock and get room from match_rooms
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- Check if user is in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('error', 'You are not in this room');
  END IF;

  -- Check if room is active
  IF v_room.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Room is not active (status: ' || v_room.status || ')');
  END IF;

  -- Determine which player
  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Verify it's their turn
  IF v_room.current_turn != v_user_id THEN
    RETURN jsonb_build_object('error', 'Not your turn');
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

  -- Handle explicit bust from client
  IF p_is_bust THEN
    v_actual_bust := TRUE;
    v_bust_reason := 'manual_bust';
    v_new_remaining := v_current_remaining;
    v_score_applied := 0;
  ELSE
    -- Calculate new remaining
    v_new_remaining := v_current_remaining - p_score;

    -- Check for automatic bust conditions
    IF v_new_remaining < 0 THEN
      v_actual_bust := TRUE;
      v_bust_reason := 'below_zero';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 1 THEN
      v_actual_bust := TRUE;
      v_bust_reason := 'left_on_one';
      v_new_remaining := v_current_remaining;
      v_score_applied := 0;
    ELSIF v_new_remaining = 0 THEN
      -- Potential checkout - validate double-out if required
      IF v_room.double_out AND NOT p_is_typed_score THEN
        IF jsonb_array_length(p_darts) > 0 THEN
          DECLARE
            v_last_dart JSONB;
          BEGIN
            v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);
            IF (v_last_dart->>'mult' = 'D') OR (v_last_dart->>'mult' = 'DB') THEN
              v_is_double_finish := TRUE;
            END IF;
          END;

          IF NOT v_is_double_finish THEN
            v_actual_bust := TRUE;
            v_bust_reason := 'double_out_required';
            v_new_remaining := v_current_remaining;
            v_score_applied := 0;
          ELSE
            v_score_applied := p_score;
          END IF;
        ELSE
          v_actual_bust := TRUE;
          v_bust_reason := 'double_out_required';
          v_new_remaining := v_current_remaining;
          v_score_applied := 0;
        END IF;
      ELSE
        v_score_applied := p_score;
      END IF;
    ELSE
      v_score_applied := p_score;
    END IF;
  END IF;

  -- Check for checkout
  v_is_checkout := (v_new_remaining = 0 AND NOT v_actual_bust);

  -- Insert visit into quick_match_visits
  INSERT INTO quick_match_visits (
    room_id, player_id, leg, turn_no, score,
    remaining_before, remaining_after,
    darts, darts_thrown, darts_at_double,
    is_bust, bust_reason, is_checkout, created_at
  ) VALUES (
    p_room_id, v_user_id, v_room.current_leg, v_visit_number, p_score,
    v_current_remaining, v_new_remaining,
    p_darts, p_darts_thrown, p_darts_at_double,
    v_actual_bust, v_bust_reason, v_is_checkout, NOW()
  )
  RETURNING id INTO v_visit_id;

  -- Update remaining score for current player
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_remaining = v_new_remaining WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms SET player2_remaining = v_new_remaining WHERE id = p_room_id;
  END IF;

  -- Calculate next player ID (for non-checkout scenarios)
  IF v_is_player1 THEN
    v_next_player_id := v_room.player2_id;
  ELSE
    v_next_player_id := v_room.player1_id;
  END IF;

  -- If checkout, handle leg win
  IF v_is_checkout THEN
    v_player1_legs := COALESCE(v_room.player1_legs, 0);
    v_player2_legs := COALESCE(v_room.player2_legs, 0);

    IF v_is_player1 THEN
      v_player1_legs := v_player1_legs + 1;
    ELSE
      v_player2_legs := v_player2_legs + 1;
    END IF;

    -- Check if match won
    IF v_player1_legs >= v_room.legs_to_win THEN
      UPDATE match_rooms
      SET status = 'finished', winner_id = v_room.player1_id,
          player1_legs = v_player1_legs, player2_legs = v_player2_legs,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE, 'success', TRUE,
        'visit_id', v_visit_id, 'leg_won', TRUE, 'match_won', TRUE,
        'player1_legs', v_player1_legs, 'player2_legs', v_player2_legs,
        'checkout', TRUE
      );
    ELSIF v_player2_legs >= v_room.legs_to_win THEN
      UPDATE match_rooms
      SET status = 'finished', winner_id = v_room.player2_id,
          player1_legs = v_player1_legs, player2_legs = v_player2_legs,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE, 'success', TRUE,
        'visit_id', v_visit_id, 'leg_won', TRUE, 'match_won', TRUE,
        'player1_legs', v_player1_legs, 'player2_legs', v_player2_legs,
        'checkout', TRUE
      );
    ELSE
      -- Leg won but match continues - START NEW LEG
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player for next leg
      IF v_room.coin_toss_winner_id IS NOT NULL THEN
        IF MOD(v_next_leg, 2) = 1 THEN
          v_next_leg_starter := v_room.coin_toss_winner_id;
        ELSE
          IF v_room.coin_toss_winner_id = v_room.player1_id THEN
            v_next_leg_starter := v_room.player2_id;
          ELSE
            v_next_leg_starter := v_room.player1_id;
          END IF;
        END IF;
      ELSE
        IF v_room.leg_starter_id = v_room.player1_id THEN
          v_next_leg_starter := v_room.player2_id;
        ELSE
          v_next_leg_starter := v_room.player1_id;
        END IF;
      END IF;

      -- UPDATE: Start new leg with reset scores and correct starting player
      UPDATE match_rooms
      SET current_leg = v_next_leg,
          leg_starter_id = v_next_leg_starter,
          current_turn = v_next_leg_starter,
          player1_remaining = v_room.game_mode,
          player2_remaining = v_room.game_mode,
          player1_legs = v_player1_legs,
          player2_legs = v_player2_legs,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE, 'success', TRUE,
        'visit_id', v_visit_id, 'leg_won', TRUE, 'match_won', FALSE,
        'player1_legs', v_player1_legs, 'player2_legs', v_player2_legs,
        'new_leg', v_next_leg, 'next_player_id', v_next_leg_starter,
        'checkout', TRUE
      );
    END IF;
  ELSE
    -- NO CHECKOUT: Always switch turn to the other player
    UPDATE match_rooms
    SET current_turn = v_next_player_id,
        updated_at = NOW()
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'ok', TRUE, 'success', TRUE,
      'visit_id', v_visit_id,
      'new_remaining', v_new_remaining,
      'is_bust', v_actual_bust,
      'bust_reason', v_bust_reason,
      'checkout', FALSE,
      'score_applied', v_score_applied,
      'next_player_id', v_next_player_id
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO service_role;

-- Also fix any potential issues with quick_match_lobbies constraint
ALTER TABLE quick_match_lobbies DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies ADD CONSTRAINT quick_match_lobbies_status_check 
CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed', 'finished'));

SELECT 'Turn switching and checkout fix applied!' as status;
