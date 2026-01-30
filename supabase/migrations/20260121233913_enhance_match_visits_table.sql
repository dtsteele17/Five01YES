/*
  # Enhance Match Visits Table
  
  ## Overview
  This migration enhances the match_visits table to store detailed dart-by-dart data
  and checkout information for comprehensive visit tracking.
  
  ## Changes to Tables
  
  ### `match_visits`
  Added columns:
  - `darts` (jsonb) - Array of darts thrown (e.g., ["T20", "T20", "D20"] or ["T12", "MISS", "MISS"])
  - `darts_thrown` (integer) - Actual number of darts thrown (1-3)
  - `checkout_darts_at_double` (integer, nullable) - Number of darts at double for checkout tracking
  - `last_dart_type` (text, nullable) - Type of last dart (S/D/T/BULL/SBULL)
  
  ## Notes
  - All new fields are nullable to support existing visit records
  - darts field stores the actual dart notation for replay and analysis
  - darts_thrown enables accurate average calculations
  - checkout_darts_at_double tracks double attempts for checkout percentage
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'darts'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN darts jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'darts_thrown'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN darts_thrown integer DEFAULT 3 CHECK (darts_thrown >= 1 AND darts_thrown <= 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'checkout_darts_at_double'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN checkout_darts_at_double integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_visits' AND column_name = 'last_dart_type'
  ) THEN
    ALTER TABLE match_visits ADD COLUMN last_dart_type text CHECK (last_dart_type IN ('S', 'D', 'T', 'BULL', 'SBULL') OR last_dart_type IS NULL);
  END IF;
END $$;
