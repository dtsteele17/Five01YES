/*
  # Create Room for League Match RPC Function

  1. Purpose
    - Creates a match_room for a league match
    - Links the room to the league match
    - Calculates match format from best_of
    - Returns room_id for navigation

  2. Parameters
    - p_league_match_id: UUID of the league match

  3. Returns
    - room_id: UUID of the created match room

  4. Logic
    - Fetch league match and league details
    - Calculate legs_to_win from best_of
    - Create match_room with source='league'
    - Update league_match with match_room_id
    - Send notifications to both players
*/

CREATE OR REPLACE FUNCTION create_room_for_league_match(p_league_match_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_match league_matches%ROWTYPE;
  v_league leagues%ROWTYPE;
  v_room_id uuid;
  v_legs_to_win int;
  v_match_format text;
  v_game_mode int;
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();
  
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and fetch league match
  SELECT * INTO v_league_match
  FROM league_matches
  WHERE id = p_league_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'League match not found';
  END IF;

  -- Verify user is one of the players
  IF v_league_match.player1_id != v_current_user AND v_league_match.player2_id != v_current_user THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Verify match is scheduled (not already started or completed)
  IF v_league_match.status != 'scheduled' THEN
    RAISE EXCEPTION 'Match is not in scheduled status';
  END IF;

  -- Get league details
  SELECT * INTO v_league
  FROM leagues
  WHERE id = v_league_match.league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  -- Calculate legs_to_win from best_of
  v_legs_to_win := CASE
    WHEN v_league_match.best_of = 1 THEN 1
    WHEN v_league_match.best_of = 3 THEN 2
    WHEN v_league_match.best_of = 5 THEN 3
    WHEN v_league_match.best_of = 7 THEN 4
    WHEN v_league_match.best_of = 9 THEN 5
    ELSE 2
  END;

  -- Build match format string
  v_match_format := 'best-of-' || v_league_match.best_of;

  -- Get game mode from league (default to 501)
  v_game_mode := 501;

  -- Create match room
  INSERT INTO match_rooms (
    player1_id,
    player2_id,
    game_mode,
    match_format,
    status,
    current_leg,
    legs_to_win,
    player1_remaining,
    player2_remaining,
    current_turn,
    match_type
  ) VALUES (
    v_league_match.player1_id,
    v_league_match.player2_id,
    v_game_mode,
    v_match_format,
    'active',
    1,
    v_legs_to_win,
    v_game_mode,
    v_game_mode,
    v_league_match.player1_id,
    'league'
  )
  RETURNING id INTO v_room_id;

  -- Update league match with room_id and status
  UPDATE league_matches
  SET 
    match_room_id = v_room_id,
    status = 'in_progress',
    updated_at = now()
  WHERE id = p_league_match_id;

  -- Send notification to the opponent
  IF v_current_user = v_league_match.player1_id THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_league_match.player2_id,
      'match_invite',
      'League Match Starting!',
      'Your league match is ready to begin',
      jsonb_build_object('room_id', v_room_id, 'league_match_id', p_league_match_id)
    );
  ELSE
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_league_match.player1_id,
      'match_invite',
      'League Match Starting!',
      'Your league match is ready to begin',
      jsonb_build_object('room_id', v_room_id, 'league_match_id', p_league_match_id)
    );
  END IF;

  RETURN v_room_id;
END;
$$;

COMMENT ON FUNCTION create_room_for_league_match IS 'Creates a match room for a league match and returns the room ID';
