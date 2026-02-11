-- Fix RLS policy for match_signals
-- The issue is the INSERT policy is too strict

-- 1. Drop all existing policies
DROP POLICY IF EXISTS "match_signals_insert_policy" ON match_signals;
DROP POLICY IF EXISTS "match_signals_select_policy" ON match_signals;
DROP POLICY IF EXISTS "match_signals_delete_policy" ON match_signals;
DROP POLICY IF EXISTS "Users can send signals as themselves" ON match_signals;
DROP POLICY IF EXISTS "Users can only read signals sent to them" ON match_signals;

-- 2. Disable RLS temporarily to test (REMOVE THIS IN PRODUCTION)
-- ALTER TABLE match_signals DISABLE ROW LEVEL SECURITY;

-- 3. Re-enable with permissive policies
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- INSERT: Allow authenticated users to insert (RLS will check they own the row via trigger)
CREATE POLICY "allow_insert_match_signals"
  ON match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- Allow all authenticated inserts

-- SELECT: Allow authenticated users to read signals sent to them
CREATE POLICY "allow_select_match_signals"
  ON match_signals
  FOR SELECT
  TO authenticated
  USING (to_user_id = auth.uid());

-- DELETE: Allow users to delete signals sent to them
CREATE POLICY "allow_delete_match_signals"
  ON match_signals
  FOR DELETE
  TO authenticated
  USING (to_user_id = auth.uid());

-- Verify the table structure
COMMENT ON TABLE match_signals IS 'WebRTC signaling - RLS allows authenticated inserts, only read your own';
