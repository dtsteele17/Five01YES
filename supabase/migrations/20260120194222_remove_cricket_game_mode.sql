/*
  # Remove Cricket Game Mode

  ## Overview
  This migration removes the Cricket game mode from the system.

  ## Changes
  1. Data Migration
    - Update any existing matches with game_mode='Cricket' to '501'

  2. Schema Updates
    - Remove 'Cricket' from the game_mode CHECK constraint

  ## Important Notes
  - All Cricket matches will be converted to 501 format
  - This change is permanent and cannot be reversed without data loss
*/

-- Update any existing Cricket matches to 501
UPDATE matches
SET game_mode = '501'
WHERE game_mode = 'Cricket';

-- Drop the old constraint
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_game_mode_check;

-- Add new constraint without Cricket
ALTER TABLE matches ADD CONSTRAINT matches_game_mode_check
CHECK (game_mode IN ('501', '301'));
