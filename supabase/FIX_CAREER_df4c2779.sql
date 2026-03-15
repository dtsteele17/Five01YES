-- Fix career df4c2779-1437-49e2-9778-6160d16cfe23 (T2 Pub Leagues, endlessly loading)
-- Diagnose first

-- 1. Check current state
SELECT id, tier, season, day, week, status FROM career_profiles WHERE id = 'df4c2779-1437-49e2-9778-6160d16cfe23';

-- 2. Check events
SELECT id, season, sequence_no, event_type, event_name, status, day, format_legs, bracket_size
FROM career_events 
WHERE career_id = 'df4c2779-1437-49e2-9778-6160d16cfe23'
ORDER BY season, sequence_no;

-- 3. Check standings
SELECT * FROM career_league_standings 
WHERE career_id = 'df4c2779-1437-49e2-9778-6160d16cfe23'
ORDER BY season, is_player DESC, points DESC;

-- 4. Check opponents
SELECT id, first_name, last_name, tier, skill_rating FROM career_opponents 
WHERE career_id = 'df4c2779-1437-49e2-9778-6160d16cfe23' AND tier = 2;

-- 5. Check what the home RPC returns
SELECT * FROM rpc_get_career_home_with_season_end_locked_fixed_v3('df4c2779-1437-49e2-9778-6160d16cfe23');
