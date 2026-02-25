-- Add tournament winner columns if they don't exist
-- Run this FIRST, then run the functions file

-- Add winner_id column to tournaments table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tournaments' 
    AND column_name = 'winner_id'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN winner_id UUID REFERENCES profiles(id);
  END IF;
END $$;

-- Add completed_at column to tournaments table  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tournaments' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;