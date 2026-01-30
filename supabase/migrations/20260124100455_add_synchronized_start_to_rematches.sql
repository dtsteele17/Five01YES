/*
  # Add Synchronized Start to Rematch System

  1. Changes
    - Add `start_at` column to match_rematches
    - This timestamp ensures both players redirect at the same time
    - Set 2 seconds in the future when new match is created

  2. Notes
    - Both clients wait for realtime update with start_at
    - Calculate delay and redirect simultaneously
    - Prevents race condition where second player redirects first
*/

-- Add start_at column
ALTER TABLE match_rematches 
ADD COLUMN IF NOT EXISTS start_at timestamptz;

-- Create index for start_at lookups
CREATE INDEX IF NOT EXISTS idx_match_rematches_start_at ON match_rematches(start_at) WHERE start_at IS NOT NULL;