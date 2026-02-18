-- Fix tournament columns to match the code
-- Ensure legs_per_match exists and best_of_legs is handled properly

-- Add legs_per_match if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'legs_per_match'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN legs_per_match integer DEFAULT 5;
  END IF;
END $$;

-- Add double_out if it doesn't exist  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'double_out'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN double_out boolean DEFAULT true;
  END IF;
END $$;

-- Ensure match_format column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'match_format'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN match_format text DEFAULT 'single';
  END IF;
END $$;

-- Migrate data from best_of_legs to legs_per_match if needed
UPDATE tournaments 
SET legs_per_match = COALESCE(best_of_legs, legs_per_match, 5)
WHERE legs_per_match IS NULL AND best_of_legs IS NOT NULL;

-- Set default for any null legs_per_match
UPDATE tournaments 
SET legs_per_match = 5
WHERE legs_per_match IS NULL;

-- Set default for any null double_out
UPDATE tournaments 
SET double_out = true
WHERE double_out IS NULL;

-- Add comment to document the columns
COMMENT ON COLUMN tournaments.legs_per_match IS 'Number of legs per match (Best of N)';
COMMENT ON COLUMN tournaments.double_out IS 'Whether double out is required';
