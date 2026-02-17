-- ============================================
-- SEPARATE ATC SIGNALING FROM 301/501
-- ============================================
-- Problem: Both game modes use match_signals with different schemas
-- Solution: Create separate atc_match_signals table for ATC
-- ============================================

-- ============================================
-- STEP 1: Ensure match_signals is for 301/501 ONLY
-- ============================================

-- Drop any conflicting columns that may have been added for ATC
ALTER TABLE match_signals DROP COLUMN IF EXISTS match_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS sender_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS recipient_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS signal_type;
ALTER TABLE match_signals DROP COLUMN IF EXISTS signal_data;

-- Ensure match_signals has the correct columns for 301/501
-- (room_id, from_user_id, to_user_id, type, payload)

-- ============================================
-- STEP 2: Create NEW atc_match_signals table
-- ============================================

DROP TABLE IF EXISTS atc_match_signals;

CREATE TABLE atc_match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  recipient_id UUID,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice')),
  signal_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ATC signals
CREATE INDEX idx_atc_match_signals_match_id ON atc_match_signals(match_id);
CREATE INDEX idx_atc_match_signals_sender ON atc_match_signals(sender_id);
CREATE INDEX idx_atc_match_signals_recipient ON atc_match_signals(recipient_id);
CREATE INDEX idx_atc_match_signals_created ON atc_match_signals(created_at);

-- Enable RLS
ALTER TABLE atc_match_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ATC
DROP POLICY IF EXISTS "ATC signals viewable by participants" ON atc_match_signals;
CREATE POLICY "ATC signals viewable by participants"
  ON atc_match_signals FOR SELECT
  USING (
    sender_id = auth.uid() OR 
    recipient_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM atc_matches m
      WHERE m.id = atc_match_signals.match_id
      AND (m.players @> jsonb_build_array(jsonb_build_object('id', auth.uid())))
    )
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

-- Enable realtime for ATC
ALTER PUBLICATION supabase_realtime ADD TABLE atc_match_signals;

-- ============================================
-- STEP 3: RPC function for ATC signals
-- ============================================

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
  -- Get current user
  v_sender_id := auth.uid();
  
  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  
  -- Insert the signal
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

-- ============================================
-- STEP 4: Cleanup function for old ATC signals
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_atc_signals()
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
  EXECUTE FUNCTION cleanup_old_atc_signals();

-- ============================================
-- DONE!
-- ============================================
SELECT 
  'match_signals preserved for 301/501' as status_301_501,
  'atc_match_signals created for ATC' as status_atc;
