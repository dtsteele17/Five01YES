-- =======================================================
-- DEBUG TOURNAMENT INSERT ISSUE - FIXED FOR SUPABASE
-- =======================================================

-- Check tournaments table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'tournaments' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check RLS policies on tournaments
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'tournaments';

-- Check what status values are actually allowed
SELECT DISTINCT status FROM tournaments ORDER BY status;

-- Check constraints that might be failing
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'tournaments';

-- Test current user permissions
SELECT 
    current_user,
    session_user,
    current_database(),
    auth.uid() as auth_user_id;

-- Test a simple insert to see what fails (commented out to avoid duplicate data)
/*
INSERT INTO tournaments (
  name,
  description,
  start_at,
  max_participants,
  round_scheduling,
  entry_type,
  game_mode,
  legs_per_match,
  double_out,
  status,
  created_by
) VALUES (
  'Test Tournament',
  null,
  '2026-02-26T18:00:00.000Z',
  16,
  'one_day',
  'open',
  501,
  5,
  true,
  'scheduled',
  auth.uid()
);
*/