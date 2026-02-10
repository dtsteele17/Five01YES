-- Migration: Add first 9 dart average tracking and match won signal support

-- Add columns to track first 9 dart average per player per match
ALTER TABLE public.match_rooms
ADD COLUMN IF NOT EXISTS player1_first9_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player1_first9_darts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_first9_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_first9_darts INTEGER DEFAULT 0;

-- Add signal type for match_won (if not exists)
DO $$
BEGIN
  -- Check if the constraint exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'match_signals_type_check' 
    AND table_name = 'match_signals'
  ) THEN
    -- Drop existing constraint
    ALTER TABLE public.match_signals DROP CONSTRAINT match_signals_type_check;
  END IF;
  
  -- Add new constraint with match_won included
  ALTER TABLE public.match_signals 
  ADD CONSTRAINT match_signals_type_check 
  CHECK (type IN ('forfeit', 'rematch_ready', 'rematch_start', 'match_won'));
END $$;

-- Function to handle leg win with proper leg tracking
CREATE OR REPLACE FUNCTION public.fn_handle_leg_win_v2(
  p_room_id UUID, 
  p_winner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_new_p1_legs INTEGER;
  v_new_p2_legs INTEGER;
  v_legs_to_win INTEGER;
  v_match_won BOOLEAN := false;
BEGIN
  -- Get room with lock
  SELECT * INTO v_room 
  FROM public.match_rooms 
  WHERE id = p_room_id 
  FOR UPDATE;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  v_is_player1 := (p_winner_id = v_room.player1_id);
  v_legs_to_win := COALESCE(v_room.legs_to_win, 1);
  
  -- Calculate new leg counts
  v_new_p1_legs := COALESCE(v_room.player1_legs, 0) + CASE WHEN v_is_player1 THEN 1 ELSE 0 END;
  v_new_p2_legs := COALESCE(v_room.player2_legs, 0) + CASE WHEN NOT v_is_player1 THEN 1 ELSE 0 END;
  
  -- Check if match is won
  IF v_new_p1_legs >= v_legs_to_win OR v_new_p2_legs >= v_legs_to_win THEN
    v_match_won := true;
  END IF;
  
  -- Update room
  UPDATE public.match_rooms SET 
    player1_legs = v_new_p1_legs,
    player2_legs = v_new_p2_legs,
    winner_id = CASE WHEN v_match_won THEN p_winner_id ELSE v_room.winner_id END,
    status = CASE WHEN v_match_won THEN 'finished' ELSE v_room.status END,
    -- Reset for next leg if match not won
    current_leg = CASE WHEN v_match_won THEN v_room.current_leg ELSE v_room.current_leg + 1 END,
    player1_remaining = CASE WHEN v_match_won THEN v_room.player1_remaining ELSE v_room.game_mode END,
    player2_remaining = CASE WHEN v_match_won THEN v_room.player2_remaining ELSE v_room.game_mode END,
    current_turn = CASE 
      WHEN v_match_won THEN v_room.current_turn 
      -- Alternate who starts next leg (loser starts next leg in darts)
      ELSE CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END
    END
  WHERE id = p_room_id;
  
  RETURN jsonb_build_object(
    'ok', true, 
    'match_won', v_match_won,
    'player1_legs', v_new_p1_legs,
    'player2_legs', v_new_p2_legs,
    'new_leg', CASE WHEN v_match_won THEN v_room.current_leg ELSE v_room.current_leg + 1 END
  );
END;
$$;

-- Function to calculate first 9 dart average from visits
CREATE OR REPLACE FUNCTION public.fn_calculate_first9_average(
  p_room_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_total_score INTEGER := 0;
  v_total_darts INTEGER := 0;
  v_visit RECORD;
  v_darts_count INTEGER := 0;
BEGIN
  -- Get room
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Get all visits for this player, ordered by leg and turn
  FOR v_visit IN 
    SELECT score, darts_thrown 
    FROM public.quick_match_visits 
    WHERE room_id = p_room_id 
    AND player_id = p_player_id
    AND is_bust = false
    ORDER BY leg, turn_no
  LOOP
    -- Add this visit's darts
    v_total_score := v_total_score + v_visit.score;
    v_total_darts := v_total_darts + v_visit.darts_thrown;
    v_darts_count := v_darts_count + v_visit.darts_thrown;
    
    -- Stop after 9 darts
    IF v_darts_count >= 9 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'ok', true,
    'total_score', v_total_score,
    'total_darts', v_total_darts,
    'first9_average', CASE WHEN v_total_darts > 0 THEN (v_total_score::FLOAT / v_total_darts) * 3 ELSE 0 END
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fn_handle_leg_win_v2(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_handle_leg_win_v2(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_calculate_first9_average(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calculate_first9_average(UUID, UUID) TO anon;
