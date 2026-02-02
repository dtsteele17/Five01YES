/*
  # Fix Private Match Invite - Remove Friend Check

  1. Changes
    - Remove friendship requirement from `rpc_create_private_match_invite`
    - Allow inviting any user by username, not just friends
    - Maintain security by requiring valid user IDs

  2. Security
    - Still checks authentication
    - Still prevents self-invites
    - Still validates user existence
*/

-- Recreate function without friend check
CREATE OR REPLACE FUNCTION rpc_create_private_match_invite(
  p_to_user_id uuid,
  p_room_id uuid,
  p_match_options jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_user_id uuid;
  v_invite_id uuid;
  v_from_username text;
  v_to_user_exists boolean;
BEGIN
  v_from_user_id := auth.uid();

  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_invite_self');
  END IF;

  -- Check if target user exists
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = p_to_user_id
  ) INTO v_to_user_exists;

  IF NOT v_to_user_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Get username
  SELECT username INTO v_from_username
  FROM profiles
  WHERE id = v_from_user_id;

  -- Create invite
  INSERT INTO private_match_invites (from_user_id, to_user_id, room_id, match_options, status)
  VALUES (v_from_user_id, p_to_user_id, p_room_id, p_match_options, 'pending')
  RETURNING id INTO v_invite_id;

  -- Create notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_to_user_id,
    'system',
    'Private Match Invite',
    v_from_username || ' has invited you to a private game',
    jsonb_build_object(
      'href', '/app/play/private/lobby/' || p_room_id,
      'invite_id', v_invite_id,
      'room_id', p_room_id,
      'from_user_id', v_from_user_id,
      'from_username', v_from_username,
      'match_options', p_match_options
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite_id
  );
END;
$$;
