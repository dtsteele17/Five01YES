-- =======================================================
-- DEBUG TOURNAMENT INSERT ISSUE
-- =======================================================

-- Check if tournaments table exists and has correct structure
\d tournaments;

-- Check RLS policies on tournaments
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'tournaments';

-- Test a simple insert to see what fails
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
  'registration',
  '5010a7f4-54e3-44a5-8746-ce1aba9ed83d'
);

-- Check what status values are actually allowed
SELECT DISTINCT status FROM tournaments ORDER BY status;