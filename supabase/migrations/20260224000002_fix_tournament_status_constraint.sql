-- Fix tournament status constraint and ensure all columns exist
-- This fixes the 400 error when creating tournaments

-- ============================================================================
-- PART 1: Fix status constraint to allow 'scheduled'
-- ============================================================================

-- First update any tournaments with invalid status values
UPDATE tournaments 
SET status = 'scheduled' 
WHERE status NOT IN ('draft', 'scheduled', 'checkin', 'in_progress', 'completed', 'cancelled');

-- Drop the old constraint and add the correct one
ALTER TABLE tournaments 
  DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_status_check 
  CHECK (status IN ('draft', 'scheduled', 'checkin', 'in_progress', 'completed', 'cancelled'));

-- ============================================================================
-- PART 2: Ensure created_by column exists (NOT owner_id)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================================================
-- PART 3: Ensure all required columns exist with proper defaults
-- ============================================================================

-- Ensure legs_per_match exists with proper constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'legs_per_match'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN legs_per_match integer DEFAULT 5;
  END IF;
END $$;

-- Ensure double_out exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'double_out'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN double_out boolean DEFAULT true;
  END IF;
END $$;

-- Ensure round_scheduling exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'round_scheduling'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN round_scheduling text DEFAULT 'one_day';
  END IF;
END $$;

-- Ensure entry_type exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN entry_type text DEFAULT 'open';
  END IF;
END $$;

-- Ensure game_mode exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'game_mode'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN game_mode integer DEFAULT 501;
  END IF;
END $$;

-- Ensure max_participants exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'max_participants'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN max_participants integer DEFAULT 16;
  END IF;
END $$;

-- Ensure description exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'description'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN description text;
  END IF;
END $$;

-- Ensure start_at exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'start_at'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN start_at timestamptz;
  END IF;
END $$;

-- ============================================================================
-- PART 4: Fix any NULL values in critical columns
-- ============================================================================

UPDATE tournaments SET legs_per_match = 5 WHERE legs_per_match IS NULL;
UPDATE tournaments SET double_out = true WHERE double_out IS NULL;
UPDATE tournaments SET round_scheduling = 'one_day' WHERE round_scheduling IS NULL;
UPDATE tournaments SET entry_type = 'open' WHERE entry_type IS NULL;
UPDATE tournaments SET game_mode = 501 WHERE game_mode IS NULL;
UPDATE tournaments SET max_participants = 16 WHERE max_participants IS NULL;
UPDATE tournaments SET status = 'scheduled' WHERE status IS NULL;

-- ============================================================================
-- PART 5: Ensure RLS is enabled and insert policy uses created_by
-- ============================================================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate with created_by
DROP POLICY IF EXISTS "Tournament owners can insert" ON tournaments;
DROP POLICY IF EXISTS "Authenticated users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments;

CREATE POLICY "Users can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Also ensure select policy exists
DROP POLICY IF EXISTS "Everyone can view tournaments" ON tournaments;

CREATE POLICY "Everyone can view tournaments"
  ON tournaments FOR SELECT
  TO authenticated
  USING (true);

-- Update policy if it uses owner_id
DROP POLICY IF EXISTS "Tournament owners can update" ON tournaments;
CREATE POLICY "Tournament owners can update"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Delete policy
DROP POLICY IF EXISTS "Tournament owners can delete" ON tournaments;
CREATE POLICY "Tournament owners can delete"
  ON tournaments FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
