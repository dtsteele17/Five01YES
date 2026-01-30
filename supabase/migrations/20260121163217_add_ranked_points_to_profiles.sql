/*
  # Add Ranked Points to Profiles

  ## Overview
  This migration adds ranked points tracking to player profiles to support the ranked division system.

  ## Changes to Tables

  ### `profiles`
  Added columns:
  - `ranked_points` (integer, default 0) - Player's current ranked points (RP) for division placement

  ## Notes
  - Default value of 0 places new players in Bronze 4
  - Existing profiles will start at Bronze 4 (0 RP)
  - No RLS changes needed as existing policies already cover this field
*/

-- Add ranked_points column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'ranked_points'
  ) THEN
    ALTER TABLE profiles ADD COLUMN ranked_points integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Add check constraint for valid RP values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_ranked_points_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_ranked_points_check
    CHECK (ranked_points >= 0);
  END IF;
END $$;

-- Add index for ranked leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_ranked_points ON profiles(ranked_points DESC);