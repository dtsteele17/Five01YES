/*
  # Add Missing Stats Fields and Player Stats Table

  1. Changes to match_players
    - Add highest_checkout (integer)
    - Add points_scored (integer) - sum of all visit scores
    - Add checkout_percentage (numeric) - calculated field
    - Add first_9_dart_avg (numeric) - calculated field
    - Add legs_lost (integer) - calculated field

  2. New Table: player_stats
    - Tracks overall player statistics including win/loss record and streaks
    - Fields: wins_total, losses_total, current_win_streak, best_win_streak
    - Updated after each match completion

  3. Security
    - Enable RLS on player_stats
    - Users can read own stats
    - System can update stats
*/

-- Add missing fields to match_players
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS highest_checkout integer DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS points_scored integer DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS checkout_percentage numeric DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS first_9_dart_avg numeric DEFAULT 0;
ALTER TABLE match_players ADD COLUMN IF NOT EXISTS legs_lost integer DEFAULT 0;

-- Create player_stats table
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

-- Enable RLS on player_stats
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for player_stats
CREATE POLICY "Users can read own player stats"
  ON player_stats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player stats"
  ON player_stats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player stats"
  ON player_stats FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- Create function to initialize player_stats if not exists
CREATE OR REPLACE FUNCTION initialize_player_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO player_stats (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;