/*
  # Add Helper Function to Check if League Exists

  This function helps debug RLS issues by checking if a league exists
  without being blocked by RLS policies.
*/

CREATE OR REPLACE FUNCTION check_league_exists(p_league_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM leagues WHERE id = p_league_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_league_exists(uuid) TO authenticated;
