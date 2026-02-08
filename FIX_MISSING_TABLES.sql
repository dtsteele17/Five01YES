/*
  # Fix Missing Tables - Run this in Supabase SQL Editor

  This script creates the missing tables that are causing 404 errors:
  - user_stats: Aggregate user statistics
  - player_stats: Player win/loss records and streaks

  If these tables already exist, the script will skip them safely.
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

-- RLS Policies for user_stats
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
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can insert their own stats'
  ) THEN
    CREATE POLICY "Users can insert their own stats"
      ON user_stats FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
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

-- Indexes
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

-- RLS Policies for player_stats
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
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_stats' AND policyname = 'Users can insert own player stats'
  ) THEN
    CREATE POLICY "Users can insert own player stats"
      ON player_stats FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
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

-- Index
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- =============================================================================
-- DONE!
-- =============================================================================

-- Verify tables were created
SELECT
  'Tables created successfully!' as status,
  COUNT(*) FILTER (WHERE table_name = 'user_stats') as user_stats_exists,
  COUNT(*) FILTER (WHERE table_name = 'player_stats') as player_stats_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('user_stats', 'player_stats');
