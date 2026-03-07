-- DEBUG: Test if functions exist
-- Run this in Supabase SQL Editor to check if the functions were created

-- 1. Check if the functions exist
SELECT routine_name, routine_type, routine_schema
FROM information_schema.routines 
WHERE routine_name IN (
  'rpc_play_weekend_event',
  'rpc_complete_career_match', 
  'rpc_get_week_fixtures_with_match_lock',
  'rpc_career_tournament_choice'
)
ORDER BY routine_name;

-- 2. Test simple function call (this should return an error message about career not found)
SELECT rpc_play_weekend_event('00000000-0000-0000-0000-000000000000'::UUID);