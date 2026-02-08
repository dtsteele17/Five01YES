/*
  Check which critical tables exist in your database
*/

SELECT
  table_name,
  CASE
    WHEN table_name IN ('matches', 'profiles', 'user_stats', 'player_stats',
                        'achievements_master', 'user_achievements',
                        'match_players', 'match_visits')
    THEN '✓ Found'
    ELSE 'Other'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'matches', 'profiles', 'user_stats', 'player_stats',
    'achievements_master', 'user_achievements',
    'match_players', 'match_visits', 'match_legs',
    'match_stats', 'match_rooms', 'quick_match_lobbies'
  )
ORDER BY table_name;

-- Also check if matches exists but might be a view
SELECT
  'Views:' as type,
  table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE '%match%';
