/*
  # Update Friend Requests RPC to Include Trust Rating

  1. Purpose
    - Update rpc_get_friend_requests to include trust_rating_letter
    
  2. Changes
    - Add trust_rating_letter to jsonb_build_object in friend request response
*/

-- Drop and recreate rpc_get_friend_requests with trust_rating_letter
DROP FUNCTION IF EXISTS rpc_get_friend_requests();

CREATE OR REPLACE FUNCTION rpc_get_friend_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'requests', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'from_user_id', fr.from_user_id,
          'username', p.username,
          'avatar_url', p.avatar_url,
          'trust_rating_letter', p.trust_rating_letter,
          'created_at', fr.created_at
        ) ORDER BY fr.created_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM friend_requests fr
  LEFT JOIN profiles p ON p.id = fr.from_user_id
  WHERE fr.to_user_id = v_user_id AND fr.status = 'pending';

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_get_friend_requests IS 'Returns incoming friend requests with trust rating';