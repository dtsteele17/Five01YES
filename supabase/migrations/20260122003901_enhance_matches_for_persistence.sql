/*
  # Enhance Matches System for Complete Match Persistence

  ## Overview
  This migration enhances the matches system to support training mode,
  dartbot opponents, and comprehensive match statistics storage.

  ## Changes

  ### matches table enhancements
  - Add `opponent_id` (uuid) - Foreign key to auth.users for online opponents
  - Add `opponent_type` (text) - Type of opponent: 'user', 'dartbot', 'local'
  - Add `dartbot_level` (int) - Skill level of dartbot opponent (1-5)
  - Add `user_avg` (numeric) - User's 3-dart average for the match
  - Add `opponent_avg` (numeric) - Opponent's 3-dart average
  - Add `user_first9_avg` (numeric) - User's first 9 darts average
  - Add `opponent_first9_avg` (numeric) - Opponent's first 9 darts average
  - Add `user_checkout_pct` (numeric) - User's checkout percentage
  - Add `opponent_checkout_pct` (numeric) - Opponent's checkout percentage
  - Extend `match_type` to include 'training', 'league', 'tournament'

  ### match_visits table enhancements
  - Add `match_id` (uuid) - Direct reference to matches (for simpler queries)
  - Add `leg_number` (int) - Leg number within the match
  - Add `d1`, `d2`, `d3` (text) - Individual dart scores
  - Add `was_checkout_attempt` (boolean) - Whether this was a checkout attempt
  - Add `darts_at_double` (int) - Number of darts thrown at double
  - Add `checkout_success` (boolean) - Whether checkout was successful

  ## Security
  - RLS policies already cover new columns via existing policies
  - opponent_id references auth.users for validation
*/

-- Add new columns to matches table
DO $$
BEGIN
  -- Add opponent_id if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'opponent_id'
  ) THEN
    ALTER TABLE matches ADD COLUMN opponent_id uuid REFERENCES auth.users(id);
  END IF;

  -- Add opponent_type if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'opponent_type'
  ) THEN
    ALTER TABLE matches ADD COLUMN opponent_type text CHECK (opponent_type IN ('user', 'dartbot', 'local'));
  END IF;

  -- Add dartbot_level if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'dartbot_level'
  ) THEN
    ALTER TABLE matches ADD COLUMN dartbot_level int CHECK (dartbot_level >= 1 AND dartbot_level <= 5);
  END IF;

  -- Add user_avg if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_avg'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_avg numeric(5,2);
  END IF;

  -- Add opponent_avg if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'opponent_avg'
  ) THEN
    ALTER TABLE matches ADD COLUMN opponent_avg numeric(5,2);
  END IF;

  -- Add user_first9_avg if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_first9_avg'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_first9_avg numeric(5,2);
  END IF;

  -- Add opponent_first9_avg if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'opponent_first9_avg'
  ) THEN
    ALTER TABLE matches ADD COLUMN opponent_first9_avg numeric(5,2);
  END IF;

  -- Add user_checkout_pct if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'user_checkout_pct'
  ) THEN
    ALTER TABLE matches ADD COLUMN user_checkout_pct numeric(5,2);
  END IF;

  -- Add opponent_checkout_pct if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'opponent_checkout_pct'
  ) THEN
    ALTER TABLE matches ADD COLUMN opponent_checkout_pct numeric(5,2);
  END IF;
END $$;

-- Drop existing check constraint on match_type to add new values
DO $$
BEGIN
  -- Drop the old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'matches' AND constraint_name = 'matches_match_type_check'
  ) THEN
    ALTER TABLE matches DROP CONSTRAINT matches_match_type_check;
  END IF;

  -- Add new constraint with extended values
  ALTER TABLE matches ADD CONSTRAINT matches_match_type_check
    CHECK (match_type IN ('training', 'local', 'quick', 'ranked', 'private', 'league', 'tournament'));
END $$;

-- Add new columns to match_visits table
DO $$
BEGIN
  -- Add match_id if not exists (for direct match reference)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'match_id'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN match_id uuid REFERENCES matches(id) ON DELETE CASCADE;
  END IF;

  -- Add leg_number if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'leg_number'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN leg_number int;
  END IF;

  -- Add d1 if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'd1'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN d1 text;
  END IF;

  -- Add d2 if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'd2'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN d2 text;
  END IF;

  -- Add d3 if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'd3'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN d3 text;
  END IF;

  -- Add was_checkout_attempt if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'was_checkout_attempt'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN was_checkout_attempt boolean DEFAULT false;
  END IF;

  -- Add darts_at_double if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'darts_at_double'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN darts_at_double int;
  END IF;

  -- Add checkout_success if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'checkout_success'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN checkout_success boolean DEFAULT false;
  END IF;
END $$;

-- Create index on match_id for match_visits if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'match_visits' AND indexname = 'idx_match_visits_match_id'
  ) THEN
    CREATE INDEX idx_match_visits_match_id ON match_visits(match_id);
  END IF;
END $$;

-- RLS Policy for direct match_visits access via match_id
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "Users can view visits from their matches via match_id" ON match_visits;

  -- Create new policy
  CREATE POLICY "Users can view visits from their matches via match_id"
    ON match_visits FOR SELECT
    TO authenticated
    USING (
      match_id IN (
        SELECT id FROM matches WHERE user_id = auth.uid()
      )
    );

  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS "Users can insert visits via match_id" ON match_visits;

  -- Create new policy
  CREATE POLICY "Users can insert visits via match_id"
    ON match_visits FOR INSERT
    TO authenticated
    WITH CHECK (
      match_id IN (
        SELECT id FROM matches WHERE user_id = auth.uid()
      )
    );
END $$;
