-- Fix the RPC function to use correct column names
-- The match_rooms table uses player1_remaining/player2_remaining, not current_score

CREATE OR REPLACE FUNCTION public.rpc_quick_match_submit_visit_v3(
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
  v_last_dart JSONB;
  v_is_double_finish BOOLEAN := FALSE;
  v_score_applied INTEGER;
  v_bust_reason TEXT := NULL;
  v_actual_bust BOOLEAN := FALSE;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM public.match_rooms
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
  FROM public.quick_match_visits
  WHERE room_id = p_room_id AND leg = v_room.current_leg AND player_id = v_user_id;

  -- Handle explicit bust from client (Bust button)
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
      -- SKIP double validation for typed scores
      IF v_room.double_out AND NOT p_is_typed_score THEN
        -- Enforce double-out for button inputs
        IF jsonb_array_length(p_darts) > 0 THEN
          v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);
          
          -- Check if last dart is a double
          IF (v_last_dart->>'mult' = 'D') OR (v_last_dart->>'mult' = 'DB') THEN
            v_is_double_finish := TRUE;
          END IF;

          -- If double-out required but last dart wasn't double, it's a bust
          IF NOT v_is_double_finish THEN
            v_actual_bust := TRUE;
            v_bust_reason := 'double_out_required';
            v_new_remaining := v_current_remaining;
            v_score_applied := 0;
          ELSE
            v_score_applied := p_score;
          END IF;
        ELSE
          -- No darts provided but claiming checkout - treat as bust
          v_actual_bust := TRUE;
          v_bust_reason := 'double_out_required';
          v_new_remaining := v_current_remaining;
          v_score_applied := 0;
        END IF;
      ELSE
        -- No double-out required OR typed score (valid checkout)
        v_score_applied := p_score;
      END IF;
    ELSE
      -- Normal scoring
      v_score_applied := p_score;
    END IF;
  END IF;

  -- Check for checkout
  v_is_checkout := (v_new_remaining = 0 AND NOT v_actual_bust);

  -- Insert visit into quick_match_visits
  INSERT INTO public.quick_match_visits (
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
    UPDATE public.match_rooms SET player1_remaining = v_new_remaining WHERE id = p_room_id;
  ELSE
    UPDATE public.match_rooms SET player2_remaining = v_new_remaining WHERE id = p_room_id;
  END IF;

  -- If checkout, handle leg win
  IF v_is_checkout THEN
    -- Get current leg counts
    v_player1_legs := COALESCE(v_room.player1_legs, 0);
    v_player2_legs := COALESCE(v_room.player2_legs, 0);

    -- Increment winner's legs
    IF v_is_player1 THEN
      v_player1_legs := v_player1_legs + 1;
    ELSE
      v_player2_legs := v_player2_legs + 1;
    END IF;

    -- Check if match won
    IF v_player1_legs >= v_room.legs_to_win THEN
      -- Match complete - player 1 won
      UPDATE public.match_rooms
      SET status = 'finished', winner_id = v_room.player1_id,
          player1_legs = v_player1_legs, player2_legs = v_player2_legs,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'success', TRUE,
        'visit_id', v_visit_id,
        'leg_won', TRUE,
        'match_won', TRUE,
        'player1_legs', v_player1_legs,
        'player2_legs', v_player2_legs,
        'checkout', TRUE
      );
    ELSIF v_player2_legs >= v_room.legs_to_win THEN
      -- Match complete - player 2 won
      UPDATE public.match_rooms
      SET status = 'finished', winner_id = v_room.player2_id,
          player1_legs = v_player1_legs, player2_legs = v_player2_legs,
          updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', TRUE,
        'success', TRUE,
        'visit_id', v_visit_id,
        'leg_won', TRUE,
        'match_won', TRUE,
        'player1_legs', v_player1_legs,
        'player2_legs', v_player2_legs,
        'checkout', TRUE
      );
    ELSE
      -- Leg won but match continues - start new leg
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player based on coin toss winner if available
      IF v_room.coin_toss_winner_id IS NOT NULL THEN
        -- Odd legs (1, 3, 5): coin toss winner starts
        -- Even legs (2, 4, 6): other player starts
        IF MOD(v_next_leg, 2) = 1 THEN
          v_next_leg_starter := v_room.coin_toss_winner_id;
        ELSE
          -- Other player starts
          IF v_room.coin_toss_winner_id = v_room.player1_id THEN
            v_next_leg_starter := v_room.player2_id;
          ELSE
            v_next_leg_starter := v_room.player1_id;
          END IF;
        END IF;
      ELSE
        -- Fallback: simple alternation
        IF v_room.leg_starter_id = v_room.player1_id THEN
          v_next_leg_starter := v_room.player2_id;
        ELSE
          v_next_leg_starter := v_room.player1_id;
        END IF;
      END IF;

      UPDATE public.match_rooms
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
        'ok', TRUE,
        'success', TRUE,
        'visit_id', v_visit_id,
        'leg_won', TRUE,
        'match_won', FALSE,
        'player1_legs', v_player1_legs,
        'player2_legs', v_player2_legs,
        'new_leg', v_next_leg,
        'next_player_id', v_next_leg_starter,
        'checkout', TRUE
      );
    END IF;
  ELSE
    -- No checkout - switch turn
    UPDATE public.match_rooms
    SET current_turn = CASE 
      WHEN current_turn = player1_id THEN player2_id 
      ELSE player1_id 
    END,
    updated_at = NOW()
    WHERE id = p_room_id;
  END IF;

  -- Return response for non-checkout
  RETURN jsonb_build_object(
    'ok', TRUE,
    'success', TRUE,
    'visit_id', v_visit_id,
    'new_remaining', v_new_remaining,
    'is_bust', v_actual_bust,
    'bust_reason', v_bust_reason,
    'checkout', v_is_checkout,
    'score_applied', v_score_applied
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO service_role;
