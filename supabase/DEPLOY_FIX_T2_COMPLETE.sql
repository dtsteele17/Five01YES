-- COMPLETE T2 FIX: Diagnose and fix all T2 promotion issues
-- Run this in Supabase SQL editor

-- Step 1: Show all active T2 careers and their state
SELECT 
  cp.id as career_id,
  cp.tier,
  cp.season,
  cp.day,
  (SELECT COUNT(*) FROM career_opponents co WHERE co.career_id = cp.id AND co.tier = 2) as t2_opponents,
  (SELECT COUNT(*) FROM career_league_standings ls WHERE ls.career_id = cp.id AND ls.season = cp.season AND ls.is_player = false) as standings_ai_rows,
  (SELECT COUNT(*) FROM career_league_standings ls WHERE ls.career_id = cp.id AND ls.season = cp.season AND ls.is_player = false AND ls.opponent_id IS NOT NULL) as standings_with_opponents,
  (SELECT COUNT(*) FROM career_events ce WHERE ce.career_id = cp.id AND ce.season = cp.season AND ce.status = 'pending') as pending_events
FROM career_profiles cp
WHERE cp.tier = 2 AND cp.status = 'active';

-- Step 2: Check if rpc_generate_career_opponents exists
SELECT proname, pronargs FROM pg_proc WHERE proname = 'rpc_generate_career_opponents';

-- Step 3: Check schedule templates for tier 2
SELECT * FROM career_schedule_templates WHERE tier = 2 ORDER BY sequence_no;
