-- Create User Stats Aggregate Table
--
-- 1. New Tables
--    - user_stats: Stores aggregate statistics for each user
--      - user_id (uuid, primary key, foreign key to profiles)
--      - total_matches (integer) - Total matches played
--      - wins (integer) - Total wins
--      - losses (integer) - Total losses
--      - total_points_scored (bigint) - Running total of points scored
--      - total_darts_thrown (bigint) - Running total of darts thrown
--      - total_180s (integer) - Total 180s hit
--      - total_checkout_attempts (integer) - Total checkout attempts
--      - total_checkouts_made (integer) - Total successful checkouts
--      - highest_checkout (integer) - Highest checkout achieved
--      - best_average (numeric) - Best 3-dart average achieved
--      - best_first9_average (numeric) - Best first 9 average
--      - total_100_plus (integer) - Total scores 100+
--      - total_140_plus (integer) - Total scores 140+
--
-- 2. Security
--    - Enable RLS on user_stats table
--    - Add policies for users to read/update their own stats
--
-- 3. Indexes
--    - Index on user_id for fast lookups
--    - Index on best_average for leaderboards

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

CREATE POLICY "Users can view their own stats"
  ON user_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stats"
  ON user_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats"
  ON user_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_best_average ON user_stats(best_average DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_180s ON user_stats(total_180s DESC);