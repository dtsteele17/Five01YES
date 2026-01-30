/*
  # Create Quick Match Rematch Function

  1. New Functions
    - `create_quick_match_rematch` - Creates a new match between the same players with the same settings

  2. Details
    - Takes the completed match_id (room_id)
    - Creates a new match with same settings but fresh state (0-0 legs, 501/301/etc remaining)
    - Returns the new match_id
    - Both players need to navigate to the new match
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS create_quick_match_rematch(uuid);

-- Function to create a rematch
CREATE FUNCTION create_quick_match_rematch(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_room match_rooms%ROWTYPE;
  v_new_room_id uuid;
  v_current_user uuid;
  v_other_player_id uuid;
BEGIN
  v_current_user := (SELECT auth.uid());

  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the old match room
  SELECT * INTO v_old_room
  FROM match_rooms
  WHERE id = p_room_id
  AND status IN ('finished', 'completed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not finished';
  END IF;

  -- Verify the user was in the match
  IF v_old_room.player1_id != v_current_user AND v_old_room.player2_id != v_current_user THEN
    RAISE EXCEPTION 'You were not part of this match';
  END IF;

  -- Determine other player
  IF v_old_room.player1_id = v_current_user THEN
    v_other_player_id := v_old_room.player2_id;
  ELSE
    v_other_player_id := v_old_room.player1_id;
  END IF;

  -- Create new match with same settings but fresh state
  INSERT INTO match_rooms (
    lobby_id,
    status,
    game_mode,
    match_format,
    player1_id,
    player2_id,
    current_turn,
    player1_remaining,
    player2_remaining,
    current_leg,
    legs_to_win
  ) VALUES (
    v_old_room.lobby_id,
    'active',
    v_old_room.game_mode,
    v_old_room.match_format,
    v_old_room.player1_id,
    v_old_room.player2_id,
    v_old_room.player1_id,
    v_old_room.game_mode,
    v_old_room.game_mode,
    1,
    v_old_room.legs_to_win
  ) RETURNING id INTO v_new_room_id;

  -- Update lobby with new match
  UPDATE quick_match_lobbies
  SET
    match_id = v_new_room_id,
    updated_at = now()
  WHERE id = v_old_room.lobby_id;

  -- Send notification to other player
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_other_player_id,
    'match_invite',
    'Rematch Started!',
    'Your opponent wants a rematch',
    jsonb_build_object('match_id', v_new_room_id, 'link', '/app/play/quick-match/match/' || v_new_room_id)
  );

  RETURN v_new_room_id;
END;
$$;