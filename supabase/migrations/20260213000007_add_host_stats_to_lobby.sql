-- Add host stats columns to quick_match_lobbies for display
ALTER TABLE quick_match_lobbies
ADD COLUMN IF NOT EXISTS player1_3dart_avg NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_3dart_avg NUMERIC DEFAULT 0;

-- Create function to get player stats for public display (bypasses RLS)
CREATE OR REPLACE FUNCTION get_player_stats_for_display(p_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  overall_3dart_avg NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ps.user_id, ps.overall_3dart_avg
  FROM player_stats ps
  WHERE ps.user_id = ANY(p_user_ids);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_player_stats_for_display TO authenticated;

-- Create function to fetch player stats for display purposes
CREATE OR REPLACE FUNCTION get_player_3dart_avg(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT overall_3dart_avg INTO v_avg
  FROM player_stats
  WHERE user_id = p_user_id;
  
  RETURN COALESCE(v_avg, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_player_3dart_avg TO authenticated;
