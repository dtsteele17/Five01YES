-- Fix match_signals table for WebRTC camera
-- Run this if you're getting 400 errors when inserting signals

-- 1. Drop existing table (if exists with wrong structure)
DROP TABLE IF EXISTS match_signals CASCADE;

-- 2. Create table with correct structure
CREATE TABLE match_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'ice', 'state', 'forfeit')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- INSERT: Can only send signals as yourself
DROP POLICY IF EXISTS "match_signals_insert_policy" ON match_signals;
CREATE POLICY "match_signals_insert_policy"
  ON match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- SELECT: Can only read signals sent TO you
DROP POLICY IF EXISTS "match_signals_select_policy" ON match_signals;
CREATE POLICY "match_signals_select_policy"
  ON match_signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);

-- DELETE: Can only delete signals sent to you (cleanup)
DROP POLICY IF EXISTS "match_signals_delete_policy" ON match_signals;
CREATE POLICY "match_signals_delete_policy"
  ON match_signals
  FOR DELETE
  TO authenticated
  USING (auth.uid() = to_user_id);

-- 5. Create indexes for performance
CREATE INDEX idx_match_signals_to_user ON match_signals(to_user_id, created_at DESC);
CREATE INDEX idx_match_signals_room ON match_signals(room_id, created_at DESC);
CREATE INDEX idx_match_signals_from_user ON match_signals(from_user_id, created_at DESC);

-- 6. Add realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE match_signals;

-- 7. Comment for documentation
COMMENT ON TABLE match_signals IS 'WebRTC signaling table for video chat between match players';
