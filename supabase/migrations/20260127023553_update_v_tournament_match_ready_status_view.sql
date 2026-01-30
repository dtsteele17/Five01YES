/*
  # Update v_tournament_match_ready_status View

  1. Changes
    - Add opponent information (username, avatar_url) to the view
    - Add tournament name for display
    - Ensure all needed fields are available for the UI

  2. Purpose
    - Provide complete match information for the ready modal
    - Show opponent details and tournament context
*/

DROP VIEW IF EXISTS v_tournament_match_ready_status CASCADE;

CREATE VIEW v_tournament_match_ready_status AS
SELECT 
  tm.id AS match_id,
  tm.tournament_id,
  tm.round,
  tm.match_index,
  tm.player1_id,
  tm.player2_id,
  tm.status,
  tm.match_room_id,
  tm.ready_open_at,
  tm.ready_deadline,
  t.name AS tournament_name,
  (SELECT COUNT(*)::integer FROM tournament_match_ready r WHERE r.match_id = tm.id) AS ready_count,
  EXISTS(SELECT 1 FROM tournament_match_ready r2 WHERE r2.match_id = tm.id AND r2.user_id = auth.uid()) AS my_ready,
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
  END AS opponent_avatar_url
FROM public.tournament_matches tm
JOIN public.tournaments t ON tm.tournament_id = t.id
LEFT JOIN public.profiles p1 ON tm.player1_id = p1.user_id
LEFT JOIN public.profiles p2 ON tm.player2_id = p2.user_id;

GRANT SELECT ON v_tournament_match_ready_status TO authenticated;
