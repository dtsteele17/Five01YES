/*
  # Fix Rematch Functions to Use match_type

  ## Overview
  Update all rematch-related RPC functions to explicitly set match_type
  when creating new match rooms.

  ## Changes Made
  - Update create_quick_match_rematch() to preserve match_type
  - Update rpc_request_rematch() to preserve match_type
*/

-- ============================================================
-- 1. FIX create_quick_match_rematch()
-- ============================================================

CREATE OR REPLACE FUNCTION create_quick_match_rematch(p_room_id uuid)
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
    match_type,
    source,
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
    COALESCE(v_old_room.match_type, 'quick'),
    COALESCE(v_old_room.source, 'quick'),
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

-- ============================================================
-- 2. FIX rpc_request_rematch()
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_request_rematch(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_room match_rooms%ROWTYPE;
  v_new_room_id uuid;
  v_current_user uuid;
  v_other_player_id uuid;
  v_rematch_record record;
  v_start_at timestamptz;
BEGIN
  v_current_user := (SELECT auth.uid());

  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch the old match room
  SELECT * INTO v_old_room
  FROM match_rooms
  WHERE id = p_room_id
  AND status = 'finished';

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

  -- Check if a rematch already exists
  SELECT * INTO v_rematch_record
  FROM match_rematches
  WHERE old_match_id = p_room_id
  AND (player1_id = v_current_user OR player2_id = v_current_user);

  IF FOUND THEN
    -- Rematch already exists, return it
    RETURN jsonb_build_object(
      'status', 'exists',
      'new_match_id', v_rematch_record.new_match_id,
      'message', 'Rematch already created'
    );
  END IF;

  -- Set start time to 5 seconds from now for synchronized start
  v_start_at := now() + interval '5 seconds';

  -- Create new match with same settings but fresh state
  INSERT INTO match_rooms (
    lobby_id,
    status,
    game_mode,
    match_format,
    match_type,
    source,
    player1_id,
    player2_id,
    current_turn,
    player1_remaining,
    player2_remaining,
    current_leg,
    legs_to_win
  ) VALUES (
    v_old_room.lobby_id,
    'waiting',
    v_old_room.game_mode,
    v_old_room.match_format,
    COALESCE(v_old_room.match_type, 'quick'),
    COALESCE(v_old_room.source, 'quick'),
    v_old_room.player1_id,
    v_old_room.player2_id,
    v_old_room.player1_id,
    v_old_room.game_mode,
    v_old_room.game_mode,
    1,
    v_old_room.legs_to_win
  ) RETURNING id INTO v_new_room_id;

  -- Record the rematch
  INSERT INTO match_rematches (
    old_match_id,
    new_match_id,
    player1_id,
    player2_id,
    requested_by,
    start_at
  ) VALUES (
    p_room_id,
    v_new_room_id,
    v_old_room.player1_id,
    v_old_room.player2_id,
    v_current_user,
    v_start_at
  );

  -- Send notification to other player
  INSERT INTO notifications (user_id, type, title, message, link)
  VALUES (
    v_other_player_id,
    'rematch_request',
    'Rematch Request',
    'Your opponent wants a rematch!',
    '/app/play/quick-match/match/' || v_new_room_id
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'new_match_id', v_new_room_id,
    'start_at', v_start_at,
    'message', 'Rematch created'
  );
END;
$$;
