/*
  # Create Matches and Stats System

  ## Overview
  This migration creates the complete matches system for tracking darts games,
  including local play, online matches, and comprehensive statistics.

  ## New Tables

  ### `matches`
  - `id` (uuid, primary key) - Unique match identifier
  - `user_id` (uuid, foreign key) - Match creator/host
  - `match_type` (text) - Type: 'local', 'quick', 'ranked', 'private'
  - `game_mode` (text) - Game mode: '501', '301'
  - `match_format` (text) - Format: 'best-of-1', 'best-of-3', 'best-of-5'
  - `double_out` (boolean) - Double out rule enabled
  - `straight_in` (boolean) - Straight in rule enabled
  - `status` (text) - Status: 'active', 'completed', 'abandoned'
  - `winner_id` (uuid) - Winner user ID or null if local opponent
  - `winner_name` (text) - Winner name for local matches
  - `player1_name` (text) - Player 1 name
  - `player2_name` (text) - Player 2 name
  - `player1_legs_won` (integer) - Legs won by player 1
  - `player2_legs_won` (integer) - Legs won by player 2
  - `camera_enabled` (boolean) - Camera was used
  - `started_at` (timestamptz) - Match start time
  - `completed_at` (timestamptz) - Match end time
  - `created_at` (timestamptz) - Record creation time
  - `updated_at` (timestamptz) - Record update time

  ### `match_legs`
  - `id` (uuid, primary key) - Unique leg identifier
  - `match_id` (uuid, foreign key) - Parent match
  - `leg_number` (integer) - Sequential leg number
  - `winner` (text) - 'player1' or 'player2'
  - `player1_darts_thrown` (integer) - Darts thrown by player 1
  - `player2_darts_thrown` (integer) - Darts thrown by player 2
  - `started_at` (timestamptz) - Leg start time
  - `completed_at` (timestamptz) - Leg end time
  - `created_at` (timestamptz) - Record creation time

  ### `match_visits`
  - `id` (uuid, primary key) - Unique visit identifier
  - `leg_id` (uuid, foreign key) - Parent leg
  - `player` (text) - 'player1' or 'player2'
  - `visit_number` (integer) - Sequential visit number for this player
  - `score` (integer) - Score for this visit (0-180)
  - `remaining_score` (integer) - Score remaining after this visit
  - `is_bust` (boolean) - Whether this visit was a bust
  - `is_checkout` (boolean) - Whether this visit finished the leg
  - `created_at` (timestamptz) - Record creation time

  ### `match_stats`
  - `id` (uuid, primary key) - Unique stat identifier
  - `match_id` (uuid, foreign key) - Parent match
  - `player` (text) - 'player1' or 'player2'
  - `three_dart_average` (decimal) - 3-dart average
  - `highest_score` (integer) - Highest visit score
  - `checkout_percentage` (decimal) - Checkout success rate
  - `count_100_plus` (integer) - Number of 100+ visits
  - `count_140_plus` (integer) - Number of 140+ visits
  - `count_180` (integer) - Number of 180 visits
  - `total_darts_thrown` (integer) - Total darts thrown
  - `created_at` (timestamptz) - Record creation time
  - `updated_at` (timestamptz) - Record update time

  ## Security
  - Enable RLS on all tables
  - Users can view their own matches
  - Local matches can be viewed by the creator
  - Match data is read-only after completion
*/

-- Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  match_type text NOT NULL CHECK (match_type IN ('local', 'quick', 'ranked', 'private')),
  game_mode text NOT NULL CHECK (game_mode IN ('501', 'Cricket', '301')),
  match_format text NOT NULL CHECK (match_format IN ('best-of-1', 'best-of-3', 'best-of-5')),
  double_out boolean DEFAULT true,
  straight_in boolean DEFAULT true,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  winner_id uuid REFERENCES auth.users(id),
  winner_name text,
  player1_name text NOT NULL,
  player2_name text NOT NULL,
  player1_legs_won integer DEFAULT 0,
  player2_legs_won integer DEFAULT 0,
  camera_enabled boolean DEFAULT false,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create match_legs table
CREATE TABLE IF NOT EXISTS match_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  leg_number integer NOT NULL,
  winner text CHECK (winner IN ('player1', 'player2')),
  player1_darts_thrown integer DEFAULT 0,
  player2_darts_thrown integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(match_id, leg_number)
);

-- Create match_visits table
CREATE TABLE IF NOT EXISTS match_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id uuid REFERENCES match_legs(id) ON DELETE CASCADE NOT NULL,
  player text NOT NULL CHECK (player IN ('player1', 'player2')),
  visit_number integer NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 180),
  remaining_score integer NOT NULL,
  is_bust boolean DEFAULT false,
  is_checkout boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create match_stats table
CREATE TABLE IF NOT EXISTS match_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  player text NOT NULL CHECK (player IN ('player1', 'player2')),
  three_dart_average decimal(5,2) DEFAULT 0,
  highest_score integer DEFAULT 0,
  checkout_percentage decimal(5,2) DEFAULT 0,
  count_100_plus integer DEFAULT 0,
  count_140_plus integer DEFAULT 0,
  count_180 integer DEFAULT 0,
  total_darts_thrown integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id, player)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_match_legs_match_id ON match_legs(match_id);
CREATE INDEX IF NOT EXISTS idx_match_visits_leg_id ON match_visits(leg_id);
CREATE INDEX IF NOT EXISTS idx_match_stats_match_id ON match_stats(match_id);

-- Enable Row Level Security
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for matches
CREATE POLICY "Users can view their own matches"
  ON matches FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own active matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'active')
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for match_legs
CREATE POLICY "Users can view legs from their matches"
  ON match_legs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert legs to their matches"
  ON match_legs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update legs in their matches"
  ON match_legs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = auth.uid()
    )
  );

-- RLS Policies for match_visits
CREATE POLICY "Users can view visits from their matches"
  ON match_visits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_legs
      JOIN matches ON matches.id = match_legs.match_id
      WHERE match_legs.id = match_visits.leg_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert visits to their matches"
  ON match_visits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM match_legs
      JOIN matches ON matches.id = match_legs.match_id
      WHERE match_legs.id = match_visits.leg_id
      AND matches.user_id = auth.uid()
    )
  );

-- RLS Policies for match_stats
CREATE POLICY "Users can view stats from their matches"
  ON match_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert stats to their matches"
  ON match_stats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update stats in their matches"
  ON match_stats FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = auth.uid()
    )
  );
