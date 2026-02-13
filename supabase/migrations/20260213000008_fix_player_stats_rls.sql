-- Fix RLS policy on player_stats to allow all authenticated users to view stats
-- This is needed for displaying 3-dart averages in quick match lobbies

-- Drop existing SELECT policy if it exists
DROP POLICY IF EXISTS "Users can view their own stats" ON player_stats;
DROP POLICY IF EXISTS "Users can view all stats" ON player_stats;
DROP POLICY IF EXISTS "Allow public read access to player_stats" ON player_stats;

-- Create new policy that allows all authenticated users to view all stats
CREATE POLICY "Allow authenticated users to view all player stats"
  ON player_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- Also allow anon users to view stats (for public lobby listings)
CREATE POLICY "Allow anon users to view all player stats"
  ON player_stats
  FOR SELECT
  TO anon
  USING (true);

-- Keep the insert/update policies restricted to the owner
DROP POLICY IF EXISTS "Users can insert their own stats" ON player_stats;
CREATE POLICY "Users can insert their own stats"
  ON player_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own stats" ON player_stats;
CREATE POLICY "Users can update their own stats"
  ON player_stats
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create RPC function to get player stats for lobby display (bypasses RLS)
CREATE OR REPLACE FUNCTION get_player_stats_for_lobby(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  overall_3dart_avg NUMERIC,
  matches_played INTEGER,
  matches_won INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.user_id,
    ps.overall_3dart_avg,
    ps.matches_played,
    ps.matches_won
  FROM player_stats ps
  WHERE ps.user_id = ANY(p_user_ids);
END;
$$;

-- Grant execute to all users
GRANT EXECUTE ON FUNCTION get_player_stats_for_lobby TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_stats_for_lobby TO anon;

-- Verify RLS is enabled
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
