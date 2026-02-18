-- ============================================================================
-- FIX ATC CAMERA SIGNALING
-- ============================================================================
-- This ensures the atc_match_signals table is properly configured for realtime

-- 1. Ensure table exists with correct structure
-- ============================================================================
CREATE TABLE IF NOT EXISTS atc_match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  recipient_id UUID,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice')),
  signal_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
-- ============================================================================
ALTER TABLE atc_match_signals ENABLE ROW LEVEL SECURITY;

-- 3. Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_atc_match_signals_match_id ON atc_match_signals(match_id);
CREATE INDEX IF NOT EXISTS idx_atc_match_signals_sender ON atc_match_signals(sender_id);
CREATE INDEX IF NOT EXISTS idx_atc_match_signals_recipient ON atc_match_signals(recipient_id);
CREATE INDEX IF NOT EXISTS idx_atc_match_signals_created ON atc_match_signals(created_at);

-- 4. RLS Policies
-- ============================================================================
DROP POLICY IF EXISTS "ATC signals viewable by participants" ON atc_match_signals;
CREATE POLICY "ATC signals viewable by participants"
  ON atc_match_signals FOR SELECT
  USING (
    sender_id = auth.uid() OR 
    recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "ATC signals insertable by participants" ON atc_match_signals;
CREATE POLICY "ATC signals insertable by participants"
  ON atc_match_signals FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
  );

DROP POLICY IF EXISTS "ATC signals deletable by owner" ON atc_match_signals;
CREATE POLICY "ATC signals deletable by owner"
  ON atc_match_signals FOR DELETE
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- 5. Enable realtime (CRITICAL FOR SIGNALING)
-- ============================================================================
-- Remove from publication first (to avoid errors if already added)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE atc_match_signals;
  END IF;
END $$;

-- Add back to publication
ALTER PUBLICATION supabase_realtime ADD TABLE atc_match_signals;

-- 6. Verify realtime is enabled
-- ============================================================================
SELECT 
  'Realtime status for atc_match_signals:' as check_type,
  EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) as is_in_realtime;

-- 7. Create/replace the RPC function for sending signals
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_send_atc_signal(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION rpc_send_atc_signal(
  p_match_id UUID,
  p_recipient_id UUID,
  p_signal_type TEXT,
  p_signal_data JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_sender_id UUID;
BEGIN
  v_sender_id := auth.uid();
  
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  
  INSERT INTO atc_match_signals (
    match_id,
    sender_id,
    recipient_id,
    signal_type,
    signal_data
  ) VALUES (
    p_match_id,
    v_sender_id,
    p_recipient_id,
    p_signal_type,
    p_signal_data
  );
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_send_atc_signal(UUID, UUID, TEXT, JSONB) TO authenticated;

-- 8. Cleanup function for old signals
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_atc_signals()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM atc_match_signals 
  WHERE match_id = NEW.match_id 
  AND created_at < NOW() - INTERVAL '5 minutes';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_atc_signals_trigger ON atc_match_signals;
CREATE TRIGGER cleanup_atc_signals_trigger
  AFTER INSERT ON atc_match_signals
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_atc_signals();

-- 9. Test: Check recent signals
-- ============================================================================
SELECT 
  'Recent ATC signals (last 5 minutes):' as info,
  COUNT(*) as count
FROM atc_match_signals
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- 10. Verify table structure
-- ============================================================================
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'atc_match_signals'
ORDER BY ordinal_position;

SELECT 'ATC signaling fix complete!' as status;
