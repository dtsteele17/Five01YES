/*
  # Create All Missing Critical Tables

  This script creates all tables that are missing from your database.
  Run this in Supabase SQL Editor.

  Tables created:
  1. user_stats - Aggregate user statistics
  2. player_stats - Player win/loss records and streaks
  3. achievements_master - Master list of all achievements
  4. user_achievements - Track which achievements users have unlocked
  5. match_players - Per-match player statistics
  6. match_visits - Per-visit throw data for matches

  Safe to run multiple times - uses IF NOT EXISTS checks.
*/

-- =============================================================================
-- 1. USER_STATS TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can view their own stats'
  ) THEN
    CREATE POLICY "Users can view their own stats"
      ON user_stats FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can insert their own stats'
  ) THEN
    CREATE POLICY "Users can insert their own stats"
      ON user_stats FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can update their own stats'
  ) THEN
    CREATE POLICY "Users can update their own stats"
      ON user_stats FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_best_average ON user_stats(best_average DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_180s ON user_stats(total_180s DESC);

-- =============================================================================
-- 2. PLAYER_STATS TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can read own player stats'
  ) THEN
    CREATE POLICY "Users can read own player stats"
      ON player_stats FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can insert own player stats'
  ) THEN
    CREATE POLICY "Users can insert own player stats"
      ON player_stats FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can update own player stats'
  ) THEN
    CREATE POLICY "Users can update own player stats"
      ON player_stats FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- =============================================================================
-- 3. ACHIEVEMENTS_MASTER TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'achievements_master' AND policyname = 'Anyone can view achievements'
  ) THEN
    CREATE POLICY "Anyone can view achievements"
      ON achievements_master FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_achievements_master_category ON achievements_master(category);
CREATE INDEX IF NOT EXISTS idx_achievements_master_key ON achievements_master(achievement_key);

-- =============================================================================
-- 4. USER_ACHIEVEMENTS TABLE
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_achievements' AND policyname = 'Users can view own achievements'
  ) THEN
    CREATE POLICY "Users can view own achievements"
      ON user_achievements FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_achievements' AND policyname = 'Users can insert own achievements'
  ) THEN
    CREATE POLICY "Users can insert own achievements"
      ON user_achievements FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_achievements' AND policyname = 'Users can update own achievements'
  ) THEN
    CREATE POLICY "Users can update own achievements"
      ON user_achievements FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked_at ON user_achievements(unlocked_at DESC);

-- =============================================================================
-- 5. MATCH_PLAYERS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  is_bot boolean NOT NULL DEFAULT false,
  bot_level integer,
  seat integer NOT NULL CHECK (seat IN (1, 2)),
  player_name text NOT NULL,
  starting_score integer NOT NULL,
  final_score integer NOT NULL DEFAULT 0,
  legs_won integer NOT NULL DEFAULT 0,
  legs_lost integer NOT NULL DEFAULT 0,
  checkout_attempts integer NOT NULL DEFAULT 0,
  checkout_hits integer NOT NULL DEFAULT 0,
  checkout_darts_attempted integer NOT NULL DEFAULT 0,
  darts_thrown integer NOT NULL DEFAULT 0,
  points_scored integer NOT NULL DEFAULT 0,
  avg_3dart numeric(5,2) NOT NULL DEFAULT 0,
  first_9_dart_avg numeric(5,2) NOT NULL DEFAULT 0,
  highest_score integer NOT NULL DEFAULT 0,
  highest_checkout integer NOT NULL DEFAULT 0,
  count_100_plus integer NOT NULL DEFAULT 0,
  count_140_plus integer NOT NULL DEFAULT 0,
  count_180 integer NOT NULL DEFAULT 0,
  checkout_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, seat)
);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_players' AND policyname = 'Users can view match players for their matches'
  ) THEN
    CREATE POLICY "Users can view match players for their matches"
      ON match_players FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_players.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_players' AND policyname = 'Users can insert match players for their matches'
  ) THEN
    CREATE POLICY "Users can insert match players for their matches"
      ON match_players FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_players.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

-- =============================================================================
-- 6. MATCH_VISITS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS match_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  seat integer NOT NULL CHECK (seat IN (1, 2)),
  leg_number integer NOT NULL,
  visit_number integer NOT NULL,
  score integer NOT NULL DEFAULT 0,
  remaining_before integer NOT NULL,
  remaining_after integer NOT NULL,
  is_bust boolean NOT NULL DEFAULT false,
  is_checkout boolean NOT NULL DEFAULT false,
  dart_1_segment text,
  dart_2_segment text,
  dart_3_segment text,
  darts_thrown integer NOT NULL DEFAULT 3 CHECK (darts_thrown BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, leg_number, seat, visit_number)
);

ALTER TABLE match_visits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_visits' AND policyname = 'Users can view visits for their matches'
  ) THEN
    CREATE POLICY "Users can view visits for their matches"
      ON match_visits FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_visits.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_visits' AND policyname = 'Users can insert visits for their matches'
  ) THEN
    CREATE POLICY "Users can insert visits for their matches"
      ON match_visits FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_visits.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_visits' AND policyname = 'Users can update visits for their matches'
  ) THEN
    CREATE POLICY "Users can update visits for their matches"
      ON match_visits FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_visits.match_id
          AND matches.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_visits.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_visits' AND policyname = 'Users can delete visits for their matches'
  ) THEN
    CREATE POLICY "Users can delete visits for their matches"
      ON match_visits FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM matches
          WHERE matches.id = match_visits.match_id
          AND matches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_visits_match_id ON match_visits(match_id);
CREATE INDEX IF NOT EXISTS idx_match_visits_player_id ON match_visits(player_id);
CREATE INDEX IF NOT EXISTS idx_match_visits_leg ON match_visits(match_id, leg_number);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT
  'Tables created successfully!' as status,
  COUNT(*) FILTER (WHERE table_name = 'user_stats') as user_stats,
  COUNT(*) FILTER (WHERE table_name = 'player_stats') as player_stats,
  COUNT(*) FILTER (WHERE table_name = 'achievements_master') as achievements_master,
  COUNT(*) FILTER (WHERE table_name = 'user_achievements') as user_achievements,
  COUNT(*) FILTER (WHERE table_name = 'match_players') as match_players,
  COUNT(*) FILTER (WHERE table_name = 'match_visits') as match_visits
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_stats', 'player_stats', 'achievements_master', 'user_achievements', 'match_players', 'match_visits');
