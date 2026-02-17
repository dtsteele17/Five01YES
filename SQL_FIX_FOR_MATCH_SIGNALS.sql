-- ============================================================================
-- EMERGENCY FIX: match_signals table schema
-- Run this in Supabase SQL Editor if you get "column does not exist" errors
-- ============================================================================

-- First, let's see what columns currently exist
SELECT 
  'Current columns in match_signals:' as info,
  string_agg(column_name, ', ') as columns
FROM information_schema.columns 
WHERE table_name = 'match_signals';

-- If the table doesn't exist at all, create it fresh
CREATE TABLE IF NOT EXISTS match_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice')),
  signal_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns (these will fail silently if column already exists)
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS match_id UUID;
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS sender_id UUID;
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS recipient_id UUID;
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS signal_type TEXT;
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS signal_data JSONB;
ALTER TABLE match_signals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_match_signals_match_id ON match_signals(match_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_recipient ON match_signals(recipient_id);

-- Enable RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- Create policies (drop first to avoid conflicts)
DROP POLICY IF EXISTS "match_signals_select" ON match_signals;
DROP POLICY IF EXISTS "match_signals_insert" ON match_signals;
DROP POLICY IF EXISTS "Users can view signals for their matches" ON match_signals;
DROP POLICY IF EXISTS "Users can insert signals for their matches" ON match_signals;

CREATE POLICY "match_signals_select"
ON match_signals FOR SELECT
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "match_signals_insert"
ON match_signals FOR INSERT
WITH CHECK (sender_id = auth.uid());

-- Grant permissions
GRANT SELECT, INSERT ON match_signals TO authenticated;

-- Verify
SELECT 'match_signals table ready' as status;
