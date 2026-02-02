/*
  # Create Friends RPC Functions

  1. RPC Functions
    - `rpc_get_friends_overview()` - Returns friends list with presence and activity
    - `rpc_search_users(query, limit)` - Searches for users by username
    - `rpc_send_friend_request(target_user_id)` - Sends a friend request
    - `rpc_respond_friend_request(request_id, accept)` - Accepts or declines a request
    - `rpc_get_or_create_conversation(friend_id)` - Gets or creates a conversation
    - `rpc_send_friend_message(conversation_id, body)` - Sends a message
    - `rpc_set_presence(payload)` - Updates user presence

  2. Helper Functions
    - Helper for ordering user IDs consistently
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS rpc_get_friends_overview();
DROP FUNCTION IF EXISTS rpc_search_users(text, int);
DROP FUNCTION IF EXISTS rpc_send_friend_request(uuid);
DROP FUNCTION IF EXISTS rpc_respond_friend_request(uuid, boolean);
DROP FUNCTION IF EXISTS rpc_get_or_create_conversation(uuid);
DROP FUNCTION IF EXISTS rpc_send_friend_message(uuid, text);
DROP FUNCTION IF EXISTS rpc_set_presence(boolean, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS ordered_user_pair(uuid, uuid);

-- Helper function to ensure consistent user ordering
CREATE OR REPLACE FUNCTION ordered_user_pair(uid1 uuid, uid2 uuid)
RETURNS TABLE(user_low uuid, user_high uuid)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 
    CASE WHEN uid1 < uid2 THEN uid1 ELSE uid2 END,
    CASE WHEN uid1 < uid2 THEN uid2 ELSE uid1 END;
$$;

-- Get friends list with presence and activity
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

-- Search users by username
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

-- Send friend request
CREATE OR REPLACE FUNCTION rpc_send_friend_request(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_already_friends boolean;
  v_request_exists boolean;
  v_request_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_user_id = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_add_self');
  END IF;

  -- Check if already friends
  SELECT EXISTS(
    SELECT 1 FROM friends
    WHERE (user_low = v_user_id AND user_high = p_target_user_id)
       OR (user_low = p_target_user_id AND user_high = v_user_id)
  ) INTO v_already_friends;

  IF v_already_friends THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_friends');
  END IF;

  -- Check if request already exists
  SELECT EXISTS(
    SELECT 1 FROM friend_requests
    WHERE ((from_user_id = v_user_id AND to_user_id = p_target_user_id) OR
           (from_user_id = p_target_user_id AND to_user_id = v_user_id))
      AND status = 'pending'
  ) INTO v_request_exists;

  IF v_request_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_already_sent');
  END IF;

  -- Create friend request
  INSERT INTO friend_requests (from_user_id, to_user_id, status)
  VALUES (v_user_id, p_target_user_id, 'pending')
  RETURNING id INTO v_request_id;

  -- Create notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_target_user_id,
    'system',
    'Friend Request',
    (SELECT username FROM profiles WHERE id = v_user_id) || ' sent you a friend request',
    jsonb_build_object('href', '/app/friends?tab=requests', 'request_id', v_request_id)
  );

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

-- Respond to friend request
CREATE OR REPLACE FUNCTION rpc_respond_friend_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_request record;
  v_user_low uuid;
  v_user_high uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get request
  SELECT * INTO v_request
  FROM friend_requests
  WHERE id = p_request_id AND to_user_id = v_user_id AND status = 'pending';

  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF p_accept THEN
    -- Update request status
    UPDATE friend_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = p_request_id;

    -- Create friendship (ensure consistent ordering)
    SELECT * INTO v_user_low, v_user_high
    FROM ordered_user_pair(v_request.from_user_id, v_request.to_user_id);

    INSERT INTO friends (user_low, user_high)
    VALUES (v_user_low, v_user_high)
    ON CONFLICT DO NOTHING;

    -- Notify requester
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_request.from_user_id,
      'system',
      'Friend Request Accepted',
      (SELECT username FROM profiles WHERE id = v_user_id) || ' accepted your friend request',
      jsonb_build_object('href', '/app/friends')
    );

    RETURN jsonb_build_object('ok', true, 'accepted', true);
  ELSE
    -- Decline request
    UPDATE friend_requests
    SET status = 'declined', responded_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;
END;
$$;

-- Get or create conversation
CREATE OR REPLACE FUNCTION rpc_get_or_create_conversation(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_is_friend boolean;
  v_conversation_id uuid;
  v_user_low uuid;
  v_user_high uuid;
  v_messages jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Check if users are friends
  SELECT EXISTS(
    SELECT 1 FROM friends
    WHERE (user_low = v_user_id AND user_high = p_friend_id)
       OR (user_low = p_friend_id AND user_high = v_user_id)
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friends');
  END IF;

  -- Get consistent user ordering
  SELECT * INTO v_user_low, v_user_high
  FROM ordered_user_pair(v_user_id, p_friend_id);

  -- Get or create conversation
  SELECT id INTO v_conversation_id
  FROM friend_conversations
  WHERE user_low = v_user_low AND user_high = v_user_high;

  IF v_conversation_id IS NULL THEN
    INSERT INTO friend_conversations (user_low, user_high)
    VALUES (v_user_low, v_user_high)
    RETURNING id INTO v_conversation_id;
  END IF;

  -- Get recent messages
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'from_user_id', m.from_user_id,
        'body', m.body,
        'created_at', m.created_at
      ) ORDER BY m.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_messages
  FROM (
    SELECT * FROM friend_messages
    WHERE conversation_id = v_conversation_id
    ORDER BY created_at DESC
    LIMIT 100
  ) m;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_conversation_id,
    'messages', v_messages
  );
END;
$$;

-- Send friend message
CREATE OR REPLACE FUNCTION rpc_send_friend_message(p_conversation_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_is_participant boolean;
  v_message_id uuid;
  v_other_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_body IS NULL OR LENGTH(TRIM(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'message_empty');
  END IF;

  IF LENGTH(p_body) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'message_too_long');
  END IF;

  -- Check if user is participant
  SELECT EXISTS(
    SELECT 1 FROM friend_conversations
    WHERE id = p_conversation_id
      AND (user_low = v_user_id OR user_high = v_user_id)
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  -- Get other user ID
  SELECT 
    CASE 
      WHEN user_low = v_user_id THEN user_high
      ELSE user_low
    END INTO v_other_user_id
  FROM friend_conversations
  WHERE id = p_conversation_id;

  -- Insert message
  INSERT INTO friend_messages (conversation_id, from_user_id, body)
  VALUES (p_conversation_id, v_user_id, p_body)
  RETURNING id INTO v_message_id;

  -- Create notification for other user
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_other_user_id,
    'system',
    'New Message',
    (SELECT username FROM profiles WHERE id = v_user_id) || ' sent you a message',
    jsonb_build_object('href', '/app/friends?chat=' || p_conversation_id)
  );

  RETURN jsonb_build_object('ok', true, 'message_id', v_message_id);
END;
$$;

-- Set user presence
CREATE OR REPLACE FUNCTION rpc_set_presence(
  p_is_online boolean DEFAULT true,
  p_activity_type text DEFAULT NULL,
  p_activity_id uuid DEFAULT NULL,
  p_activity_label text DEFAULT NULL,
  p_score_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  INSERT INTO user_presence (
    user_id,
    is_online,
    last_seen_at,
    activity_type,
    activity_id,
    activity_label,
    score_snapshot,
    updated_at
  )
  VALUES (
    v_user_id,
    p_is_online,
    now(),
    p_activity_type,
    p_activity_id,
    p_activity_label,
    COALESCE(p_score_snapshot, '{}'::jsonb),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_online = p_is_online,
    last_seen_at = now(),
    activity_type = p_activity_type,
    activity_id = p_activity_id,
    activity_label = p_activity_label,
    score_snapshot = COALESCE(p_score_snapshot, '{}'::jsonb),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;
