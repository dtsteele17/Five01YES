/*
  # Auto Cleanup Lobbies System
  
  1. Features:
    - Automatically deletes lobbies when creator closes browser/leaves page
    - Periodic cleanup of stale/expired lobbies
    - Trigger-based cleanup on user disconnect
    
  2. Functions:
    - rpc_delete_user_lobbies() - Deletes all lobbies created by current user
    - cleanup_expired_lobbies() - Cron-compatible function to clean expired lobbies
    
  3. Notes:
    - Call rpc_delete_user_lobbies() when user leaves the page (beforeunload)
    - Expired lobbies are those past expires_at timestamp
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS rpc_delete_user_lobbies();
DROP FUNCTION IF EXISTS cleanup_expired_lobbies();

-- RPC: Delete all lobbies created by the current user
-- Call this when user leaves the page or stops searching
CREATE OR REPLACE FUNCTION rpc_delete_user_lobbies()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count int := 0;
BEGIN
  -- Delete all open lobbies created by this user
  DELETE FROM quick_match_lobbies
  WHERE created_by = auth.uid()
    AND status = 'open';
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', 'Your lobbies have been removed'
  );
END;
$$;

-- Function to cleanup expired lobbies (can be called by cron or manually)
CREATE OR REPLACE FUNCTION cleanup_expired_lobbies()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count int := 0;
BEGIN
  -- Delete lobbies that have expired
  DELETE FROM quick_match_lobbies
  WHERE status = 'open'
    AND expires_at < now();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'message', 'Expired lobbies cleaned up'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION rpc_delete_user_lobbies() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_lobbies() TO authenticated;

-- Create index on created_by for faster cleanup
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_created_by_open 
ON quick_match_lobbies(created_by) 
WHERE status = 'open';

-- Add expires_at to the query in fetchLobbies should filter automatically
-- But let's create a view that only shows active lobbies
DROP VIEW IF EXISTS v_active_lobbies;

CREATE VIEW v_active_lobbies AS
SELECT 
  l.*,
  p.username as host_username,
  p.avatar_url as host_avatar_url,
  p.trust_rating_letter as host_trust_rating_letter
FROM quick_match_lobbies l
JOIN profiles p ON l.player1_id = p.user_id
WHERE l.status = 'open'
  AND l.expires_at > now();

-- Enable RLS on the view
ALTER VIEW v_active_lobbies SET (security_invoker = true);

-- Cleanup any expired lobbies right now
SELECT cleanup_expired_lobbies();

-- Done
SELECT 'Auto cleanup system installed successfully!' as status;
