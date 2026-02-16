-- XP System Database Migration
-- Run this in your Supabase SQL Editor

-- Add XP and level columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- Create training_sessions table
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_id ON training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_game_type ON training_sessions(game_type);
CREATE INDEX IF NOT EXISTS idx_training_sessions_created_at ON training_sessions(created_at);

-- Add RLS policies for training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own training sessions
CREATE POLICY "Users can view own training sessions"
  ON training_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own training sessions
CREATE POLICY "Users can insert own training sessions"
  ON training_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own training sessions
CREATE POLICY "Users can update own training sessions"
  ON training_sessions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE training_sessions IS 'Stores training game sessions and XP earned for the training mode';
COMMENT ON COLUMN profiles.xp IS 'Total experience points earned by the player';
COMMENT ON COLUMN profiles.level IS 'Current player level based on XP';
