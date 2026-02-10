-- Function to debug visit data for a specific match
CREATE OR REPLACE FUNCTION public.debug_match_visits(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_p1_visits INTEGER;
  v_p2_visits INTEGER;
  v_p1_checkouts INTEGER;
  v_p2_checkouts INTEGER;
  v_p1_highest_checkout INTEGER;
  v_p2_highest_checkout INTEGER;
  v_result JSONB;
BEGIN
  -- Get room info
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;
  
  -- Count visits per player
  SELECT COUNT(*) INTO v_p1_visits 
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player1_id;
  
  SELECT COUNT(*) INTO v_p2_visits 
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player2_id;
  
  -- Count checkouts per player
  SELECT COUNT(*) INTO v_p1_checkouts 
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player1_id AND is_checkout = TRUE;
  
  SELECT COUNT(*) INTO v_p2_checkouts 
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player2_id AND is_checkout = TRUE;
  
  -- Get highest checkout per player
  SELECT COALESCE(MAX(score), 0) INTO v_p1_highest_checkout
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player1_id AND is_checkout = TRUE;
  
  SELECT COALESCE(MAX(score), 0) INTO v_p2_highest_checkout
  FROM public.quick_match_visits 
  WHERE room_id = p_room_id AND player_id = v_room.player2_id AND is_checkout = TRUE;
  
  -- Get sample of recent visits
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'player_id', player_id,
      'leg', leg,
      'score', score,
      'is_checkout', is_checkout,
      'darts_thrown', darts_thrown,
      'created_at', created_at
    )
  ) INTO v_result
  FROM (
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id 
    ORDER BY created_at DESC 
    LIMIT 10
  ) t;
  
  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'player1_id', v_room.player1_id,
    'player2_id', v_room.player2_id,
    'p1_visits', v_p1_visits,
    'p2_visits', v_p2_visits,
    'p1_checkouts', v_p1_checkouts,
    'p2_checkouts', v_p2_checkouts,
    'p1_highest_checkout', v_p1_highest_checkout,
    'p2_highest_checkout', v_p2_highest_checkout,
    'recent_visits', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_match_visits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_match_visits(UUID) TO service_role;

COMMENT ON FUNCTION public.debug_match_visits IS 'Debug function to check visit data integrity for a match';
