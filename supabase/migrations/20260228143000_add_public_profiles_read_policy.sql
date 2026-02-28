/*
  Allow all authenticated users to read any profile (for search, viewing other players, etc.)
  This is safe — profiles contain only public info (username, display_name, avatar_url, bio, location).
*/

-- Enable RLS if not already
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to SELECT any profile
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
CREATE POLICY "Anyone can view profiles" ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Also create a search RPC for more reliable searching
CREATE OR REPLACE FUNCTION rpc_search_users(p_query text, p_limit integer DEFAULT 8)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM profiles p
  WHERE
    p.username ILIKE '%' || p_query || '%'
    OR p.display_name ILIKE '%' || p_query || '%'
  ORDER BY
    -- Exact matches first, then prefix matches, then contains
    CASE
      WHEN p.username ILIKE p_query THEN 0
      WHEN p.username ILIKE p_query || '%' THEN 1
      ELSE 2
    END,
    p.username ASC
  LIMIT p_limit;
END;
$$;
