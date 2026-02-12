-- ============================================
-- TEST: WebRTC Signaling Setup
-- Run this to verify the signaling infrastructure is working
-- ============================================

-- 1. Verify match_signals table exists and has correct structure
SELECT 
  'Table Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'match_signals'
ORDER BY ordinal_position;

-- 2. Verify RLS is enabled
SELECT 
  'RLS Status' as check_type,
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class
WHERE relname = 'match_signals';

-- 3. List RLS policies
SELECT 
  'RLS Policies' as check_type,
  polname as policy_name,
  polpermissive as is_permissive,
  polroles::regrole[] as applies_to,
  polqual as using_expression,
  polwithcheck as with_check_expression
FROM pg_policy
WHERE polrelid = 'match_signals'::regclass;

-- 4. Verify indexes
SELECT 
  'Indexes' as check_type,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'match_signals';

-- 5. Verify realtime publication
SELECT 
  'Realtime Publication' as check_type,
  pubname,
  tablename
FROM pg_publication_tables
WHERE tablename = 'match_signals';

-- 6. Test insert permissions (as admin)
-- This will show if the table accepts inserts
DO $$
BEGIN
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'test',
    '{"test": true}'::jsonb
  );
  
  DELETE FROM match_signals 
  WHERE room_id = '00000000-0000-0000-0000-000000000000';
  
  RAISE NOTICE 'Test insert/delete successful';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Test insert failed: %', SQLERRM;
END $$;

SELECT 'WebRTC signaling setup verification complete!' as status;
