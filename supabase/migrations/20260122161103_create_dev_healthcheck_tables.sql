/*
  # Create Development Health Check Tables

  1. New Tables
    - `healthcheck` - Simple public table to verify basic connectivity
      - `id` (int, primary key)
      - `message` (text)
    
    - `user_connection_test` - Test user-owned data with RLS
      - `id` (uuid, primary key)
      - `user_id` (uuid, not null)
      - `created_at` (timestamptz, default now())
    
    - `realtime_test` - Test realtime subscriptions
      - `id` (uuid, primary key)
      - `user_id` (uuid, not null)
      - `created_at` (timestamptz, default now())

  2. Security
    - `healthcheck` - Public read access (for connectivity test)
    - `user_connection_test` - RLS enabled, users can only access their own data
    - `realtime_test` - RLS enabled, users can only access their own data

  3. Realtime
    - Enable realtime replication on `realtime_test` table
*/

-- Create healthcheck table (public read)
CREATE TABLE IF NOT EXISTS healthcheck (
  id int PRIMARY KEY,
  message text NOT NULL
);

-- Seed healthcheck data
INSERT INTO healthcheck (id, message)
VALUES (1, 'ok')
ON CONFLICT (id) DO UPDATE SET message = 'ok';

-- Enable RLS but allow public read
ALTER TABLE healthcheck ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for healthcheck" ON healthcheck;
CREATE POLICY "Public read access for healthcheck"
  ON healthcheck
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create user_connection_test table
CREATE TABLE IF NOT EXISTS user_connection_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for user_connection_test
ALTER TABLE user_connection_test ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own connection test data" ON user_connection_test;
CREATE POLICY "Users can read own connection test data"
  ON user_connection_test
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own connection test data" ON user_connection_test;
CREATE POLICY "Users can insert own connection test data"
  ON user_connection_test
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connection test data" ON user_connection_test;
CREATE POLICY "Users can delete own connection test data"
  ON user_connection_test
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create realtime_test table
CREATE TABLE IF NOT EXISTS realtime_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for realtime_test
ALTER TABLE realtime_test ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own realtime test data" ON realtime_test;
CREATE POLICY "Users can read own realtime test data"
  ON realtime_test
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own realtime test data" ON realtime_test;
CREATE POLICY "Users can insert own realtime test data"
  ON realtime_test
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime replication for realtime_test
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'realtime_test'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE realtime_test;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_connection_test_user_id ON user_connection_test(user_id);
CREATE INDEX IF NOT EXISTS idx_realtime_test_user_id ON realtime_test(user_id);
