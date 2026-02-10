-- Fix function overloading issue by dropping all versions and creating a clean one

-- Step 1: Drop ALL overloaded versions of the function
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT oid::regprocedure as func_signature
    FROM pg_proc 
    WHERE proname = 'rpc_quick_match_submit_visit_v3'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_record.func_signature);
  END LOOP;
END $$;

-- Step 2: Create a fresh function with the EXACT signature the frontend expects
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
  v_new_leg INTEGER;
  v_new_p1_legs INTEGER;
  v_new_p2_legs INTEGER;
  v_turn_no INTEGER;
  v_darts_thrown INTEGER;
  v_darts_at_double INTEGER;
BEGIN
  -- Get current user
  v_player_id := auth.uid();
  
  -- Get room data
  SELECT * INTO v_room 
  FROM public.match_rooms 
  WHERE id = p_room_id 
  FOR UPDATE;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Verify it's the player's turn
  IF v_room.current_turn != v_player_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not your turn');
  END IF;
  
  v_is_player1 := (v_player_id = v_room.player1_id);
  v_current_remaining := CASE WHEN v_is_player1 THEN v_room.player1_remaining ELSE v_room.player2_remaining END;
  
  -- Calculate new remaining
  IF p_is_bust THEN
    v_new_remaining := v_current_remaining;
  ELSE
    v_new_remaining := v_current_remaining - p_score;
  END IF;
  
  -- Check for checkout (winning the leg)
  IF v_new_remaining = 0 AND NOT p_is_bust THEN
    v_is_checkout := true;
    v_leg_won := true;
    
    -- Calculate new leg counts
    v_new_p1_legs := COALESCE(v_room.player1_legs, 0) + CASE WHEN v_is_player1 THEN 1 ELSE 0 END;
    v_new_p2_legs := COALESCE(v_room.player2_legs, 0) + CASE WHEN NOT v_is_player1 THEN 1 ELSE 0 END;
    
    -- Check if match is won
    IF v_new_p1_legs >= v_room.legs_to_win OR v_new_p2_legs >= v_room.legs_to_win THEN
      v_match_won := true;
    END IF;
  END IF;
  
  -- Count darts
  v_darts_thrown := COALESCE(jsonb_array_length(p_darts), 0);
  
  -- Count doubles (safer version)
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
    -- Leg won but match continues - advance to next leg
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      current_leg = v_room.current_leg + 1,
      player1_remaining = CASE WHEN v_is_player1 THEN v_room.game_mode ELSE v_room.player1_remaining END,
      player2_remaining = CASE WHEN NOT v_is_player1 THEN v_room.game_mode ELSE v_room.player2_remaining END,
      current_turn = CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END
    WHERE id = p_room_id;
  ELSIF v_match_won THEN
    -- Match won - mark as finished
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      winner_id = v_player_id,
      status = 'finished'
    WHERE id = p_room_id;
  ELSE
    -- Normal turn - just update remaining and switch turn
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
