/*
  # Fix Accept Invite - Use username instead of display_name

  1. Changes
    - Update rpc_accept_private_match_invite to use username field
    - Profiles table has username, not display_name

  2. Notes
    - Maintains all other functionality
    - Just fixes field reference
*/

CREATE OR REPLACE FUNCTION rpc_accept_private_match_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_invite record;
  v_to_username text;
  v_match_id uuid;
  v_player_count int;
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

  -- Get match ID from room_id
  v_match_id := v_invite.room_id;

  -- Check how many players are already in the match
  SELECT COUNT(*) INTO v_player_count
  FROM match_players
  WHERE match_id = v_match_id;

  -- If only 1 player (the inviter), add the accepter as player 2
  IF v_player_count = 1 THEN
    -- Get username
    SELECT username INTO v_to_username
    FROM profiles
    WHERE id = v_user_id;

    IF v_to_username IS NULL THEN
      v_to_username := 'Player 2';
    END IF;

    -- Add accepter to match_players
    INSERT INTO match_players (match_id, user_id, seat, player_name, is_bot)
    VALUES (v_match_id, v_user_id, 2, v_to_username, false);

    -- Update match with player 2 name
    UPDATE matches
    SET player2_name = v_to_username,
        status = 'in_progress'
    WHERE id = v_match_id;
  END IF;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'accepted', responded_at = now()
  WHERE id = p_invite_id;

  -- Get username for notification
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
    jsonb_build_object('href', '/app/match/online/' || v_match_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_invite.room_id,
    'match_id', v_match_id
  );
END;
$$;
