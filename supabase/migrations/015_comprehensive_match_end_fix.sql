-- Comprehensive fix for match end detection and popup issues

-- 1. Ensure all necessary columns exist with proper defaults
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS player1_legs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_legs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS double_out BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS winner_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Fix any null values
UPDATE public.match_rooms SET player1_legs = 0 WHERE player1_legs IS NULL;
UPDATE public.match_rooms SET player2_legs = 0 WHERE player2_legs IS NULL;
UPDATE public.match_rooms SET double_out = true WHERE double_out IS NULL;
UPDATE public.match_rooms SET status = 'active' WHERE status IS NULL;

-- 3. Add constraint to status column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'match_rooms_status_check'
  ) THEN
    ALTER TABLE public.match_rooms 
    ADD CONSTRAINT match_rooms_status_check 
    CHECK (status IN ('active', 'finished', 'forfeited', 'abandoned'));
  END IF;
END $$;

-- 4. Drop and recreate the RPC function with comprehensive logging
DROP FUNCTION IF EXISTS public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN);

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
  
  -- Get room data with lock
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
  
  -- Don't allow moves if match is finished
  IF v_room.status IN ('finished', 'forfeited') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Match already ended');
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
    v_require_double := COALESCE(v_room.double_out, true);
    
    IF v_require_double THEN
      -- Get last dart multiplier
      SELECT (p_darts->(jsonb_array_length(p_darts) - 1)->>'mult') INTO v_last_dart_mult;
      
      -- Check if last dart is a double
      IF v_last_dart_mult IN ('D', 'DB') THEN
        v_is_checkout := true;
        v_leg_won := true;
      ELSE
        -- Not finishing on double = bust
        v_new_remaining := v_current_remaining;
      END IF;
    ELSE
      -- Double not required
      v_is_checkout := true;
      v_leg_won := true;
    END IF;
    
    -- Calculate new leg counts if leg won
    IF v_leg_won THEN
      v_new_p1_legs := COALESCE(v_room.player1_legs, 0) + CASE WHEN v_is_player1 THEN 1 ELSE 0 END;
      v_new_p2_legs := COALESCE(v_room.player2_legs, 0) + CASE WHEN NOT v_is_player1 THEN 1 ELSE 0 END;
      
      -- Check if match is won
      IF v_new_p1_legs >= v_room.legs_to_win OR v_new_p2_legs >= v_room.legs_to_win THEN
        v_match_won := true;
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
  
  -- Get next turn number
  SELECT COALESCE(MAX(turn_no), 0) + 1 INTO v_turn_no
  FROM public.quick_match_visits
  WHERE room_id = p_room_id 
  AND player_id = v_player_id
  AND leg = v_room.current_leg;
  
  -- Insert visit
  INSERT INTO public.quick_match_visits (
    room_id, player_id, leg, turn_no, score,
    remaining_before, remaining_after, darts, darts_thrown, darts_at_double,
    is_bust, is_checkout, bust_reason
  ) VALUES (
    p_room_id, v_player_id, v_room.current_leg, v_turn_no,
    CASE WHEN p_is_bust OR (v_new_remaining = v_current_remaining AND NOT v_is_checkout) THEN 0 ELSE p_score END,
    v_current_remaining, v_new_remaining, p_darts, v_darts_thrown, v_darts_at_double,
    p_is_bust OR (v_new_remaining = v_current_remaining AND NOT v_is_checkout), v_is_checkout,
    CASE 
      WHEN p_is_bust AND v_current_remaining - p_score < 0 THEN 'Bust'
      WHEN p_is_bust AND v_current_remaining - p_score = 1 THEN 'Cannot finish on 1'
      WHEN v_new_remaining = v_current_remaining AND NOT v_is_checkout AND NOT p_is_bust THEN 'Must finish on double'
      ELSE NULL
    END
  );
  
  -- Update room state
  IF v_leg_won AND NOT v_match_won THEN
    -- Leg won, continue to next leg
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      current_leg = v_room.current_leg + 1,
      player1_remaining = v_room.game_mode,
      player2_remaining = v_room.game_mode,
      current_turn = CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END
    WHERE id = p_room_id;
  ELSIF v_match_won THEN
    -- Match won, mark as finished
    UPDATE public.match_rooms SET
      player1_legs = v_new_p1_legs,
      player2_legs = v_new_p2_legs,
      winner_id = v_player_id,
      status = 'finished'
    WHERE id = p_room_id;
  ELSE
    -- Normal turn
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_quick_match_submit_visit_v3(UUID, INTEGER, JSONB, BOOLEAN) TO anon;
