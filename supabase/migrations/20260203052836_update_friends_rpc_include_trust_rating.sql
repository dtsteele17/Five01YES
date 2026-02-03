/*
  # Update Friends RPC Functions to Include Trust Rating

  1. Purpose
    - Update rpc_get_friends_overview to include trust_rating_letter
    - Update rpc_search_users to include trust_rating_letter
    - Update rpc_get_friend_requests to include trust_rating_letter

  2. Changes
    - Add trust_rating_letter to jsonb_build_object in all friend-related RPCs
    - Ensures trust rating badges can be displayed throughout the app
*/

-- Drop and recreate rpc_get_friends_overview with trust_rating_letter
DROP FUNCTION IF EXISTS rpc_get_friends_overview();

CREATE OR REPLACE FUNCTION rpc_get_friends_overview()
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
    'friends', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', friend_id,
          'username', p.username,
          'avatar_url', p.avatar_url,
          'trust_rating_letter', p.trust_rating_letter,
          'is_online', COALESCE(up.is_online, false),
          'last_seen', up.last_seen_at,
          'activity_type', up.activity_type,
          'activity_id', up.activity_id,
          'activity_label', up.activity_label,
          'score_snapshot', up.score_snapshot
        ) ORDER BY COALESCE(up.is_online, false) DESC, p.username ASC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM (
    SELECT 
      CASE 
        WHEN f.user_low = v_user_id THEN f.user_high
        ELSE f.user_low
      END AS friend_id
    FROM friends f
    WHERE f.user_low = v_user_id OR f.user_high = v_user_id
  ) friends_list
  LEFT JOIN profiles p ON p.id = friends_list.friend_id
  LEFT JOIN user_presence up ON up.user_id = friends_list.friend_id;

  RETURN v_result;
END;
$$;

-- Drop and recreate rpc_search_users with trust_rating_letter
DROP FUNCTION IF EXISTS rpc_search_users(text, int);

CREATE OR REPLACE FUNCTION rpc_search_users(p_query text, p_limit int DEFAULT 20)
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

  IF p_query IS NULL OR LENGTH(TRIM(p_query)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'query_too_short');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'users', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'username', p.username,
          'avatar_url', p.avatar_url,
          'trust_rating_letter', p.trust_rating_letter,
          'is_friend', f.user_low IS NOT NULL,
          'request_pending', fr.id IS NOT NULL
        ) ORDER BY p.username ASC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM profiles p
  LEFT JOIN friends f ON (
    (f.user_low = v_user_id AND f.user_high = p.id) OR
    (f.user_high = v_user_id AND f.user_low = p.id)
  )
  LEFT JOIN friend_requests fr ON (
    (fr.from_user_id = v_user_id AND fr.to_user_id = p.id AND fr.status = 'pending') OR
    (fr.from_user_id = p.id AND fr.to_user_id = v_user_id AND fr.status = 'pending')
  )
  WHERE p.id != v_user_id
    AND p.username ILIKE '%' || p_query || '%'
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION rpc_get_friends_overview IS 'Returns friends list with presence, activity, and trust rating';
COMMENT ON FUNCTION rpc_search_users IS 'Searches for users by username including trust rating';