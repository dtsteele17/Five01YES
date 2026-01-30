/*
  # Create Match Players Table
  
  ## Overview
  This migration creates the match_players table to track individual player performance
  and statistics within each match. This enables detailed player-level analytics.
  
  ## New Tables
  
  ### `match_players`
  - `id` (uuid, primary key) - Unique player record identifier
  - `match_id` (uuid, foreign key) - Reference to parent match
  - `user_id` (uuid, foreign key, nullable) - Reference to user profile (null for bots/local)
  - `is_bot` (boolean) - Whether this player is a bot
  - `bot_level` (integer, nullable) - Bot difficulty level (1-5)
  - `seat` (integer) - Player position (1 or 2)
  - `player_name` (text) - Display name for this player
  - `starting_score` (integer) - Starting score (301 or 501)
  - `final_score` (integer) - Final score at match end
  - `legs_won` (integer) - Number of legs won
  - `checkout_attempts` (integer) - Times player had chance to checkout
  - `checkout_hits` (integer) - Successful checkouts
  - `first_9_total` (integer) - Sum of first 3 visits (first 9 darts)
  - `darts_thrown` (integer) - Total darts thrown in match
  - `avg_3dart` (numeric) - Three-dart average
  - `highest_score` (integer) - Highest single visit score
  - `count_100_plus` (integer) - Visits of 100+
  - `count_140_plus` (integer) - Visits of 140+
  - `count_180` (integer) - Perfect 180 visits
  - `created_at` (timestamptz) - Record creation time
  - `updated_at` (timestamptz) - Last update time
  
  ## Security
  - Enable RLS on match_players table
  - Users can view players from their own matches
  - Users can insert/update players for their own matches
  
  ## Indexes
  - Index on match_id for fast match lookups
  - Index on user_id for player history queries
*/

CREATE TABLE IF NOT EXISTS match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_bot boolean DEFAULT false,
  bot_level integer CHECK (bot_level >= 1 AND bot_level <= 5 OR bot_level IS NULL),
  seat integer NOT NULL CHECK (seat IN (1, 2)),
  player_name text NOT NULL,
  starting_score integer NOT NULL DEFAULT 501 CHECK (starting_score IN (301, 501)),
  final_score integer DEFAULT 0,
  legs_won integer DEFAULT 0,
  checkout_attempts integer DEFAULT 0,
  checkout_hits integer DEFAULT 0,
  first_9_total integer DEFAULT 0,
  darts_thrown integer DEFAULT 0,
  avg_3dart numeric(5,2) DEFAULT 0.00,
  highest_score integer DEFAULT 0 CHECK (highest_score >= 0 AND highest_score <= 180),
  count_100_plus integer DEFAULT 0,
  count_140_plus integer DEFAULT 0,
  count_180 integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view players from their matches"
  ON match_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_players.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert players to their matches"
  ON match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_players.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update players in their matches"
  ON match_players FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_players.match_id
      AND matches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_players.match_id
      AND matches.user_id = auth.uid()
    )
  );
