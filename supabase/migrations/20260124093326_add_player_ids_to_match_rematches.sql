/*
  # Add Player IDs to Match Rematches Table

  1. Changes
    - Add player1_id and player2_id columns to match_rematches
    - These are needed for RLS policies and notifications

  2. Notes
    - Columns reference auth.users(id) for the two players
    - Required for proper access control
*/

-- Add player ID columns
ALTER TABLE match_rematches 
ADD COLUMN IF NOT EXISTS player1_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE match_rematches 
ADD COLUMN IF NOT EXISTS player2_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for player lookups
CREATE INDEX IF NOT EXISTS idx_match_rematches_players ON match_rematches(player1_id, player2_id);