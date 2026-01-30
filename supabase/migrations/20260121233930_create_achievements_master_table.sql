/*
  # Create Achievements Master Table
  
  ## Overview
  This migration creates the achievements master table that defines all available
  achievements in the system. This serves as the source of truth for achievement
  definitions, criteria, and rewards.
  
  ## New Tables
  
  ### `achievements`
  - `id` (uuid, primary key) - Unique achievement identifier
  - `code` (text, unique) - Unique code for programmatic reference (e.g., "SCORE_69")
  - `category` (text) - Achievement category (General/Funny/Scoring/Finishing/Streaks)
  - `name` (text) - Display name of the achievement
  - `description` (text) - Detailed description of how to unlock
  - `icon` (text) - Icon identifier or emoji
  - `condition` (jsonb) - JSON structure defining unlock conditions
  - `xp` (integer) - Experience points awarded
  - `is_hidden` (boolean) - Whether achievement is hidden until unlocked
  - `tier` (text) - Rarity tier (Common/Rare/Epic/Legendary)
  - `created_at` (timestamptz) - Record creation time
  
  ## Security
  - Enable RLS on achievements table
  - All authenticated users can read achievements
  - Only admins can modify achievements (enforced by admin-only policies)
  
  ## Indexes
  - Index on code for fast lookup
  - Index on category for filtered queries
*/

CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  category text NOT NULL CHECK (category IN ('General', 'Funny', 'Scoring', 'Finishing', 'Streaks', 'Competitive')),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🎯',
  condition jsonb,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  is_hidden boolean DEFAULT false,
  tier text DEFAULT 'Common' CHECK (tier IN ('Common', 'Rare', 'Epic', 'Legendary')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_achievements_code ON achievements(code);
CREATE INDEX IF NOT EXISTS idx_achievements_category ON achievements(category);

ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements"
  ON achievements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only service role can insert achievements"
  ON achievements FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Only service role can update achievements"
  ON achievements FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only service role can delete achievements"
  ON achievements FOR DELETE
  TO service_role
  USING (true);
