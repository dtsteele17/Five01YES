-- ============================================================================
-- DIAGNOSE STATS ISSUE
-- Run this to check what's happening with stats recording
-- ============================================================================

-- Check if player_stats table exists and has data
SELECT 'player_stats table row count' as check_type, COUNT(*) as count FROM player_stats
UNION ALL
SELECT 'match_history table row count', COUNT(*) FROM match_history
UNION ALL
SELECT 'unique users in match_history', COUNT(DISTINCT user_id) FROM match_history
UNION ALL
SELECT 'unique users in player_stats', COUNT(DISTINCT user_id) FROM player_stats;

-- Check for any NULL values in player_stats that might cause issues
SELECT 
  'NULL stats in player_stats' as check_type,
  COUNT(*) as count 
FROM player_stats 
WHERE total_matches IS NULL 
   OR wins IS NULL 
   OR losses IS NULL 
   OR overall_3dart_avg IS NULL;

-- Check if functions exist
SELECT 
  'Functions exist' as check_type,
  COUNT(*) as count
FROM pg_proc 
WHERE proname IN ('fn_update_player_match_stats', 'record_dartbot_match_completion', 'update_player_stats_from_dartbot');

-- Show recent match_history entries
SELECT 
  'Recent matches' as info,
  user_id::text,
  match_format,
  result,
  three_dart_avg,
  played_at::date
FROM match_history 
ORDER BY played_at DESC 
LIMIT 5;

-- Show player_stats for users with matches but no stats
SELECT 
  'Users with matches but no stats' as info,
  mh.user_id::text,
  COUNT(mh.id) as match_count,
  COALESCE(ps.total_matches, 0) as stats_count
FROM match_history mh
LEFT JOIN player_stats ps ON mh.user_id = ps.user_id
WHERE ps.user_id IS NULL OR ps.total_matches = 0
GROUP BY mh.user_id, ps.total_matches
LIMIT 5;
