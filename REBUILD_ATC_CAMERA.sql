-- ============================================================================
-- REBUILD ATC CAMERA SIGNALING
-- ============================================================================
-- Simplify: Broadcast signals to all players in the match

-- 1. Drop and recreate atc_match_signals table
-- ============================================================================
DROP TABLE IF EXISTS atc_match_signals CASCADE;

CREATE TABLE atc_match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice')),
  signal_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_atc_signals_match_id ON atc_match_signals(match_id);
CREATE INDEX idx_atc_signals_sender ON atc_match_signals(sender_id);
CREATE INDEX idx_atc_signals_created ON atc_match_signals(created_at);

-- Enable RLS
ALTER TABLE atc_match_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies - allow all players in match to see all signals
DROP POLICY IF EXISTS "ATC signals viewable" ON atc_match_signals;
CREATE POLICY "ATC signals viewable"
  ON atc_match_signals FOR SELECT
  USING (true); -- Allow all authenticated users to view (filtered by match_id in app)

DROP POLICY IF EXISTS "ATC signals insertable" ON atc_match_signals;
CREATE POLICY "ATC signals insertable"
  ON atc_match_signals FOR INSERT
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "ATC signals deletable" ON atc_match_signals;
CREATE POLICY "ATC signals deletable"
  ON atc_match_signals FOR DELETE
  USING (sender_id = auth.uid());

-- Enable realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE atc_match_signals;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE atc_match_signals;
END $$;

-- 2. Simplified RPC function - no recipient_id, broadcast to all
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_send_atc_signal(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION rpc_send_atc_signal(
  p_match_id UUID,
  p_recipient_id UUID,  -- Kept for backwards compatibility, but ignored
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
    signal_type,
    signal_data
  ) VALUES (
    p_match_id,
    v_sender_id,
    p_signal_type,
    p_signal_data
  );
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION rpc_send_atc_signal(UUID, UUID, TEXT, JSONB) TO authenticated;

-- 3. Cleanup old signals
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

-- 4. Verify setup
-- ============================================================================
SELECT 
  'ATC signaling rebuilt' as status,
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename = 'atc_match_signals') as realtime_enabled;
