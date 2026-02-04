/*
  # Fix Tournament Ready RPC Alias and Ensure Correct Function Exists

  ## Issue
  - Frontend calls `rpc_tourn_ready` but we have `ready_up_tournament_match`
  - Need to create alias or ensure both exist

  ## Solution
  - Create `rpc_tourn_ready` as an alias to `ready_up_tournament_match`
  - Ensure the function uses correct ID mapping (profiles.id, not auth.users.id)
*/

-- Create alias function rpc_tourn_ready that calls ready_up_tournament_match
DROP FUNCTION IF EXISTS rpc_tourn_ready(uuid);

CREATE FUNCTION rpc_tourn_ready(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Simply call the main function
  RETURN ready_up_tournament_match(p_match_id);
END;
$$;

COMMENT ON FUNCTION rpc_tourn_ready IS 'Alias for ready_up_tournament_match - creates match room when both players ready';

GRANT EXECUTE ON FUNCTION rpc_tourn_ready(uuid) TO authenticated;
