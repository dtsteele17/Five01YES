/*
  # Update Accept Private Match Invite RPC

  ## Changes
  - Update rpc_accept_private_match_invite to return complete match details
  - Returns: ok, room_id (match room identifier), game_mode, match_format
  - Both players will use the same room_id for signaling and match state

  ## Purpose
  Ensures both inviter and invitee use the SAME room_id for WebRTC signaling
  and match state synchronization. No separate lobby generation needed.
*/

DROP FUNCTION IF EXISTS rpc_accept_private_match_invite(uuid);

CREATE OR REPLACE FUNCTION rpc_accept_private_match_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_invite record;
  v_to_username text;
  v_room_id uuid;
  v_room record;
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

  v_room_id := v_invite.room_id;

  -- Get room to verify it exists AND get match details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = v_room_id;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Set room status to 'active' so scoring can work
  UPDATE match_rooms
  SET
    status = 'active',
    updated_at = now()
  WHERE id = v_room_id;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = p_invite_id;

  -- Get username for notification
  SELECT username INTO v_to_username
  FROM profiles
  WHERE id = v_user_id;

  IF v_to_username IS NULL THEN
    v_to_username := 'Player';
  END IF;

  -- Notify inviter that invite was accepted
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_invite.from_user_id,
    'system',
    'Invite Accepted',
    v_to_username || ' accepted your private match invite',
    jsonb_build_object(
      'kind', 'private_match_accepted',
      'room_id', v_room_id,
      'game_mode', v_room.game_mode,
      'match_format', v_room.match_format,
      'invite_id', p_invite_id
    )
  );

  -- Return complete match details
  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'game_mode', v_room.game_mode,
    'match_format', v_room.match_format
  );
END;
$$;
