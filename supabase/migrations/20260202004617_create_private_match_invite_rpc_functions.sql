/*
  # Create Private Match Invite RPC Functions

  1. RPC Functions
    - `rpc_create_private_match_invite(to_user_id, room_id, match_options)` - Creates invite and notification
    - `rpc_accept_private_match_invite(invite_id)` - Accepts invite
    - `rpc_decline_private_match_invite(invite_id)` - Declines invite
    - `rpc_cancel_private_match_invite(invite_id)` - Cancels invite
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS rpc_create_private_match_invite(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS rpc_accept_private_match_invite(uuid);
DROP FUNCTION IF EXISTS rpc_decline_private_match_invite(uuid);
DROP FUNCTION IF EXISTS rpc_cancel_private_match_invite(uuid);

-- Create private match invite
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
  v_is_friend boolean;
BEGIN
  v_from_user_id := auth.uid();
  
  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_invite_self');
  END IF;

  -- Check if users are friends
  SELECT EXISTS(
    SELECT 1 FROM friends
    WHERE (user_low = v_from_user_id AND user_high = p_to_user_id)
       OR (user_low = p_to_user_id AND user_high = v_from_user_id)
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friends');
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

-- Accept private match invite
CREATE OR REPLACE FUNCTION rpc_accept_private_match_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_invite record;
  v_to_username text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get invite
  SELECT * INTO v_invite
  FROM private_match_invites
  WHERE id = p_invite_id AND to_user_id = v_user_id AND status = 'pending';

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = p_invite_id;

  -- Get username
  SELECT username INTO v_to_username
  FROM profiles
  WHERE id = v_user_id;

  -- Notify inviter
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_invite.from_user_id,
    'system',
    'Invite Accepted',
    v_to_username || ' accepted your private match invite',
    jsonb_build_object('href', '/app/play/private/lobby/' || v_invite.room_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_invite.room_id
  );
END;
$$;

-- Decline private match invite
CREATE OR REPLACE FUNCTION rpc_decline_private_match_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_invite record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get invite
  SELECT * INTO v_invite
  FROM private_match_invites
  WHERE id = p_invite_id AND to_user_id = v_user_id AND status = 'pending';

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'declined', responded_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Cancel private match invite
CREATE OR REPLACE FUNCTION rpc_cancel_private_match_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_invite record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get invite
  SELECT * INTO v_invite
  FROM private_match_invites
  WHERE id = p_invite_id AND from_user_id = v_user_id AND status = 'pending';

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'cancelled', responded_at = now()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
