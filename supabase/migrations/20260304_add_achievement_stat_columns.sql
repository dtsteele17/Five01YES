-- Add missing stat columns for achievement tracking
-- These columns track cumulative stats used by the achievement system

ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS score_26_count integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS checkouts_made integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS training_matches integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS atc_completions integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS ranked_matches_played integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS ranked_wins integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS tournament_matches_won integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS tournaments_won integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS leagues_joined integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS leagues_won integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS leagues_created integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS promotions integer NOT NULL DEFAULT 0;
ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS relegations integer NOT NULL DEFAULT 0;
