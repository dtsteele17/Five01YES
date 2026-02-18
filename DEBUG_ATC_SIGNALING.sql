-- ============================================================================
-- DEBUG ATC SIGNALING
-- Run this to check if signals are being stored and received
-- ============================================================================

-- 1. Check if atc_match_signals table exists and has data
-- ============================================================================
SELECT 
  'Table exists' as check_type,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'atc_match_signals'
  ) as result;

-- 2. Check table structure
-- ============================================================================
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'atc_match_signals'
ORDER BY ordinal_position;

-- 3. Check if realtime is enabled
-- ============================================================================
SELECT 
  'Realtime enabled' as check_type,
  EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) as result;

-- 4. Check RLS policies
-- ============================================================================
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'atc_match_signals';

-- 5. Check recent signals (replace with actual match_id if known)
-- ============================================================================
SELECT 
  id,
  match_id,
  sender_id,
  recipient_id,
  signal_type,
  created_at,
  age(NOW(), created_at) as age
FROM atc_match_signals
WHERE created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 20;

-- 6. Count signals by match
-- ============================================================================
SELECT 
  match_id,
  COUNT(*) as signal_count,
  COUNT(DISTINCT sender_id) as unique_senders,
  MAX(created_at) as last_signal
FROM atc_match_signals
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY match_id
ORDER BY last_signal DESC;

-- 7. Check if RPC function exists
-- ============================================================================
SELECT 
  'RPC function exists' as check_type,
  EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'rpc_send_atc_signal'
  ) as result;

-- 8. Fix: Re-enable realtime if not enabled
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE atc_match_signals;
    RAISE NOTICE 'Added atc_match_signals to realtime publication';
  ELSE
    RAISE NOTICE 'atc_match_signals already in realtime publication';
  END IF;
END $$;

-- 9. Test: Insert a test signal (will be cleaned up)
-- Uncomment and run with actual IDs to test
/*
INSERT INTO atc_match_signals (match_id, sender_id, recipient_id, signal_type, signal_data)
VALUES (
  'YOUR_MATCH_ID'::UUID,
  'SENDER_ID'::UUID,
  'RECIPIENT_ID'::UUID,
  'offer',
  '{"test": true}'::jsonb
);
*/

-- 10. Clean up old test signals
-- ============================================================================
DELETE FROM atc_match_signals
WHERE signal_data->>'test' = 'true'
   OR created_at < NOW() - INTERVAL '1 hour';

SELECT 'ATC signaling debug complete' as status;
