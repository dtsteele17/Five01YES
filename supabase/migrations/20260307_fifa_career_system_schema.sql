-- ============================================================
-- FIFA-STYLE CAREER SYSTEM - SCHEMA ADDITIONS
-- Add all necessary columns and tables for FIFA-style career mode
-- ============================================================

-- 1. Add FIFA columns to career_profiles
ALTER TABLE career_profiles 
ADD COLUMN IF NOT EXISTS consecutive_seasons_in_tier2 SMALLINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_sponsor_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sponsor_contract_started_season SMALLINT DEFAULT NULL;

-- 2. Ensure career_league_standings has proper structure for FIFA leagues
-- The table already exists, just ensure we have the right columns
ALTER TABLE career_league_standings 
ADD COLUMN IF NOT EXISTS wins SMALLINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS losses SMALLINT DEFAULT 0;

-- Update any NULL values to 0
UPDATE career_league_standings SET wins = 0 WHERE wins IS NULL;
UPDATE career_league_standings SET losses = 0 WHERE losses IS NULL;

-- 3. Create career_emails table for FIFA-style notifications  
CREATE TABLE IF NOT EXISTS career_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'promotion', 'relegation', 'scout_interest', 'sponsor_offer',
    'tournament_invite', 'season_summary', 'milestone'
  )),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS on career_emails
ALTER TABLE career_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_emails_user ON career_emails;
CREATE POLICY career_emails_user ON career_emails FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);

-- 4. Create career_tournaments table for mid-season and end-season tournaments
CREATE TABLE IF NOT EXISTS career_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  tier SMALLINT NOT NULL,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('mid_season', 'end_season')),
  tournament_name TEXT NOT NULL,
  bracket_size SMALLINT NOT NULL DEFAULT 16,
  triggered_after_match INTEGER, -- which league match triggered this (4th for mid-season)
  user_entered BOOLEAN NOT NULL DEFAULT FALSE,
  user_result TEXT CHECK (user_result IN ('winner', 'finalist', 'semi', 'quarter', 'early')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on career_tournaments
ALTER TABLE career_tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_tournaments_user ON career_tournaments;
CREATE POLICY career_tournaments_user ON career_tournaments FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);

-- 5. Add more diverse FIFA-style sponsors to existing catalog
INSERT INTO career_sponsor_catalog (name, tier_min, tier_max, rep_bonus_pct, flavour_text, rarity) VALUES
('Ace Arrows', 3, 5, 0.05, 'Premium dart equipment manufacturer looking for rising talent', 'common'),
('Bulls Eye Brewery', 3, 5, 0.03, 'Local brewery supporting the darts community', 'common'),
('County Darts Co.', 3, 5, 0.04, 'Established darts retailer with county presence', 'common'),
('Red Dragon Sports', 3, 5, 0.06, 'Professional darts brand seeking ambassadors', 'uncommon'),
('Target Champions', 3, 5, 0.04, 'Youth development program sponsor', 'common'),
('Precision Flights', 3, 5, 0.03, 'Specialized dart flights and accessories', 'common'),
('Championship Arms', 3, 5, 0.05, 'Traditional pub tournament supporters', 'common'),
('Victory Tungsten', 3, 5, 0.06, 'High-end dart manufacturer', 'uncommon'),
('Phoenix Rising', 3, 5, 0.04, 'Emerging sports brand backing new talent', 'common'),
('Golden Arrow', 3, 5, 0.07, 'Prestigious equipment sponsor for elite players', 'rare')
ON CONFLICT (name) DO NOTHING;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_career_emails_career_season ON career_emails(career_id, season);
CREATE INDEX IF NOT EXISTS idx_career_tournaments_career_season ON career_tournaments(career_id, season);
CREATE INDEX IF NOT EXISTS idx_career_standings_tier_season ON career_league_standings(career_id, tier, season);

-- 7. Add constraint to ensure only one player per league standings
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_standings_one_player_per_league 
ON career_league_standings(career_id, season, tier) WHERE is_player = TRUE;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🏗️ FIFA-Style Career Schema completed!';
  RAISE NOTICE '✅ Added FIFA columns to career_profiles';
  RAISE NOTICE '✅ Created career_emails table for notifications';  
  RAISE NOTICE '✅ Created career_tournaments table for tournaments';
  RAISE NOTICE '✅ Added 10 FIFA-style sponsors to catalog';
  RAISE NOTICE '✅ Created performance indexes';
  RAISE NOTICE 'Ready for FIFA-style RPC functions! 🎯';
END $$;