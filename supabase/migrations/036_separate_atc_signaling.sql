-- ============================================
-- Migration: Separate ATC Signaling from 301/501
-- ============================================
-- This migration ensures:
-- 1. match_signals is for 301/501 ONLY (uses room_id, from_user_id, to_user_id, type, payload)
-- 2. atc_match_signals is for ATC ONLY (uses match_id, sender_id, recipient_id, signal_type, signal_data)
-- ============================================

-- ============================================
-- STEP 1: Ensure match_signals exists with correct schema for 301/501
-- ============================================

-- Create match_signals if it doesn't exist (for 301/501)
CREATE TABLE IF NOT EXISTS match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'ice', 'state')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on match_signals
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies (including ones with different names that depend on columns)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'match_signals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON match_signals', pol.policyname);
  END LOOP;
END $$;

-- Now safe to remove any ATC-specific columns that might have been added
ALTER TABLE match_signals DROP COLUMN IF EXISTS match_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS sender_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS recipient_id;
ALTER TABLE match_signals DROP COLUMN IF EXISTS signal_type;
ALTER TABLE match_signals DROP COLUMN IF EXISTS signal_data;

-- Indexes for match_signals
CREATE INDEX IF NOT EXISTS idx_match_signals_room_id ON match_signals(room_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_from_user ON match_signals(from_user_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_to_user ON match_signals(to_user_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_created ON match_signals(created_at);

-- Drop existing policies by name (in case they weren't caught above)
DROP POLICY IF EXISTS "Match signals viewable by participants" ON match_signals;
DROP POLICY IF EXISTS "Match signals insertable by participants" ON match_signals;
DROP POLICY IF EXISTS "Match signals deletable by owner" ON match_signals;
DROP POLICY IF EXISTS "match_signals_select" ON match_signals;
DROP POLICY IF EXISTS "match_signals_insert" ON match_signals;
DROP POLICY IF EXISTS "match_signals_delete" ON match_signals;

-- RLS Policies for match_signals (301/501)
CREATE POLICY "Match signals viewable by participants"
  ON match_signals FOR SELECT
  USING (
    from_user_id = auth.uid() OR 
    to_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM match_rooms r
      WHERE r.id = match_signals.room_id
      AND (r.player1_id = auth.uid() OR r.player2_id = auth.uid())
    )
  );

CREATE POLICY "Match signals insertable by participants"
  ON match_signals FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
  );

CREATE POLICY "Match signals deletable by owner"
  ON match_signals FOR DELETE
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Enable realtime for match_signals
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE match_signals;
  END IF;
END $$;

-- Cleanup function for old match_signals
CREATE OR REPLACE FUNCTION cleanup_match_signals()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM match_signals 
  WHERE room_id = NEW.room_id 
  AND created_at < NOW() - INTERVAL '5 minutes';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_match_signals_trigger ON match_signals;
CREATE TRIGGER cleanup_match_signals_trigger
  AFTER INSERT ON match_signals
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_match_signals();

-- ============================================
-- STEP 2: Create atc_match_signals table for ATC
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

-- Enable RLS on ATC signals
ALTER TABLE atc_match_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ATC
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

-- Enable realtime for ATC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'atc_match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE atc_match_signals;
  END IF;
END $$;

-- Cleanup function for old ATC signals
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

-- ============================================
-- STEP 3: RPC function for 301/501 signals
-- ============================================

-- Drop existing function first (to avoid parameter defaults error)
DROP FUNCTION IF EXISTS rpc_send_match_signal(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION rpc_send_match_signal(
  p_room_id UUID,
  p_to_user_id UUID,
  p_type TEXT,
  p_payload JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_from_user_id UUID;
BEGIN
  -- Get current user
  v_from_user_id := auth.uid();
  
  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  
  -- Insert the signal
  INSERT INTO match_signals (
    room_id,
    from_user_id,
    to_user_id,
    type,
    payload
  ) VALUES (
    p_room_id,
    v_from_user_id,
    p_to_user_id,
    p_type,
    p_payload
  );
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 4: RPC function for ATC signals
-- ============================================

-- Drop existing function first (to avoid parameter defaults error)
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
-- DONE!
-- ============================================
SELECT 
  'match_signals table configured for 301/501' as status_301_501,
  'atc_match_signals table created for ATC' as status_atc,
  'Both RPC functions created' as rpc_status;
