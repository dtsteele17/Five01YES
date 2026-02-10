-- ============================================
-- VERIFY STATS FILTERING IS WORKING
-- Run this to test your stats are filtering correctly
-- ============================================

-- 1. Check what match formats exist in your data
SELECT 'Match Formats in your data:' as info;
SELECT DISTINCT match_format, COUNT(*) as count
FROM public.match_history
GROUP BY match_format;

-- 2. Check what game modes exist
SELECT 'Game Modes in your data:' as info;
SELECT DISTINCT game_mode, COUNT(*) as count
FROM public.match_history
GROUP BY game_mode;

-- 3. Test filtered stats for a specific user (replace with your user_id)
-- SELECT * FROM fn_get_filtered_player_stats('YOUR-USER-ID-HERE', 501, 'quick');

-- 4. Verify the unique constraint is working
SELECT 'Unique constraint check:' as info;
SELECT 
  room_id, 
  user_id, 
  COUNT(*) as count
FROM public.match_history
GROUP BY room_id, user_id
HAVING COUNT(*) > 1;

-- Should return 0 rows if no duplicates

-- 5. Summary of stats by filter combination
SELECT 'Stats summary by filter combination:' as info;
SELECT 
  game_mode,
  match_format,
  COUNT(*) as total_matches,
  ROUND(AVG(three_dart_avg), 2) as avg_avg,
  MAX(highest_checkout) as max_checkout
FROM public.match_history
GROUP BY game_mode, match_format
ORDER BY game_mode, match_format;

-- 6. Test case: Show how filtering works
-- This simulates what the stats page does
SELECT 'Example: 501 Quick Match stats (what you see when filtering 501 + Quick):' as info;
SELECT 
  COUNT(*) as total_matches,
  COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
  COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
  ROUND(((SUM(total_score)::DECIMAL / NULLIF(SUM(darts_thrown), 0)) * 3), 2) as avg_3dart,
  MAX(highest_checkout) as highest_checkout
FROM public.match_history
WHERE game_mode = 501 AND match_format = 'quick';

SELECT 'Done! If no errors above, filtering is working correctly.' as status;
