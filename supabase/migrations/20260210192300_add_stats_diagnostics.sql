-- Add diagnostics and fix potential stats recording issues

-- Create a function to check if stats were recorded for both players
CREATE OR REPLACE FUNCTION public.fn_check_match_stats_status(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_p1_stats RECORD;
  v_p2_stats RECORD;
BEGIN
  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- Check stats for player 1
  SELECT * INTO v_p1_stats 
  FROM public.match_history 
  WHERE room_id = p_room_id AND user_id = v_room.player1_id;

  -- Check stats for player 2
  SELECT * INTO v_p2_stats 
  FROM public.match_history 
  WHERE room_id = p_room_id AND user_id = v_room.player2_id;

  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'player1_id', v_room.player1_id,
    'player2_id', v_room.player2_id,
    'winner_id', v_room.winner_id,
    'player1_stats_recorded', v_p1_stats IS NOT NULL,
    'player2_stats_recorded', v_p2_stats IS NOT NULL,
    'player1_stats', to_jsonb(v_p1_stats),
    'player2_stats', to_jsonb(v_p2_stats)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_check_match_stats_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_match_stats_status(UUID) TO service_role;

-- Ensure match_history has all necessary indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_history_room_user ON public.match_history(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON public.match_history(user_id);

-- Create a view to see all match stats for debugging
CREATE OR REPLACE VIEW public.v_match_stats_summary AS
SELECT 
  mr.id as room_id,
  mr.status as room_status,
  mr.player1_id,
  p1.username as player1_username,
  mr.player2_id,
  p2.username as player2_username,
  mr.winner_id,
  w.username as winner_username,
  mr.player1_legs,
  mr.player2_legs,
  mr.current_leg,
  mr.coin_toss_winner_id,
  mr.coin_toss_completed,
  mh1.id as p1_history_id,
  mh1.result as p1_result,
  mh1.three_dart_avg as p1_avg,
  mh2.id as p2_history_id,
  mh2.result as p2_result,
  mh2.three_dart_avg as p2_avg,
  (SELECT COUNT(*) FROM public.quick_match_visits v WHERE v.room_id = mr.id AND v.player_id = mr.player1_id) as p1_visits,
  (SELECT COUNT(*) FROM public.quick_match_visits v WHERE v.room_id = mr.id AND v.player_id = mr.player2_id) as p2_visits
FROM public.match_rooms mr
LEFT JOIN public.profiles p1 ON p1.user_id = mr.player1_id
LEFT JOIN public.profiles p2 ON p2.user_id = mr.player2_id
LEFT JOIN public.profiles w ON w.user_id = mr.winner_id
LEFT JOIN public.match_history mh1 ON mh1.room_id = mr.id AND mh1.user_id = mr.player1_id
LEFT JOIN public.match_history mh2 ON mh2.room_id = mr.id AND mh2.user_id = mr.player2_id;

COMMENT ON VIEW public.v_match_stats_summary IS 'Summary view for debugging match stats recording issues';

-- Ensure the view is accessible
GRANT SELECT ON public.v_match_stats_summary TO authenticated;
GRANT SELECT ON public.v_match_stats_summary TO service_role;
