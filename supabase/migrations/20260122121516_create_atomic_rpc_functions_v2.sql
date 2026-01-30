/*
  # Atomic RPC Functions for Online Multiplayer

  ## Overview
  Creates race-safe, atomic RPC functions for:
  1. Creating quick match lobbies
  2. Joining lobbies (prevents double-joins)
  3. Submitting online visits with turn validation
  4. Managing match state

  ## Security
  All functions use SECURITY DEFINER to bypass RLS while maintaining auth checks
*/

-- ============================================================
-- 1. CREATE QUICKMATCH LOBBY
-- ============================================================

CREATE OR REPLACE FUNCTION create_quickmatch_lobby(
  p_game_mode int,
  p_best_of int
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
    best_of,
    status
  ) VALUES (
    auth.uid(),
    p_game_mode,
    p_best_of,
    'open'
  )
  RETURNING id INTO v_lobby_id;

  RETURN v_lobby_id;
END;
$$;

-- ============================================================
-- 2. JOIN QUICKMATCH LOBBY (ATOMIC)
-- ============================================================

CREATE OR REPLACE FUNCTION join_quickmatch_lobby(
  p_lobby_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quickmatch_lobbies%ROWTYPE;
  v_match_id uuid;
  v_initial_state jsonb;
  v_legs_to_win int;
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

  -- Calculate legs to win
  v_legs_to_win := CASE
    WHEN v_lobby.best_of = 1 THEN 1
    WHEN v_lobby.best_of = 3 THEN 2
    WHEN v_lobby.best_of = 5 THEN 3
    WHEN v_lobby.best_of = 7 THEN 4
    WHEN v_lobby.best_of = 9 THEN 5
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
    'bestOf', v_lobby.best_of,
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
    v_lobby.best_of,
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
    matched_at = now(),
    match_id = v_match_id
  WHERE id = p_lobby_id;

  RETURN v_match_id;
END;
$$;

-- ============================================================
-- 3. CANCEL QUICKMATCH LOBBY
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_quickmatch_lobby(
  p_lobby_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quickmatch_lobbies%ROWTYPE;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get lobby
  SELECT * INTO v_lobby
  FROM quickmatch_lobbies
  WHERE id = p_lobby_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found';
  END IF;

  -- Verify user is host
  IF v_lobby.host_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only host can cancel lobby';
  END IF;

  -- Only cancel if still open
  IF v_lobby.status = 'open' THEN
    UPDATE quickmatch_lobbies
    SET status = 'cancelled'
    WHERE id = p_lobby_id;
  END IF;
END;
$$;

-- ============================================================
-- 4. SUBMIT ONLINE VISIT (TURN-BASED)
-- ============================================================

CREATE OR REPLACE FUNCTION submit_online_visit_v2(
  p_match_id uuid,
  p_score int,
  p_darts_thrown int,
  p_remaining_score int,
  p_is_bust boolean,
  p_is_checkout boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match online_matches%ROWTYPE;
  v_state jsonb;
  v_current_player text;
  v_next_player_id uuid;
  v_current_score int;
  v_new_score int;
  v_legs_won int;
  v_legs_to_win int;
  v_match_complete boolean := false;
  v_winner text;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock match
  SELECT * INTO v_match
  FROM online_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Verify user is in match
  IF v_match.player1_id != auth.uid() AND v_match.player2_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not in this match';
  END IF;

  -- Verify it's player's turn
  IF v_match.current_turn_player_id != auth.uid() THEN
    RAISE EXCEPTION 'It is not your turn';
  END IF;

  -- Verify match is active
  IF v_match.status != 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  -- Get current state
  SELECT state_json INTO v_state
  FROM online_match_state
  WHERE match_id = p_match_id;

  -- Determine current player
  IF v_match.player1_id = auth.uid() THEN
    v_current_player := 'player1';
    v_next_player_id := v_match.player2_id;
  ELSE
    v_current_player := 'player2';
    v_next_player_id := v_match.player1_id;
  END IF;

  -- Update score
  v_state := jsonb_set(
    v_state,
    ARRAY[v_current_player || 'Score'],
    to_jsonb(p_remaining_score)
  );

  -- Add visit to history
  v_state := jsonb_set(
    v_state,
    '{visits}',
    (v_state -> 'visits') || jsonb_build_object(
      'player', v_current_player,
      'score', p_score,
      'dartsThrown', p_darts_thrown,
      'remainingScore', p_remaining_score,
      'isBust', p_is_bust,
      'isCheckout', p_is_checkout,
      'timestamp', now()
    )
  );

  -- Check if leg won
  IF p_is_checkout AND p_remaining_score = 0 THEN
    v_legs_won := (v_state ->> (v_current_player || 'LegsWon'))::int + 1;
    v_state := jsonb_set(
      v_state,
      ARRAY[v_current_player || 'LegsWon'],
      to_jsonb(v_legs_won)
    );

    v_legs_to_win := (v_state ->> 'legsToWin')::int;

    -- Check if match won
    IF v_legs_won >= v_legs_to_win THEN
      v_match_complete := true;
      v_winner := v_current_player;

      -- Update match status
      UPDATE online_matches
      SET
        status = 'completed',
        finished_at = now(),
        updated_at = now()
      WHERE id = p_match_id;
    ELSE
      -- Start new leg
      v_state := jsonb_set(v_state, '{player1Score}', to_jsonb((v_state ->> 'gameMode')::int));
      v_state := jsonb_set(v_state, '{player2Score}', to_jsonb((v_state ->> 'gameMode')::int));
      v_state := jsonb_set(v_state, '{currentLeg}', to_jsonb((v_state ->> 'currentLeg')::int + 1));
    END IF;
  END IF;

  -- Update state in database
  UPDATE online_match_state
  SET
    state_json = v_state,
    updated_at = now()
  WHERE match_id = p_match_id;

  -- Switch turn if not match complete
  IF NOT v_match_complete THEN
    UPDATE online_matches
    SET
      current_turn_player_id = v_next_player_id,
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'matchComplete', v_match_complete,
    'winner', v_winner,
    'state', v_state
  );
END;
$$;

-- ============================================================
-- 5. GET MATCH WITH STATE (HELPER)
-- ============================================================

CREATE OR REPLACE FUNCTION get_online_match_with_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT jsonb_build_object(
    'match', row_to_json(m.*),
    'state', s.state_json,
    'player1_profile', row_to_json(p1.*),
    'player2_profile', row_to_json(p2.*)
  ) INTO v_result
  FROM online_matches m
  LEFT JOIN online_match_state s ON s.match_id = m.id
  LEFT JOIN profiles p1 ON p1.id = m.player1_id
  LEFT JOIN profiles p2 ON p2.id = m.player2_id
  WHERE m.id = p_match_id
  AND (m.player1_id = auth.uid() OR m.player2_id = auth.uid());

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Match not found or access denied';
  END IF;

  RETURN v_result;
END;
$$;
