-- Add forfeit column to match_history to track forfeited matches
ALTER TABLE match_history ADD COLUMN IF NOT EXISTS forfeit boolean DEFAULT false;
