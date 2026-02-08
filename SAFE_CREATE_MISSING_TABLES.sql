/*
  # Safely Create Missing Tables

  This script checks which tables exist and only creates the missing ones.
  Safe to run multiple times.
*/

-- First, let's check what we have
DO $$
DECLARE
  has_matches boolean;
  has_profiles boolean;
  has_user_stats boolean;
  has_player_stats boolean;
  has_achievements_master boolean;
  has_user_achievements boolean;
  has_match_players boolean;
  has_match_visits boolean;
BEGIN
  -- Check which tables exist
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'matches') INTO has_matches;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') INTO has_profiles;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_stats') INTO has_user_stats;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'player_stats') INTO has_player_stats;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achievements_master') INTO has_achievements_master;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_achievements') INTO has_user_achievements;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_players') INTO has_match_players;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_visits') INTO has_match_visits;

  -- Report what we found
  RAISE NOTICE '=== TABLE STATUS ===';
  RAISE NOTICE 'matches: %', CASE WHEN has_matches THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'profiles: %', CASE WHEN has_profiles THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'user_stats: %', CASE WHEN has_user_stats THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'player_stats: %', CASE WHEN has_player_stats THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'achievements_master: %', CASE WHEN has_achievements_master THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'user_achievements: %', CASE WHEN has_user_achievements THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'match_players: %', CASE WHEN has_match_players THEN '✓ EXISTS' ELSE '✗ MISSING' END;
  RAISE NOTICE 'match_visits: %', CASE WHEN has_match_visits THEN '✓ EXISTS' ELSE '✗ MISSING' END;

  -- Fail if critical dependencies are missing
  IF NOT has_profiles THEN
    RAISE EXCEPTION 'CRITICAL: profiles table is missing. You need to run your base migrations first.';
  END IF;
END $$;

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
-- Final verification
-- =============================================================================

DO $$
DECLARE
  created_count integer;
BEGIN
  SELECT COUNT(*) INTO created_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('user_stats', 'player_stats', 'achievements_master', 'user_achievements');

  RAISE NOTICE '=== RESULT ===';
  RAISE NOTICE 'Created/verified % tables successfully', created_count;
  RAISE NOTICE 'Note: match_players and match_visits tables should already exist from your migrations';
END $$;
