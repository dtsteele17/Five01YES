-- Disable RLS for match_signals to fix WebRTC
-- This is a temporary fix - re-enable with proper policies later

-- Disable RLS on match_signals
ALTER TABLE match_signals DISABLE ROW LEVEL SECURITY;

-- Drop all policies
DROP POLICY IF EXISTS "allow_insert_match_signals" ON match_signals;
DROP POLICY IF EXISTS "allow_select_match_signals" ON match_signals;
DROP POLICY IF EXISTS "allow_delete_match_signals" ON match_signals;
DROP POLICY IF EXISTS "match_signals_insert_policy" ON match_signals;
DROP POLICY IF EXISTS "match_signals_select_policy" ON match_signals;
DROP POLICY IF EXISTS "Users can send signals as themselves" ON match_signals;
DROP POLICY IF EXISTS "Users can only read signals sent to them" ON match_signals;

-- Make sure table has proper permissions
GRANT ALL ON match_signals TO authenticated;
GRANT ALL ON match_signals TO anon;
GRANT ALL ON match_signals TO service_role;

COMMENT ON TABLE match_signals IS 'WebRTC signaling - RLS disabled for testing';
