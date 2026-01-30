/*
  # Create Request Rematch RPC Function

  1. New Functions
    - `request_rematch(p_old_room_id uuid)` - Request or accept a rematch
      Returns: {ready_count: int, new_room_id: uuid}

  2. Details
    - Creates or updates match_rematches record
    - When both players ready, creates new match room
    - Returns ready count and new room ID for UI updates
    - Prevents double lobby creation with handshake pattern

  3. Notes
    - Only match participants can call this function
    - New match has same settings but fresh state
    - Sends notifications when match is ready
*/

-- Drop existing function if exists
DROP FUNCTION IF EXISTS request_rematch(uuid);

-- Create request_rematch function
CREATE FUNCTION request_rematch(p_old_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user uuid;
  v_old_room match_rooms%ROWTYPE;
  v_rematch match_rematches%ROWTYPE;
  v_is_player1 boolean;
  v_ready_count int;
  v_new_room_id uuid;
BEGIN
  v_current_user := auth.uid();

  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the old match room
  SELECT * INTO v_old_room
  FROM match_rooms
  WHERE id = p_old_room_id
  AND status IN ('finished', 'completed', 'forfeited');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not finished';
  END IF;

  -- Verify the user was in the match
  IF v_old_room.player1_id != v_current_user AND v_old_room.player2_id != v_current_user THEN
    RAISE EXCEPTION 'You were not part of this match';
  END IF;

  -- Determine if current user is player1 or player2
  v_is_player1 := (v_old_room.player1_id = v_current_user);

  -- Try to get existing rematch record
  SELECT * INTO v_rematch
  FROM match_rematches
  WHERE old_room_id = p_old_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create new rematch record
    INSERT INTO match_rematches (
      old_room_id,
      player1_id,
      player2_id,
      player1_ready,
      player2_ready
    ) VALUES (
      p_old_room_id,
      v_old_room.player1_id,
      v_old_room.player2_id,
      v_is_player1,
      NOT v_is_player1
    ) RETURNING * INTO v_rematch;
  ELSE
    -- Update existing rematch record
    IF v_is_player1 THEN
      UPDATE match_rematches
      SET player1_ready = true, updated_at = now()
      WHERE old_room_id = p_old_room_id
      RETURNING * INTO v_rematch;
    ELSE
      UPDATE match_rematches
      SET player2_ready = true, updated_at = now()
      WHERE old_room_id = p_old_room_id
      RETURNING * INTO v_rematch;
    END IF;
  END IF;

  -- Calculate ready count
  v_ready_count := 0;
  IF v_rematch.player1_ready THEN
    v_ready_count := v_ready_count + 1;
  END IF;
  IF v_rematch.player2_ready THEN
    v_ready_count := v_ready_count + 1;
  END IF;

  -- If both players are ready and new room not yet created, create it
  IF v_ready_count = 2 AND v_rematch.new_room_id IS NULL THEN
    -- Create new match room with same settings but fresh state
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

    -- Update rematch record with new room
    UPDATE match_rematches
    SET new_room_id = v_new_room_id, updated_at = now()
    WHERE old_room_id = p_old_room_id;

    -- Update lobby if exists
    IF v_old_room.lobby_id IS NOT NULL THEN
      UPDATE quick_match_lobbies
      SET match_id = v_new_room_id, updated_at = now()
      WHERE id = v_old_room.lobby_id;
    END IF;

    -- Send notifications to both players
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES 
      (v_old_room.player1_id, 'match_invite', 'Rematch Ready!', 'Both players ready - match starting', 
       jsonb_build_object('match_id', v_new_room_id, 'link', '/app/play/quick-match/match/' || v_new_room_id)),
      (v_old_room.player2_id, 'match_invite', 'Rematch Ready!', 'Both players ready - match starting',
       jsonb_build_object('match_id', v_new_room_id, 'link', '/app/play/quick-match/match/' || v_new_room_id));
  END IF;

  -- Return ready count and new room id
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'new_room_id', COALESCE(v_rematch.new_room_id, v_new_room_id)
  );
END;
$$;