/*
  # Add darts-based checkout tracking to match_players table

  ## Overview
  This migration adds fields to properly track checkout statistics based on DARTS thrown
  at double/bull (attempts) rather than visits with checkout opportunities.

  ## Changes to `match_players` table
  
  ### New Fields:
  - `checkout_darts_attempted` (integer, default 0) - Total darts thrown at double/bull during checkout attempts
  - `first_9_darts_thrown` (integer, default 0) - Actual darts thrown in first 9 (should be 9 * legs played)
  - `first_9_points_scored` (integer, default 0) - Points scored in first 9 darts across all legs

  ### Modified Fields:
  - Rename `checkout_attempts` to represent visit-based attempts (keep for backward compatibility)
  - Keep `checkout_hits` as number of successful checkouts (legs won)

  ## Notes
  - checkout % formula: (checkout_hits / checkout_darts_attempted) * 100
  - If checkout_darts_attempted is 0, display 0%
  - This enables accurate aggregation across all match types (training, ranked, quick, private, league, tournament)
*/

-- Add new columns to match_players table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_players' AND column_name = 'checkout_darts_attempted'
  ) THEN
    ALTER TABLE match_players ADD COLUMN checkout_darts_attempted integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_players' AND column_name = 'first_9_darts_thrown'
  ) THEN
    ALTER TABLE match_players ADD COLUMN first_9_darts_thrown integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_players' AND column_name = 'first_9_points_scored'
  ) THEN
    ALTER TABLE match_players ADD COLUMN first_9_points_scored integer DEFAULT 0;
  END IF;
END $$;

-- Update existing rows to have default values
UPDATE match_players
SET 
  checkout_darts_attempted = COALESCE(checkout_darts_attempted, 0),
  first_9_darts_thrown = COALESCE(first_9_darts_thrown, 0),
  first_9_points_scored = COALESCE(first_9_points_scored, 0)
WHERE checkout_darts_attempted IS NULL 
   OR first_9_darts_thrown IS NULL 
   OR first_9_points_scored IS NULL;
