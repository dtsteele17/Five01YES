-- ============================================================
-- FIVE01 Career Mode — Core Tables
-- ============================================================

-- 1) Career Profiles (one per save slot per user)
CREATE TABLE IF NOT EXISTS career_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  save_slot SMALLINT NOT NULL DEFAULT 1 CHECK (save_slot BETWEEN 1 AND 3),
  career_seed BIGINT NOT NULL,              -- deterministic seed for opponent/name generation
  difficulty TEXT NOT NULL CHECK (difficulty IN ('rookie','amateur','semi-pro','pro','world-class','nightmare')),
  tier SMALLINT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 5),
  season SMALLINT NOT NULL DEFAULT 1,
  week SMALLINT NOT NULL DEFAULT 0,         -- current week (0 = pre-season / Tier 1 day-based)
  day SMALLINT NOT NULL DEFAULT 1,          -- used in Tier 1 (day-based progression)
  rep BIGINT NOT NULL DEFAULT 0,
  form REAL NOT NULL DEFAULT 0.0,           -- -0.05 to +0.05 range, flavour only
  premier_league_active BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, save_slot)
);

CREATE INDEX idx_career_profiles_user ON career_profiles(user_id);

-- 2) Career Schedule Templates (defines what happens each week/day per tier)
CREATE TABLE IF NOT EXISTS career_schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 5),
  sequence_no SMALLINT NOT NULL,            -- ordering within the tier season
  event_type TEXT NOT NULL CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals'
  )),
  event_name TEXT NOT NULL,                 -- display name e.g. "Weekend League Night — Matchday 1"
  event_subtype TEXT,                       -- e.g. 'pub_open', 'county_qualifier', 'major_open'
  format_legs SMALLINT NOT NULL DEFAULT 3,  -- best-of X legs
  bracket_size SMALLINT,                    -- NULL for league, 8/16/32 for brackets
  day_based BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE for Tier 1 (day progression)
  training_available BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',              -- extra config (e.g. premier league points rules)
  UNIQUE(tier, sequence_no)
);

-- 3) Career Events (instantiated schedule items for a specific career save)
CREATE TABLE IF NOT EXISTS career_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  template_id UUID REFERENCES career_schedule_templates(id),
  season SMALLINT NOT NULL,
  sequence_no SMALLINT NOT NULL,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  format_legs SMALLINT NOT NULL DEFAULT 3,
  bracket_size SMALLINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','skipped')),
  result JSONB,                             -- outcome data (placement, REP earned, etc.)
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_events_career ON career_events(career_id, season, sequence_no);

-- 4) Career Opponents (persistent generated opponents per career save)
CREATE TABLE IF NOT EXISTS career_opponents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  nickname TEXT,                             -- e.g. "The Hammer"
  hometown TEXT,                             -- fictional
  tier SMALLINT NOT NULL,                    -- tier they belong to
  archetype TEXT NOT NULL CHECK (archetype IN ('scorer','finisher','grinder','streaky','clutch','allrounder')),
  skill_rating REAL NOT NULL,                -- base skill 0-100, modified by difficulty
  is_rival BOOLEAN NOT NULL DEFAULT FALSE,   -- core rival that repeats
  avatar_seed INT,                           -- for deterministic avatar generation
  metadata JSONB DEFAULT '{}',               -- extra flavour data
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_opponents_career_tier ON career_opponents(career_id, tier);

-- 5) Career Matches (links career event to actual match played)
CREATE TABLE IF NOT EXISTS career_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES career_events(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES career_opponents(id),
  bracket_round SMALLINT,                    -- NULL for league, 1/2/3/4 for bracket rounds
  bracket_position SMALLINT,                 -- position in bracket
  format_legs SMALLINT NOT NULL,
  result TEXT CHECK (result IN ('win','loss','pending')),
  player_legs_won SMALLINT DEFAULT 0,
  opponent_legs_won SMALLINT DEFAULT 0,
  player_average REAL,
  opponent_average REAL,
  player_checkout_pct REAL,
  player_180s SMALLINT DEFAULT 0,
  player_highest_checkout SMALLINT,
  rep_earned BIGINT DEFAULT 0,
  rep_breakdown JSONB,                       -- { base, difficulty_bonus, milestone_bonus, sponsor_bonus, form_bonus }
  match_room_id UUID,                        -- links to existing match_rooms if using match engine
  played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_matches_career ON career_matches(career_id);
CREATE INDEX idx_career_matches_event ON career_matches(event_id);

-- 6) Career League Tables (standings per season per tier)
CREATE TABLE IF NOT EXISTS career_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  tier SMALLINT NOT NULL,
  opponent_id UUID REFERENCES career_opponents(id),  -- NULL = the player themselves
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  played SMALLINT NOT NULL DEFAULT 0,
  won SMALLINT NOT NULL DEFAULT 0,
  lost SMALLINT NOT NULL DEFAULT 0,
  legs_for SMALLINT NOT NULL DEFAULT 0,
  legs_against SMALLINT NOT NULL DEFAULT 0,
  points SMALLINT NOT NULL DEFAULT 0,        -- 2 for win, 0 for loss (or 3/1/0 if you prefer)
  average REAL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_standings_career ON career_league_standings(career_id, season, tier);

