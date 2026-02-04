-- ============================================================
-- INSPECT SUPABASE STATE
-- Check what functions exist and if there are conflicts
-- ============================================================

-- 1. Check all ready_up_tournament_match functions
SELECT 
  proname,
  pg_get_function_identity_arguments(oid) as arguments,
  pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'ready_up_tournament_match'
ORDER BY oid DESC;

-- 2. Check if online_matches table exists
SELECT 
  table_name,
  table_schema
FROM information_schema.tables
WHERE table_name IN ('online_matches', 'match_rooms')
ORDER BY table_name;

-- 3. Check tournament_match_ready table structure
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tournament_match_ready'
ORDER BY ordinal_position;

-- 4. Check all triggers on tournament_match_ready
SELECT 
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'tournament_match_ready';

-- 5. Check RLS policies on tournament_match_ready
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'tournament_match_ready';
