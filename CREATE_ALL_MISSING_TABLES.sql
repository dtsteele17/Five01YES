/*
  # Create All Missing Tables

  This migration creates all 6 missing tables needed for the application:
  1. match_players - Player participation in matches
  2. match_visits - Individual visit records
  3. user_stats - Aggregate user statistics
  4. player_stats - Player win/loss records
  5. achievements_master - Achievement definitions
  6. user_achievements - User achievement unlocks

  Safe to run multiple times.
*/

-- =============================================================================
-- 1. MATCH_PLAYERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  player_number integer NOT NULL CHECK (player_number IN (1, 2)),
  player_name text NOT NULL,
  final_position integer,
  legs_won integer DEFAULT 0,
  sets_won integer DEFAULT 0,
  three_dart_avg numeric(5,2) DEFAULT 0,
  first_nine_avg numeric(5,2) DEFAULT 0,
  checkout_pct numeric(5,2) DEFAULT 0,
  highest_score integer DEFAULT 0,
  count_180 integer DEFAULT 0,
  count_140_plus integer DEFAULT 0,
  count_100_plus integer DEFAULT 0,
  total_darts_thrown integer DEFAULT 0,
  checkout_attempts integer DEFAULT 0,
  checkouts_made integer DEFAULT 0,
  highest_checkout integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, player_number)
);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view match players for their matches" ON match_players;
CREATE POLICY "Users can view match players for their matches"
  ON match_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (m.user_id = auth.uid() OR m.status = 'completed')
    )
  );

DROP POLICY IF EXISTS "Users can insert match players" ON match_players;
CREATE POLICY "Users can insert match players"
  ON match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update match players for their matches" ON match_players;
CREATE POLICY "Users can update match players for their matches"
  ON match_players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

-- =============================================================================
-- 2. MATCH_VISITS TABLE (Enhanced version)
-- =============================================================================

CREATE TABLE IF NOT EXISTS match_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  leg_number integer NOT NULL,
  player_number integer NOT NULL CHECK (player_number IN (1, 2)),
  visit_number integer NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 180),
  remaining_score integer NOT NULL,
  is_bust boolean DEFAULT false,
  is_checkout boolean DEFAULT false,
  darts_thrown integer DEFAULT 3 CHECK (darts_thrown BETWEEN 1 AND 3),
  dart1_segment text,
  dart1_multiplier integer,
  dart1_value integer,
  dart2_segment text,
  dart2_multiplier integer,
  dart2_value integer,
  dart3_segment text,
  dart3_multiplier integer,
  dart3_value integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE match_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view match visits" ON match_visits;
CREATE POLICY "Users can view match visits"
  ON match_visits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND (m.user_id = auth.uid() OR m.status = 'completed')
    )
  );

DROP POLICY IF EXISTS "Users can insert match visits" ON match_visits;
CREATE POLICY "Users can insert match visits"
  ON match_visits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update match visits" ON match_visits;
CREATE POLICY "Users can update match visits"
  ON match_visits FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND m.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_match_visits_match_id ON match_visits(match_id);
CREATE INDEX IF NOT EXISTS idx_match_visits_leg_number ON match_visits(leg_number);
CREATE INDEX IF NOT EXISTS idx_match_visits_player_number ON match_visits(player_number);

-- =============================================================================
-- 3. USER_STATS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_stats (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_matches integer NOT NULL DEFAULT 0 CHECK (total_matches >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  total_points_scored bigint NOT NULL DEFAULT 0 CHECK (total_points_scored >= 0),
  total_darts_thrown bigint NOT NULL DEFAULT 0 CHECK (total_darts_thrown >= 0),
  total_180s integer NOT NULL DEFAULT 0 CHECK (total_180s >= 0),
  total_checkout_attempts integer NOT NULL DEFAULT 0 CHECK (total_checkout_attempts >= 0),
  total_checkouts_made integer NOT NULL DEFAULT 0 CHECK (total_checkouts_made >= 0),
  highest_checkout integer NOT NULL DEFAULT 0 CHECK (highest_checkout >= 0 AND highest_checkout <= 170),
  best_average numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (best_average >= 0),
  best_first9_average numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (best_first9_average >= 0),
  total_100_plus integer NOT NULL DEFAULT 0 CHECK (total_100_plus >= 0),
  total_140_plus integer NOT NULL DEFAULT 0 CHECK (total_140_plus >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own stats" ON user_stats;
CREATE POLICY "Users can view their own stats"
  ON user_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own stats" ON user_stats;
CREATE POLICY "Users can insert their own stats"
  ON user_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stats" ON user_stats;
CREATE POLICY "Users can update their own stats"
  ON user_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_best_average ON user_stats(best_average DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_180s ON user_stats(total_180s DESC);

-- =============================================================================
-- 4. PLAYER_STATS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS player_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wins_total integer DEFAULT 0,
  losses_total integer DEFAULT 0,
  current_win_streak integer DEFAULT 0,
  best_win_streak integer DEFAULT 0,
  total_matches integer DEFAULT 0,
  total_180s integer DEFAULT 0,
  total_checkouts integer DEFAULT 0,
  total_checkout_attempts integer DEFAULT 0,
  highest_checkout_ever integer DEFAULT 0,
  best_average_ever numeric DEFAULT 0,
  most_180s_in_match integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own player stats" ON player_stats;
CREATE POLICY "Users can read own player stats"
  ON player_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own player stats" ON player_stats;
CREATE POLICY "Users can insert own player stats"
  ON player_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own player stats" ON player_stats;
CREATE POLICY "Users can update own player stats"
  ON player_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- =============================================================================
-- 5. ACHIEVEMENTS_MASTER TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS achievements_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'award',
  category text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze',
  is_secret boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE achievements_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view achievements" ON achievements_master;
CREATE POLICY "Anyone can view achievements"
  ON achievements_master FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_achievements_master_category ON achievements_master(category);
CREATE INDEX IF NOT EXISTS idx_achievements_master_key ON achievements_master(achievement_key);

-- =============================================================================
-- 6. USER_ACHIEVEMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements_master(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  progress integer DEFAULT 100,
  notified boolean DEFAULT false,
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own achievements" ON user_achievements;
CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own achievements" ON user_achievements;
CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked_at ON user_achievements(unlocked_at DESC);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  table_count integer;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'match_players', 'match_visits', 'user_stats',
      'player_stats', 'achievements_master', 'user_achievements'
    );

  RAISE NOTICE '=== SUCCESS ===';
  RAISE NOTICE 'Created/verified % of 6 required tables', table_count;

  IF table_count = 6 THEN
    RAISE NOTICE '✓ All tables ready!';
  ELSE
    RAISE WARNING 'Only % tables found. Expected 6.', table_count;
  END IF;
END $$;
