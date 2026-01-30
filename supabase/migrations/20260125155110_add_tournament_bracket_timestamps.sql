/*
  # Add Tournament Bracket Timestamps

  1. Updates
    - Add `bracket_generated_at` timestamp to tournaments table
    - Add `started_at` timestamp to tournaments table

  2. Purpose
    - Track when tournament bracket was generated (5 minutes before start)
    - Track when tournament actually started (round 1 begins)
    - Enable cron job to check if bracket generation or start is needed

  3. Notes
    - These columns are nullable (tournaments can exist without brackets yet)
    - Used by tournament-cron edge function
*/

DO $$
BEGIN
  -- Add bracket_generated_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'bracket_generated_at'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN bracket_generated_at timestamptz;
  END IF;

  -- Add started_at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN started_at timestamptz;
  END IF;
END $$;

-- Create index for cron job queries
CREATE INDEX IF NOT EXISTS idx_tournaments_bracket_generation 
  ON tournaments(status, bracket_generated_at, start_at) 
  WHERE bracket_generated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_start 
  ON tournaments(status, started_at, start_at) 
  WHERE started_at IS NULL;
