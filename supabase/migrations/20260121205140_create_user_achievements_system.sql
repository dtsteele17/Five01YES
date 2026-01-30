/*
  # Create User Achievements System

  1. New Tables
    - `user_achievements`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `achievement_id` (text) - achievement identifier from lib/achievements.ts
      - `completed` (boolean) - whether the achievement is completed
      - `progress` (integer) - current progress toward achievement
      - `completed_at` (timestamptz) - when the achievement was completed
      - `created_at` (timestamptz) - when the record was created
      - `updated_at` (timestamptz) - when the record was last updated

  2. Security
    - Enable RLS on `user_achievements` table
    - Add policy for users to read their own achievements
    - Add policy for users to update their own achievements (for progress tracking)

  3. Indexes
    - Add index on user_id for faster lookups
    - Add unique constraint on (user_id, achievement_id) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  completed boolean DEFAULT false,
  progress integer DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own achievements"
  ON user_achievements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_completed ON user_achievements(completed);
