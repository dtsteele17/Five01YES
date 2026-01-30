/*
  # Fix v_my_tournament_ready View Status Filter

  1. Changes
    - Update view to filter by status='ready' instead of 'ready_check'
    - Only show matches where ready_deadline > NOW()
    - Ensure proper filtering for active ready-up matches

  2. Purpose
    - Fix tournament ready popup to only show when status is 'ready'
    - Prevent showing expired or incorrect status matches
*/

DROP VIEW IF EXISTS v_my_tournament_ready CASCADE;

CREATE VIEW v_my_tournament_ready AS
SELECT 
  tm.id AS match_id,
  tm.tournament_id,
  tm.round,
  tm.match_index,
  tm.player1_id,
  tm.player2_id,
  tm.status,
  tm.match_room_id,
  tm.playable_at AS start_time,
  tm.ready_deadline,
  tm.started_at,
  t.name AS tournament_name,
  t.game_mode,
  t.best_of,
  -- Calculate time left
  EXTRACT(EPOCH FROM (tm.ready_deadline - NOW()))::integer AS time_left_seconds,
  -- Get ready count
  (SELECT COUNT(*)::integer FROM public.tournament_match_ready tmr WHERE tmr.match_id = tm.id) AS ready_count,
  -- Get opponent info (if current user is player1, show player2, else show player1)
  CASE 
    WHEN auth.uid() = tm.player1_id THEN tm.player2_id
    WHEN auth.uid() = tm.player2_id THEN tm.player1_id
    ELSE NULL
  END AS opponent_id,
  CASE 
    WHEN auth.uid() = tm.player1_id THEN p2.username
    WHEN auth.uid() = tm.player2_id THEN p1.username
    ELSE NULL
  END AS opponent_username,
  CASE 
    WHEN auth.uid() = tm.player1_id THEN p2.avatar_url
    WHEN auth.uid() = tm.player2_id THEN p1.avatar_url
    ELSE NULL
  END AS opponent_avatar_url,
  -- Check if current user is ready
  EXISTS(
    SELECT 1 FROM public.tournament_match_ready tmr 
    WHERE tmr.match_id = tm.id AND tmr.user_id = auth.uid()
  ) AS current_user_ready
FROM public.tournament_matches tm
JOIN public.tournaments t ON tm.tournament_id = t.id
LEFT JOIN public.profiles p1 ON tm.player1_id = p1.user_id
LEFT JOIN public.profiles p2 ON tm.player2_id = p2.user_id
WHERE 
  tm.status = 'ready'
  AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
  AND tm.ready_deadline IS NOT NULL
  AND tm.ready_deadline > NOW();

GRANT SELECT ON v_my_tournament_ready TO authenticated;