-- 7) Career Bracket State (for open/qualifier/trial tournaments)
CREATE TABLE IF NOT EXISTS career_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES career_events(id) ON DELETE CASCADE,
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  bracket_size SMALLINT NOT NULL CHECK (bracket_size IN (8, 16, 32)),
  rounds_total SMALLINT NOT NULL,
  current_round SMALLINT NOT NULL DEFAULT 1,
  bracket_data JSONB NOT NULL DEFAULT '[]',  -- full bracket tree with matchups + results
  winner_id UUID,                            -- opponent_id or 'player' marker
  player_eliminated_round SMALLINT,          -- NULL if still in / won
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_brackets_event ON career_brackets(event_id);

-- 8) Career Sponsors Catalog (available sponsor templates)
CREATE TABLE IF NOT EXISTS career_sponsor_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                        -- fictional sponsor name
  tier_min SMALLINT NOT NULL DEFAULT 2,      -- minimum tier to appear
  tier_max SMALLINT NOT NULL DEFAULT 5,
  rep_bonus_pct REAL DEFAULT 0,              -- e.g. 0.10 = +10% REP on league wins
  rep_objectives JSONB DEFAULT '[]',         -- [{condition, bonus_rep, description}]
  cosmetic_unlock TEXT,                      -- title/badge/flair ID
  flavour_text TEXT,                         -- "Bullseye Brewing wants to sponsor your league campaign"
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','legendary'))
);

-- 9) Career Sponsor Contracts (active sponsor deals per career)
CREATE TABLE IF NOT EXISTS career_sponsor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  sponsor_id UUID NOT NULL REFERENCES career_sponsor_catalog(id),
  slot SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 3),
  accepted_at_week SMALLINT NOT NULL,
  accepted_at_season SMALLINT NOT NULL,
  expires_at_week SMALLINT,                  -- NULL = end of season
  objectives_progress JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','expired','replaced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(career_id, slot, status) -- only one active per slot (enforced in app logic too)
);

CREATE INDEX idx_career_sponsors_career ON career_sponsor_contracts(career_id);

-- 10) Career World Ranking (Tier 5 — tracks ranking points per opponent + player)
CREATE TABLE IF NOT EXISTS career_world_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES career_opponents(id),  -- NULL = the player
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  ranking_points BIGINT NOT NULL DEFAULT 0,
  season_points JSONB DEFAULT '{}',          -- { "season_1": 500, "season_2": 300 } for rolling calc
  current_rank SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_world_rankings_career ON career_world_rankings(career_id);

-- 11) Career Premier League (overlay season tracking)
CREATE TABLE IF NOT EXISTS career_premier_league_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finals','completed')),
  total_nights SMALLINT NOT NULL DEFAULT 16,
  current_night SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(career_id, season)
);

-- 12) Premier League Table (points per participant)
CREATE TABLE IF NOT EXISTS career_premier_league_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pl_season_id UUID NOT NULL REFERENCES career_premier_league_seasons(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES career_opponents(id),  -- NULL = the player
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  nights_played SMALLINT NOT NULL DEFAULT 0,
  nights_won SMALLINT NOT NULL DEFAULT 0,    -- won the whole night (QF→SF→Final)
  points SMALLINT NOT NULL DEFAULT 0,        -- 5 winner, 3 runner-up, 2 losing SF
  legs_for SMALLINT NOT NULL DEFAULT 0,
  legs_against SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_pl_table_season ON career_premier_league_table(pl_season_id);

-- 13) Career Milestones / Timeline (career moments)
CREATE TABLE IF NOT EXISTS career_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL,              -- 'first_180', 'first_tournament_win', 'promotion', 'premier_league_selected', etc.
  title TEXT NOT NULL,
  description TEXT,
  tier SMALLINT,
  season SMALLINT,
  week SMALLINT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_career_milestones_career ON career_milestones(career_id);

-- 14) Enable RLS on all career tables
ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_sponsor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_world_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_premier_league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_premier_league_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own career data
CREATE POLICY career_profiles_user ON career_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY career_events_user ON career_events FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_opponents_user ON career_opponents FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_matches_user ON career_matches FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_standings_user ON career_league_standings FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_brackets_user ON career_brackets FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_sponsors_user ON career_sponsor_contracts FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_world_rankings_user ON career_world_rankings FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_pl_seasons_user ON career_premier_league_seasons FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);
CREATE POLICY career_pl_table_user ON career_premier_league_table FOR ALL USING (
  pl_season_id IN (
    SELECT id FROM career_premier_league_seasons
    WHERE career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
  )
);
CREATE POLICY career_milestones_user ON career_milestones FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);

-- Schedule templates are read-only for everyone (seeded data)
ALTER TABLE career_schedule_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY career_schedule_read ON career_schedule_templates FOR SELECT USING (true);
-- Sponsor catalog is also read-only
ALTER TABLE career_sponsor_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY career_sponsor_catalog_read ON career_sponsor_catalog FOR SELECT USING (true);
