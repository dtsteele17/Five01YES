/*
  # Create RPC function to clear user activity

  1. New Functions
    - `rpc_clear_my_activity`
      - Clears all stale activity for the current user
      - Removes user from any lobby heartbeat records
      - Can be extended to clear other presence/activity data

  2. Purpose
    - Prevent infinite loops from stale match state
    - Clean up orphaned activity records on login/navigation
*/

-- Create function to clear user activity
CREATE OR REPLACE FUNCTION public.rpc_clear_my_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Clear lobby heartbeats if that table exists
  -- This prevents auto-navigation to stale lobbies
  IF EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'lobby_heartbeats'
  ) THEN
    DELETE FROM public.lobby_heartbeats
    WHERE user_id = auth.uid();
  END IF;

  -- Future: Add other activity cleanup here as needed
  -- For example: presence records, temporary session data, etc.
END;
$$;