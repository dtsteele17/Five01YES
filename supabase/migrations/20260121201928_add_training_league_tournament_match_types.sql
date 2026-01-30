/*
  # Add Training, League, and Tournament Match Types

  ## Overview
  This migration extends the matches table to support additional match types
  for training sessions, league matches, and tournament matches.

  ## Changes
  1. Modifications to `matches` table:
    - Update match_type constraint to include 'training', 'league', 'tournament'
    - Add league_id and tournament_id columns for tracking context
  
  ## Notes
  - Existing match_type values ('local', 'quick', 'ranked', 'private') remain valid
  - league_id and tournament_id are optional and only used when match_type is 'league' or 'tournament'
*/

-- Drop the existing check constraint on match_type
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_match_type_check;

-- Add the new constraint with additional match types
ALTER TABLE matches ADD CONSTRAINT matches_match_type_check 
  CHECK (match_type IN ('local', 'quick', 'ranked', 'private', 'training', 'league', 'tournament'));

-- Add optional foreign keys for league and tournament matches
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'league_id'
  ) THEN
    ALTER TABLE matches ADD COLUMN league_id uuid REFERENCES leagues(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matches' AND column_name = 'tournament_id'
  ) THEN
    ALTER TABLE matches ADD COLUMN tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_match_type ON matches(match_type);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);
