-- ============================================
-- COMPLETE FIX: 301/501 Camera and Checkout
-- Run this entire file in Supabase SQL Editor
-- ============================================

-- ============================================
-- STEP 1: Drop and recreate match_signals table
-- ============================================

-- Drop all policies first
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

-- Drop table
DROP TABLE IF EXISTS match_signals CASCADE;

-- Create fresh table with correct columns
CREATE TABLE match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_match_signals_room_id ON match_signals(room_id);
CREATE INDEX idx_match_signals_from_user ON match_signals(from_user_id);
CREATE INDEX idx_match_signals_to_user ON match_signals(to_user_id);
CREATE INDEX idx_match_signals_created ON match_signals(created_at);

-- RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_signals_select" ON match_signals FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "match_signals_insert" ON match_signals FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "match_signals_delete" ON match_signals FOR DELETE
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE match_signals;

-- Cleanup trigger
CREATE OR REPLACE FUNCTION cleanup_match_signals() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM match_signals WHERE room_id = NEW.room_id AND created_at < NOW() - INTERVAL '5 minutes';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_match_signals_trigger ON match_signals;
CREATE TRIGGER cleanup_match_signals_trigger AFTER INSERT ON match_signals
  FOR EACH ROW EXECUTE FUNCTION cleanup_match_signals();

-- ============================================
-- STEP 2: Recreate RPC function
-- ============================================

DROP FUNCTION IF EXISTS rpc_send_match_signal(UUID, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION rpc_send_match_signal(
  p_room_id UUID,
  p_to_user_id UUID,
  p_type TEXT,
  p_payload JSONB
) RETURNS JSONB AS $$
DECLARE
  v_from_user_id UUID;
BEGIN
  v_from_user_id := auth.uid();
  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;
  
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES (p_room_id, v_from_user_id, p_to_user_id, p_type, p_payload);
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 3: Fix checkout constraint
-- ============================================

UPDATE quick_match_lobbies SET status = 'closed' 
WHERE status IS NULL OR status = '' 
OR status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

ALTER TABLE quick_match_lobbies DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies ADD CONSTRAINT quick_match_lobbies_status_check 
CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- Also fix match_rooms
UPDATE match_rooms SET status = 'finished' 
WHERE status IS NULL OR status = '' 
OR status NOT IN ('waiting', 'active', 'finished', 'cancelled');

ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_status_check;

ALTER TABLE match_rooms ADD CONSTRAINT match_rooms_status_check 
CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));

-- ============================================
-- DONE
-- ============================================
SELECT 'Fix complete!' as status;
