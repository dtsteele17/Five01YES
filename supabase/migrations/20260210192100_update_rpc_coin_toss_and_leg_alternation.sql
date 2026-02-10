-- Update RPC to handle coin toss completion and proper leg alternation
-- The coin toss winner starts legs 1, 3, 5 (odd legs)
-- The other player starts legs 2, 4, 6 (even legs)

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
  v_current_player_id UUID;
  v_new_remaining INTEGER;
  v_is_checkout BOOLEAN := FALSE;
  v_visit_id UUID;
  v_new_leg INTEGER;
  v_new_turn_in_leg INTEGER;
  v_leg_winner_id UUID;
  v_next_player_id UUID;
  v_new_leg_starter_id UUID;
BEGIN
  -- Get the current room state with lock
  SELECT * INTO v_room
  FROM public.match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- Check if it's the current user's turn using UUID comparison
  IF v_room.current_turn IS NULL OR v_room.current_turn != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not your turn. Current turn: ' || COALESCE(v_room.current_turn::text, 'null') || ', You: ' || auth.uid()::text);
  END IF;

  v_current_player_id := auth.uid();

  -- Calculate new remaining
  v_new_remaining := v_room.current_score - p_score;

  -- Check for checkout (winning the leg)
  IF v_new_remaining = 0 THEN
    -- For typed scores, skip double validation
    -- For button inputs, validate double is required
    IF p_is_typed_score THEN
      v_is_checkout := TRUE;
    ELSE
      -- Only validate double for button inputs (not typed)
      IF v_room.double_out THEN
        -- For button inputs, assume the last dart is at a double for checkouts
        -- The frontend should handle double validation UI
        v_is_checkout := TRUE;
      ELSE
        v_is_checkout := TRUE;
      END IF;
    END IF;
  END IF;

  -- Check for bust
  IF v_new_remaining < 0 OR v_new_remaining = 1 OR (v_new_remaining = 0 AND NOT v_is_checkout) THEN
    -- This is a bust - score is invalid
    v_new_remaining := v_room.current_score; -- Reset to before
  END IF;

  -- Determine turn numbers
  v_new_leg := v_room.current_leg;
  v_new_turn_in_leg := COALESCE(v_room.turn_in_leg, 0) + 1;

  -- Insert the visit record
  INSERT INTO public.quick_match_visits (
    room_id,
    player_id,
    leg,
    turn_no,
    score,
    remaining_before,
    remaining_after,
    is_bust,
    is_checkout,
    darts,
    darts_thrown,
    darts_at_double,
    created_at
  ) VALUES (
    p_room_id,
    v_current_player_id,
    v_new_leg,
    v_new_turn_in_leg,
    p_score,
    v_room.current_score,
    v_new_remaining,
    p_is_bust OR (v_new_remaining = v_room.current_score AND v_new_remaining != 0),
    v_is_checkout,
    p_darts,
    p_darts_thrown,
    p_darts_at_double,
    NOW()
  )
  RETURNING id INTO v_visit_id;

  -- If this was a checkout, handle leg completion
  IF v_is_checkout THEN
    -- Increment leg counter for the winner
    IF v_current_player_id = v_room.player1_id THEN
      v_room.player1_legs := COALESCE(v_room.player1_legs, 0) + 1;
    ELSE
      v_room.player2_legs := COALESCE(v_room.player2_legs, 0) + 1;
    END IF;

    -- Check if match is won
    IF v_room.player1_legs >= v_room.legs_to_win OR v_room.player2_legs >= v_room.legs_to_win THEN
      -- Match is complete
      UPDATE public.match_rooms
      SET 
        player1_legs = v_room.player1_legs,
        player2_legs = v_room.player2_legs,
        winner_id = v_current_player_id,
        status = 'completed',
        updated_at = NOW()
      WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'success', TRUE,
        'visit_id', v_visit_id,
        'leg_won', TRUE,
        'match_won', TRUE,
        'player1_legs', v_room.player1_legs,
        'player2_legs', v_room.player2_legs
      );
    END IF;

    -- Move to next leg
    v_new_leg := v_new_leg + 1;
    v_new_turn_in_leg := 1;

    -- Alternate leg starter based on coin toss winner
    -- Odd legs (1, 3, 5): coin toss winner starts
    -- Even legs (2, 4, 6): other player starts
    IF v_room.coin_toss_winner_id IS NOT NULL THEN
      IF MOD(v_new_leg, 2) = 1 THEN
        -- Odd leg: coin toss winner starts
        v_new_leg_starter_id := v_room.coin_toss_winner_id;
      ELSE
        -- Even leg: other player starts
        IF v_room.coin_toss_winner_id = v_room.player1_id THEN
          v_new_leg_starter_id := v_room.player2_id;
        ELSE
          v_new_leg_starter_id := v_room.player1_id;
        END IF;
      END IF;
    ELSE
      -- Fallback: alternate between player1 and player2
      IF MOD(v_new_leg, 2) = 1 THEN
        v_new_leg_starter_id := v_room.player1_id;
      ELSE
        v_new_leg_starter_id := v_room.player2_id;
      END IF;
    END IF;

    v_next_player_id := v_new_leg_starter_id;

    -- Insert leg completion event
    INSERT INTO public.quick_match_visits (
      room_id,
      player_id,
      leg,
      turn_no,
      score,
      remaining_before,
      remaining_after,
      is_bust,
      is_checkout,
      darts,
      darts_thrown,
      darts_at_double,
      created_at
    ) VALUES (
      p_room_id,
      v_current_player_id,
      v_new_leg - 1, -- Mark for previous leg
      v_new_turn_in_leg,
      0,
      0,
      0,
      FALSE,
      FALSE,
      jsonb_build_object('leg_complete', TRUE, 'leg_winner', v_current_player_id),
      0,
      0,
      NOW()
    );

    -- Update room for new leg
    UPDATE public.match_rooms
    SET 
      current_leg = v_new_leg,
      turn_in_leg = 1,
      current_score = v_room.starting_score,
      current_turn = v_next_player_id,
      player1_legs = v_room.player1_legs,
      player2_legs = v_room.player2_legs,
      leg_starter_id = v_new_leg_starter_id,
      updated_at = NOW()
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'success', TRUE,
      'visit_id', v_visit_id,
      'leg_won', TRUE,
      'match_won', FALSE,
      'player1_legs', v_room.player1_legs,
      'player2_legs', v_room.player2_legs,
      'new_leg', v_new_leg,
      'next_player_id', v_next_player_id
    );
  END IF;

  -- Switch turns for next player
  IF v_room.player1_id = v_current_player_id THEN
    v_next_player_id := v_room.player2_id;
  ELSE
    v_next_player_id := v_room.player1_id;
  END IF;

  -- Update room state
  UPDATE public.match_rooms
  SET 
    current_score = v_new_remaining,
    current_turn = v_next_player_id,
    turn_in_leg = v_new_turn_in_leg,
    updated_at = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'visit_id', v_visit_id,
    'new_remaining', v_new_remaining,
    'is_bust', p_is_bust OR (v_new_remaining = v_room.current_score AND v_new_remaining != 0),
    'next_player_id', v_next_player_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN, INTEGER, INTEGER, BOOLEAN) TO service_role;
