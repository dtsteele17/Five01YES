-- ============================================================================
-- FIX: Handle NULL values in match_signals table
-- ============================================================================

-- 1. First, let's see what we're dealing with
SELECT 
  'Current state' as info,
  (SELECT COUNT(*) FROM match_signals) as total_rows,
  (SELECT COUNT(*) FROM match_signals WHERE match_id IS NULL) as null_match_id,
  (SELECT COUNT(*) FROM match_signals WHERE sender_id IS NULL) as null_sender_id,
  (SELECT COUNT(*) FROM match_signals WHERE recipient_id IS NULL) as null_recipient_id,
  (SELECT COUNT(*) FROM match_signals WHERE signal_type IS NULL) as null_signal_type,
  (SELECT COUNT(*) FROM match_signals WHERE signal_data IS NULL) as null_signal_data;

-- 2. Delete rows with NULL match_id (these are incomplete/corrupted signals)
-- WebRTC signals are temporary, so old incomplete data can be safely removed
DELETE FROM match_signals WHERE match_id IS NULL;

-- 3. Delete rows with NULL sender_id (also incomplete)
DELETE FROM match_signals WHERE sender_id IS NULL;

-- 4. Delete rows with NULL recipient_id (also incomplete)
DELETE FROM match_signals WHERE recipient_id IS NULL;

-- 5. Set default values for signal_type and signal_data if NULL
UPDATE match_signals SET signal_type = 'ice' WHERE signal_type IS NULL;
UPDATE match_signals SET signal_data = '{}' WHERE signal_data IS NULL;

-- 6. Now we can safely add NOT NULL constraints
ALTER TABLE match_signals 
  ALTER COLUMN match_id SET NOT NULL,
  ALTER COLUMN sender_id SET NOT NULL,
  ALTER COLUMN recipient_id SET NOT NULL,
  ALTER COLUMN signal_type SET NOT NULL,
  ALTER COLUMN signal_data SET NOT NULL;

-- 7. Add check constraint for signal_type
DO $$
BEGIN
  ALTER TABLE match_signals 
    ADD CONSTRAINT check_signal_type 
    CHECK (signal_type IN ('offer', 'answer', 'ice'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 8. Create indexes
CREATE INDEX IF NOT EXISTS idx_match_signals_match_id ON match_signals(match_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_recipient ON match_signals(recipient_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_created_at ON match_signals(created_at);

-- 9. Enable RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- 10. Drop and recreate policies
DROP POLICY IF EXISTS "Users can view signals for their matches" ON match_signals;
DROP POLICY IF EXISTS "Users can insert signals for their matches" ON match_signals;
DROP POLICY IF EXISTS "match_signals_select" ON match_signals;
DROP POLICY IF EXISTS "match_signals_insert" ON match_signals;

CREATE POLICY "match_signals_select"
ON match_signals FOR SELECT
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "match_signals_insert"
ON match_signals FOR INSERT
WITH CHECK (sender_id = auth.uid());

-- 11. Grant permissions
GRANT SELECT, INSERT ON match_signals TO authenticated;

-- 12. Verify
SELECT 
  'match_signals fixed' as status,
  (SELECT COUNT(*) FROM match_signals) as remaining_rows,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'match_signals' AND is_nullable = 'NO') as not_null_columns;
