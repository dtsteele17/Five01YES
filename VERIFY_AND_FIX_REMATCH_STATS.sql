-- ============================================================================
-- VERIFY REMAATCH AND STATS RECORDING
-- Run this in Supabase SQL Editor to verify/fix the systems
-- ============================================================================

-- ============================================================================
-- 1. VERIFY REMAATCH SYSTEM
-- ============================================================================

-- Check the rematch requests table structure
SELECT 
  'quick_match_rematch_requests columns' as check_type,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'quick_match_rematch_requests'
ORDER BY ordinal_position;

-- Check recent rematch requests
SELECT 
  'Recent rematch requests' as check_type,
  id,
  original_room_id,
  player1_ready,
  player2_ready,
  status,
  new_room_id,
  created_at
FROM quick_match_rematch_requests
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- 2. VERIFY STATS RECORDING
-- ============================================================================

-- Check match_history has opponent stats columns
SELECT 
  'Opponent stats columns' as check_type,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'match_history' 
  AND column_name LIKE 'opponent_%'
ORDER BY column_name;

-- Check recent match history records with opponent stats
SELECT 
  'Recent matches with opponent stats' as check_type,
  mh.id,
  mh.room_id,
  mh.user_id,
  mh.opponent_id,
  mh.result,
  mh.three_dart_avg as my_avg,
  mh.opponent_three_dart_avg as opp_avg,
  mh.legs_won,
  mh.legs_lost,
  mh.played_at
FROM match_history mh
ORDER BY mh.played_at DESC
LIMIT 10;

-- ============================================================================
-- 3. CHECK FOR MATCHES MISSING OPPONENT STATS
-- ============================================================================
SELECT 
  'Matches missing opponent stats' as check_type,
  COUNT(*) as count
FROM match_history
WHERE opponent_three_dart_avg IS NULL OR opponent_three_dart_avg = 0
  AND played_at > NOW() - INTERVAL '7 days';

-- Show specific matches missing opponent stats
SELECT 
  id,
  room_id,
  user_id,
  opponent_id,
  result,
  three_dart_avg,
  opponent_three_dart_avg,
  played_at
FROM match_history
WHERE (opponent_three_dart_avg IS NULL OR opponent_three_dart_avg = 0)
  AND played_at > NOW() - INTERVAL '7 days'
ORDER BY played_at DESC
LIMIT 10;

-- ============================================================================
-- 4. TEST FUNCTIONS (Uncomment to run)
-- ============================================================================

-- Test the rematch status function (replace with actual room_id)
-- SELECT get_rematch_status('your-room-id-here'::UUID);

-- Test the stats recording function (replace with actual values)
-- This would create test records - use with caution
/*
SELECT fn_record_quick_match_complete(
  'your-room-id-here'::UUID,
  'winner-user-id'::UUID,
  'loser-user-id'::UUID,
  3,  -- winner legs
  1,  -- loser legs
  501 -- game mode
);
*/

-- ============================================================================
-- 5. FIX ANY ISSUES
-- ============================================================================

-- If you find matches with missing opponent stats, you can backfill them:
/*
DO $$
DECLARE
  v_record RECORD;
  v_opp_avg DECIMAL(5,2);
  v_opp_first9_avg DECIMAL(5,2);
  v_opp_highest_checkout INTEGER;
  v_opp_checkout_pct DECIMAL(5,2);
  v_opp_darts INTEGER;
  v_opp_100_plus INTEGER;
  v_opp_140_plus INTEGER;
  v_opp_180s INTEGER;
BEGIN
  FOR v_record IN 
    SELECT DISTINCT room_id, user_id, opponent_id, game_mode
    FROM match_history
    WHERE played_at > NOW() - INTERVAL '7 days'
      AND (opponent_three_dart_avg IS NULL OR opponent_three_dart_avg = 0)
      AND match_format = 'quick'
    LIMIT 100
  LOOP
    -- Calculate opponent stats from visits
    SELECT 
      COALESCE(ROUND(((SUM(score)::DECIMAL / NULLIF(SUM(COALESCE(darts_thrown, 3)), 0)) * 3)::DECIMAL, 2), 0),
      COALESCE(MAX(CASE WHEN is_checkout THEN score ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN score >= 100 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN score >= 140 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN score >= 180 THEN 1 ELSE 0 END), 0)
    INTO v_opp_avg, v_opp_highest_checkout, v_opp_100_plus, v_opp_140_plus, v_opp_180s
    FROM quick_match_visits
    WHERE room_id = v_record.room_id 
      AND player_id = v_record.opponent_id
      AND (is_bust = false OR is_bust IS NULL);
    
    -- Update the record with calculated opponent stats
    IF v_opp_avg > 0 THEN
      UPDATE match_history
      SET opponent_three_dart_avg = v_opp_avg,
          opponent_highest_checkout = v_opp_highest_checkout,
          opponent_visits_100_plus = v_opp_100_plus,
          opponent_visits_140_plus = v_opp_140_plus,
          opponent_visits_180 = v_opp_180s
      WHERE room_id = v_record.room_id 
        AND user_id = v_record.user_id;
        
      RAISE NOTICE 'Updated match % with opponent avg %', v_record.room_id, v_opp_avg;
    END IF;
  END LOOP;
END $$;
*/

-- ============================================================================
-- 6. SUMMARY
-- ============================================================================
SELECT 
  'SUMMARY' as section,
  (SELECT COUNT(*) FROM quick_match_rematch_requests) as total_rematch_requests,
  (SELECT COUNT(*) FROM quick_match_rematch_requests WHERE status = 'created') as completed_remastechs,
  (SELECT COUNT(*) FROM match_history WHERE played_at > NOW() - INTERVAL '1 day') as matches_today,
  (SELECT COUNT(*) FROM match_history 
   WHERE played_at > NOW() - INTERVAL '1 day' 
   AND opponent_three_dart_avg > 0) as matches_with_opp_stats_today;
