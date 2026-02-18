-- Fix duplicate friend request notifications
-- This migration updates the rpc_send_friend_request function to ensure
-- only one notification is created per friend request

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
  v_existing_notification_id uuid;
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

  -- Check if request already exists (in either direction)
  SELECT id INTO v_request_id
  FROM friend_requests
  WHERE ((from_user_id = v_user_id AND to_user_id = p_target_user_id) OR
         (from_user_id = p_target_user_id AND to_user_id = v_user_id))
    AND status = 'pending'
  LIMIT 1;

  IF v_request_id IS NOT NULL THEN
    -- Check if notification already exists for this request
    SELECT id INTO v_existing_notification_id
    FROM notifications
    WHERE user_id = p_target_user_id
      AND type = 'system'
      AND data->>'request_id' = v_request_id::text
      AND read_at IS NULL
    LIMIT 1;
    
    -- If notification exists, don't create another one
    IF v_existing_notification_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'request_already_sent');
    END IF;
    
    -- If no notification exists but request does, just return error
    RETURN jsonb_build_object('ok', false, 'error', 'request_already_sent');
  END IF;

  -- Create friend request
  INSERT INTO friend_requests (from_user_id, to_user_id, status)
  VALUES (v_user_id, p_target_user_id, 'pending')
  RETURNING id INTO v_request_id;

  -- Create notification (only if one doesn't already exist for this request)
  INSERT INTO notifications (user_id, type, title, message, data)
  SELECT 
    p_target_user_id,
    'system',
    'Friend Request',
    (SELECT username FROM profiles WHERE id = v_user_id) || ' sent you a friend request',
    jsonb_build_object('href', '/app/friends?tab=requests', 'request_id', v_request_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM notifications 
    WHERE user_id = p_target_user_id 
      AND type = 'system'
      AND data->>'request_id' = v_request_id::text
      AND read_at IS NULL
  );

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id);
END;
$$;

-- Also create a cleanup function to remove duplicate notifications
CREATE OR REPLACE FUNCTION cleanup_duplicate_friend_request_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete duplicate notifications, keeping only the most recent one per request_id
  DELETE FROM notifications n1
  WHERE id IN (
    SELECT id FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, data->>'request_id' 
          ORDER BY created_at DESC
        ) as rn
      FROM notifications
      WHERE type = 'system'
        AND data->>'request_id' IS NOT NULL
    ) ranked
    WHERE rn > 1
  );
END;
$$;

COMMENT ON FUNCTION cleanup_duplicate_friend_request_notifications() IS 
'Removes duplicate friend request notifications, keeping only the most recent one per request';
