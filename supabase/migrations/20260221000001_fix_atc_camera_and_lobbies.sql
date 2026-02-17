-- ============================================================================
-- FIX: ATC Camera Signaling + Lobby Visibility
-- ============================================================================

-- 1. First, check what columns exist and fix the table structure
-- ============================================================================
DO $$
BEGIN
  -- If table doesn't exist, create it
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'match_signals') THEN
    CREATE TABLE match_signals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id UUID NOT NULL,
      sender_id UUID NOT NULL,
      recipient_id UUID NOT NULL,
      signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice')),
      signal_data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Table exists - check and fix columns
    
    -- Fix match_id column (might be named room_id in old schema)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'match_id') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'room_id') THEN
        ALTER TABLE match_signals RENAME COLUMN room_id TO match_id;
      ELSE
        ALTER TABLE match_signals ADD COLUMN match_id UUID;
      END IF;
    END IF;

    -- Fix sender_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'sender_id') THEN
      ALTER TABLE match_signals ADD COLUMN sender_id UUID;
    END IF;

    -- Fix recipient_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'recipient_id') THEN
      ALTER TABLE match_signals ADD COLUMN recipient_id UUID;
    END IF;

    -- Fix signal_type (might be named type in old schema)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'signal_type') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'type') THEN
        ALTER TABLE match_signals RENAME COLUMN type TO signal_type;
      ELSE
        ALTER TABLE match_signals ADD COLUMN signal_type TEXT;
      END IF;
    END IF;

    -- Fix signal_data (might be named data in old schema)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'signal_data') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'data') THEN
        ALTER TABLE match_signals RENAME COLUMN data TO signal_data;
      ELSE
        ALTER TABLE match_signals ADD COLUMN signal_data JSONB;
      END IF;
    END IF;

    -- Fix created_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_signals' AND column_name = 'created_at') THEN
      ALTER TABLE match_signals ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- 2. Ensure columns are NOT NULL
ALTER TABLE match_signals 
  ALTER COLUMN match_id SET NOT NULL,
  ALTER COLUMN sender_id SET NOT NULL,
  ALTER COLUMN recipient_id SET NOT NULL,
  ALTER COLUMN signal_type SET NOT NULL,
  ALTER COLUMN signal_data SET NOT NULL;

-- 3. Add check constraint for signal_type
DO $$
BEGIN
  ALTER TABLE match_signals 
    ADD CONSTRAINT check_signal_type 
    CHECK (signal_type IN ('offer', 'answer', 'ice'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_match_signals_match_id ON match_signals(match_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_recipient ON match_signals(recipient_id);
CREATE INDEX IF NOT EXISTS idx_match_signals_created_at ON match_signals(created_at);

-- 5. Enable RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- 6. Drop and recreate policies
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

-- 7. Function to clean old signals
CREATE OR REPLACE FUNCTION cleanup_old_match_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM match_signals
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- 8. Create trigger function for auto-cleanup (only if match_id column exists now)
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION trigger_cleanup_old_signals()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $func$
  BEGIN
    DELETE FROM match_signals
    WHERE match_id = NEW.match_id
      AND created_at < NOW() - INTERVAL '1 hour';
    RETURN NEW;
  END;
  $func$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create trigger function: %', SQLERRM;
END $$;

-- 9. Create trigger (only if function was created successfully)
DO $$
BEGIN
  DROP TRIGGER IF EXISTS cleanup_old_signals_trigger ON match_signals;
  CREATE TRIGGER cleanup_old_signals_trigger
    AFTER INSERT ON match_signals
    FOR EACH ROW
    EXECUTE FUNCTION trigger_cleanup_old_signals();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not create trigger: %', SQLERRM;
END $$;

-- 10. Verify quick_match_lobbies has proper status handling
ALTER TABLE quick_match_lobbies 
  DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies
  ADD CONSTRAINT quick_match_lobbies_status_check 
  CHECK (status IN ('open', 'waiting', 'full', 'in_progress', 'cancelled', 'closed'));

-- 11. Grant permissions
GRANT SELECT, INSERT ON match_signals TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_match_signals() TO authenticated;

-- 12. Verify setup
SELECT 
  'ATC Camera Fix Applied' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'match_signals') as table_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'match_signals') as column_count;
