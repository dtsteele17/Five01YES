/*
  # Fix Quick Match RPC Functions

  ## Changes
  1. Update create_quickmatch_lobby to accept match_format string
  2. Update join_quickmatch_lobby to work with match_format
  3. Extract best_of value from match_format for calculations
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS public.create_quickmatch_lobby(integer, integer);
DROP FUNCTION IF EXISTS public.join_quickmatch_lobby(uuid);

-- Create updated function for creating lobbies
CREATE OR REPLACE FUNCTION public.create_quickmatch_lobby(
  p_game_mode integer,
  p_match_format text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert lobby
  INSERT INTO quickmatch_lobbies (
    host_user_id,
    game_mode,
    match_format,
    status
  ) VALUES (
    auth.uid(),
    p_game_mode,
    p_match_format,
    'open'
  )
  RETURNING id INTO v_lobby_id;

  RETURN v_lobby_id;
END;
$$;

-- Create updated function for joining lobbies
CREATE OR REPLACE FUNCTION public.join_quickmatch_lobby(p_lobby_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quickmatch_lobbies%ROWTYPE;
  v_match_id uuid;
  v_initial_state jsonb;
  v_legs_to_win int;
  v_best_of int;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the lobby row for update
  SELECT * INTO v_lobby
  FROM quickmatch_lobbies
  WHERE id = p_lobby_id
  FOR UPDATE;

  -- Validate lobby exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found';
  END IF;

  -- Validate lobby is open
  IF v_lobby.status != 'open' THEN
    RAISE EXCEPTION 'Lobby is not open (status: %)', v_lobby.status;
  END IF;

  -- Validate guest spot is available
  IF v_lobby.guest_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lobby is already full';
  END IF;

  -- Validate user is not the host
  IF v_lobby.host_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot join your own lobby';
  END IF;

  -- Extract best_of from match_format (e.g., "best-of-3" -> 3)
  v_best_of := CAST(SPLIT_PART(v_lobby.match_format, '-', 3) AS int);

  -- Calculate legs to win
  v_legs_to_win := CASE
    WHEN v_best_of = 1 THEN 1
    WHEN v_best_of = 3 THEN 2
    WHEN v_best_of = 5 THEN 3
    WHEN v_best_of = 7 THEN 4
    WHEN v_best_of = 9 THEN 5
    ELSE 2
  END;

  -- Build initial match state
  v_initial_state := jsonb_build_object(
    'player1Score', v_lobby.game_mode,
    'player2Score', v_lobby.game_mode,
    'player1LegsWon', 0,
    'player2LegsWon', 0,
    'currentLeg', 1,
    'legsToWin', v_legs_to_win,
    'visits', jsonb_build_array(),
    'gameMode', v_lobby.game_mode,
    'matchFormat', v_lobby.match_format,
    'doubleOut', true
  );

  -- Create online match
  INSERT INTO online_matches (
    lobby_id,
    player1_id,
    player2_id,
    game_type,
    best_of,
    double_out,
    created_by,
    current_turn_player_id,
    status
  ) VALUES (
    p_lobby_id,
    v_lobby.host_user_id,
    auth.uid(),
    v_lobby.game_mode,
    v_best_of,
    true,
    v_lobby.host_user_id,
    v_lobby.host_user_id,
    'active'
  )
  RETURNING id INTO v_match_id;

  -- Create match state
  INSERT INTO online_match_state (match_id, state_json)
  VALUES (v_match_id, v_initial_state);

  -- Update lobby status
  UPDATE quickmatch_lobbies
  SET
    guest_user_id = auth.uid(),
    status = 'matched',
    updated_at = now()
  WHERE id = p_lobby_id;

  -- Send notification to host
  INSERT INTO notifications (user_id, type, title, message, link, read)
  VALUES (
    v_lobby.host_user_id,
    'quick_match_ready',
    'Match Ready!',
    'Your Quick Match opponent has joined',
    '/app/match/online/' || v_match_id,
    false
  );

  RETURN v_match_id;
END;
$$;
