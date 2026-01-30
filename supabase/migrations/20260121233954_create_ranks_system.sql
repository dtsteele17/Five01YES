/*
  # Create Ranks System
  
  ## Overview
  This migration creates the ranks system for tracking player progression through
  competitive tiers and divisions based on Ranked Points (RP).
  
  ## New Tables
  
  ### `ranks`
  - `id` (uuid, primary key) - Unique rank identifier
  - `tier` (text) - Rank tier name (Bronze/Silver/Gold/Platinum/Champion/Grand Champion)
  - `division` (integer) - Division within tier (1-4, where 4 is highest)
  - `min_rp` (integer) - Minimum RP required for this rank
  - `max_rp` (integer) - Maximum RP for this rank
  - `icon` (text) - Icon or emoji representing the rank
  - `color` (text) - Color hex code for UI display
  - `order_index` (integer) - Sort order for rank progression
  - `created_at` (timestamptz) - Record creation time
  
  ### `user_rank`
  - `user_id` (uuid, primary key) - Reference to user profile
  - `rp` (integer) - Current Ranked Points
  - `tier` (text) - Current tier
  - `division` (integer) - Current division
  - `peak_rp` (integer) - Highest RP ever achieved
  - `peak_tier` (text) - Highest tier ever achieved
  - `peak_division` (integer) - Highest division ever achieved
  - `wins` (integer) - Total ranked wins
  - `losses` (integer) - Total ranked losses
  - `updated_at` (timestamptz) - Last update time
  - `created_at` (timestamptz) - Record creation time
  
  ## Security
  - Enable RLS on both tables
  - All authenticated users can read ranks (public reference data)
  - Users can read their own rank data
  - System updates user_rank (via edge functions or service role)
  
  ## Indexes
  - Index on tier and division for rank lookups
  - Index on rp for leaderboard queries
*/

CREATE TABLE IF NOT EXISTS ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Champion', 'Grand Champion')),
  division integer NOT NULL CHECK (division >= 1 AND division <= 4),
  min_rp integer NOT NULL CHECK (min_rp >= 0),
  max_rp integer NOT NULL CHECK (max_rp > min_rp),
  icon text DEFAULT '🎯',
  color text DEFAULT '#666666',
  order_index integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tier, division),
  UNIQUE(order_index)
);

CREATE TABLE IF NOT EXISTS user_rank (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  rp integer DEFAULT 0 CHECK (rp >= 0),
  tier text DEFAULT 'Bronze' CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Champion', 'Grand Champion')),
  division integer DEFAULT 1 CHECK (division >= 1 AND division <= 4),
  peak_rp integer DEFAULT 0 CHECK (peak_rp >= 0),
  peak_tier text CHECK (peak_tier IN ('Bronze', 'Silver', 'Gold', 'Platinum', 'Champion', 'Grand Champion') OR peak_tier IS NULL),
  peak_division integer CHECK (peak_division >= 1 AND peak_division <= 4 OR peak_division IS NULL),
  wins integer DEFAULT 0 CHECK (wins >= 0),
  losses integer DEFAULT 0 CHECK (losses >= 0),
  win_streak integer DEFAULT 0 CHECK (win_streak >= 0),
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ranks_tier_division ON ranks(tier, division);
CREATE INDEX IF NOT EXISTS idx_ranks_order ON ranks(order_index);
CREATE INDEX IF NOT EXISTS idx_user_rank_rp ON user_rank(rp DESC);
CREATE INDEX IF NOT EXISTS idx_user_rank_tier_division ON user_rank(tier, division);

ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view ranks"
  ON ranks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can view their own rank"
  ON user_rank FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view all ranks for leaderboard"
  ON user_rank FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert user ranks"
  ON user_rank FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update user ranks"
  ON user_rank FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
