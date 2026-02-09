-- Debug and fix checkout issues
-- Add logging and ensure checkout detection works properly

-- Drop existing function
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN);

-- Create function with debug logging
CREATE OR REPLACE FUNCTION public.rpc_quick_match_submit_visit_v3(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB,
  p_is_bust BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_player_id UUID;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_checkout BOOLEAN := false;
  v_leg_won BOOLEAN := false;
  v_match_won BOOLEAN := false;
  v_new_p1_legs INTEGER;
  v_new_p2_legs INTEGER;
  v_turn_no INTEGER;
  v_darts_thrown INTEGER;
  v_darts_at_double INTEGER;
  v_last_dart_mult TEXT;
  v_require_double BOOLEAN;
BEGIN
  -- Get current user
  v_player_id := auth.uid();
  
  RAISE NOTICE '[RPC] Submit called - Room: %, Player: %, Score: %, IsBust: %', p_room_id, v_player_id, p_score, p_is_bust;
  
  -- Get room data
  SELECT * INTO v_room 
  FROM public.match_rooms 
  WHERE id = p_room_id 
  FOR UPDATE;
  
  IF v_room IS NULL THEN
    RAISE NOTICE '[RPC] Room not found';
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Verify it's the player's turn
  IF v_room.current_turn != v_player_id THEN
    RAISE NOTICE '[RPC] Not your turn - current: %, you: %', v_room.current_turn, v_player_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Not your turn');
  END IF;
  
  v_is_player1 := (v_player_id = v_room.player1_id);
  v_current_remaining := CASE WHEN v_is_player1 THEN v_room.player1_remaining ELSE v_room.player2_remaining END;
  
  RAISE NOTICE '[RPC] Current remaining: %, Score: %, IsBust: %', v_current_remaining, p_score, p_is_bust;
  
  -- Calculate new remaining
  IF p_is_bust THEN
    v_new_remaining := v_current_remaining;
  ELSE
    v_new_remaining := v_current_remaining - p_score;
  END IF;
  
  RAISE NOTICE '[RPC] New remaining: %', v_new_remaining;
  
  -- Check for checkout (winning the leg)
  IF v_new_remaining = 0 AND NOT p_is_bust THEN
    -- Check if double is required
    v_require_double := COALESCE(v_room.double_out, true);
    
    IF v_require_double THEN
      -- Get last dart multiplier
      SELECT (p_darts->(jsonb_array_length(p_darts) - 1)->>'mult') INTO v_last_dart_mult;
      RAISE NOTICE '[RPC] Double required, last dart mult: %', v_last_dart_mult;
      
      -- Check if last dart is a double
      IF v_last_dart_mult IN ('D', 'DB') THEN
        v_is_checkout := true;
        v_leg_won := true;
        RAISE NOTICE '[RPC] Checkout on double!';
      ELSE
        -- Not a double - this shouldn't happen if frontend validated correctly
        RAISE NOTICE '[RPC] ERROR: Reached 0 but not on a double!';
        v_new_remaining := v_current_remaining; -- Treat as bust
      END IF;
    ELSE
      -- Double not required
      v_is_checkout := true;
      v_leg_won := true;
      RAISE NOTICE '[RPC] Checkout (double not required)!';
    END IF;
    
    -- Calculate new leg counts if leg won
    IF v_leg_won THEN
      v_new_p1_legs := COALESCE(v_room.player1_legs, 0) + CASE WHEN v_is_player1 THEN 1 ELSE 0 END;
      v_new_p2_legs := COALESCE(v_room.player2_legs, 0) + CASE WHEN NOT v_is_player1 THEN 1 ELSE 0 END;
      
      RAISE NOTICE '[RPC] Leg won - P1: %, P2: %, ToWin: %', v_new_p1_legs, v_new_p2_legs, v_room.legs_to_win;
      
      -- Check if match is won
      IF v_new_p1_legs >= v_room.legs_to_win OR v_new_p2_legs >= v_room.legs_to_win THEN
        v_match_won := true;
        RAISE NOTICE '[RPC] MATCH WON!';
      END IF;
    END IF;
  END IF;
  
  -- Count darts
  v_darts_thrown := COALESCE(jsonb_array_length(p_darts), 0);
  
  -- Count doubles
  BEGIN
    v_darts_at_double := (
      SELECT COUNT(*) 
      FROM jsonb_to_recordset(p_darts) AS x(mult TEXT) 
      WHERE x.mult IN ('D', 'DB')
    );
  EXCEPTION WHEN OTHERS THEN
    v_darts_at_double := 0;
  END;
  
  -- Get next turn number for this player in this leg
  SELECT COALESCE(MAX(turn_no), 0) + 1 INTO v_turn_no
  FROM public.quick_match_visits
  WHERE room_id = p_room_id 
  AND player_id = v_player_id
  AND leg = v_room.current_leg;
  
  RAISE NOTICE '[RPC] Inserting visit - Leg: %, Turn: %, Checkout: %', v_room.current_leg, v_turn_no, v_is_checkout;
  
  -- Insert visit
  INSERT INTO public.quick_match_visits (
    room_id,
    player_id,
    leg,
    turn_no,
    score,
    remaining_before,
    remaining_after,
    darts,
    darts_thrown,
    darts_at_double,
    is_bust,
    is_checkout,
    bust_reason
  ) VALUES (
    p_room_id,
    v_player_id,
    v_room.current_leg,
    v_turn_no,
    CASE WHEN p_is_bust THEN 0 ELSE p_score END,
    v_current_remaining,
    v_new_remaining,
    p_darts,
    v_darts_thrown,
    v_darts_at_double,
    p_is_bust,
    v_is_checkout,
    CASE 
      WHEN p_is_bust AND v_current_remaining - p_score < 0 THEN 'Bust'
      WHEN p_is_bust AND v_current_remaining - p_score = 1 THEN 'Cannot finish on 1'
      ELSE NULL
    END
  );
  
  -- Update room state
  IF v_leg_won AND NOT v_match_won THEN
    RAISE NOTICE '[RPC] Updating room - Next leg starting';
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      current_leg = v_room.current_leg + 1,
      player1_remaining = CASE WHEN v_is_player1 THEN v_room.game_mode ELSE v_room.player1_remaining END,
      player2_remaining = CASE WHEN NOT v_is_player1 THEN v_room.game_mode ELSE v_room.player2_remaining END,
      current_turn = CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END
    WHERE id = p_room_id;
  ELSIF v_match_won THEN
    RAISE NOTICE '[RPC] Updating room - Match finished';
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      winner_id = v_player_id,
      status = 'finished'
    WHERE id = p_room_id;
  ELSE
    RAISE NOTICE '[RPC] Updating room - Normal turn';
    UPDATE public.match_rooms SET
      player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE v_room.player1_remaining END,
      player2_remaining = CASE WHEN NOT v_is_player1 THEN v_new_remaining ELSE v_room.player2_remaining END,
      current_turn = CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END
    WHERE id = p_room_id;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'remaining_after', v_new_remaining,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'player1_legs', COALESCE(v_new_p1_legs, v_room.player1_legs),
    'player2_legs', COALESCE(v_new_p2_legs, v_room.player2_legs),
    'winner_id', CASE WHEN v_match_won THEN v_player_id ELSE NULL END
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN) TO anon;
