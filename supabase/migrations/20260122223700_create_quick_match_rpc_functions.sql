/*
  # Quick Match RPC Functions
  
  ## Functions
  1. join_quick_match_lobby - Atomic join operation
  2. cancel_quick_match_lobby - Cancel own lobby
  3. submit_online_visit - Submit score and handle turn logic
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS join_quick_match_lobby(uuid);
DROP FUNCTION IF EXISTS cancel_quick_match_lobby(uuid);
DROP FUNCTION IF EXISTS submit_online_visit(uuid, int, int, boolean, int);

-- Function to join a lobby atomically
CREATE FUNCTION join_quick_match_lobby(lobby_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quick_match_lobbies%ROWTYPE;
  v_match_id uuid;
  v_legs_to_win int;
  v_current_user uuid;
BEGIN
  v_current_user := (SELECT auth.uid());
  
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and fetch lobby
  SELECT * INTO v_lobby
  FROM quick_match_lobbies
  WHERE id = lobby_uuid
  AND status = 'open'
  AND player2_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOBBY_NOT_AVAILABLE';
  END IF;

  -- Can't join your own lobby
  IF v_lobby.player1_id = v_current_user THEN
    RAISE EXCEPTION 'Cannot join your own lobby';
  END IF;

  -- Calculate legs to win
  v_legs_to_win := CASE
    WHEN v_lobby.format = 'best-of-1' THEN 1
    WHEN v_lobby.format = 'best-of-3' THEN 2
    WHEN v_lobby.format = 'best-of-5' THEN 3
    WHEN v_lobby.format = 'best-of-7' THEN 4
    WHEN v_lobby.format = 'best-of-9' THEN 5
    ELSE 2
  END;

  -- Create match
  INSERT INTO online_matches (
    lobby_id,
    status,
    game_type,
    format,
    double_out,
    player1_id,
    player2_id,
    current_player_id,
    p1_remaining,
    p2_remaining,
    p1_legs_won,
    p2_legs_won,
    leg_number
  ) VALUES (
    lobby_uuid,
    'in_progress',
    v_lobby.game_type,
    v_lobby.format,
    v_lobby.double_out,
    v_lobby.player1_id,
    v_current_user,
    v_lobby.player1_id,
    v_lobby.game_type,
    v_lobby.game_type,
    0,
    0,
    1
  ) RETURNING id INTO v_match_id;

  -- Update lobby
  UPDATE quick_match_lobbies
  SET 
    player2_id = v_current_user,
    status = 'matched',
    match_id = v_match_id
  WHERE id = lobby_uuid;

  -- Send notification to player 1
  INSERT INTO notifications (user_id, type, title, message, link, read)
  VALUES (
    v_lobby.player1_id,
    'quick_match_ready',
    'Match Ready!',
    'Your opponent has joined',
    '/quick-match/match/' || v_match_id,
    false
  );

  RETURN v_match_id;
END;
$$;

-- Function to cancel a lobby
CREATE FUNCTION cancel_quick_match_lobby(lobby_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user uuid;
BEGIN
  v_current_user := (SELECT auth.uid());
  
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Update lobby if owned and open
  UPDATE quick_match_lobbies
  SET status = 'cancelled'
  WHERE id = lobby_uuid
  AND created_by = v_current_user
  AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found or cannot be cancelled';
  END IF;

  RETURN true;
END;
$$;

-- Function to submit a visit
CREATE FUNCTION submit_online_visit(
  p_match_id uuid,
  p_score int,
  p_darts_at_double int,
  p_is_checkout boolean,
  p_checkout_value int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match online_matches%ROWTYPE;
  v_visit_number int;
  v_new_remaining int;
  v_is_player1 boolean;
  v_legs_to_win int;
  v_match_complete boolean := false;
  v_leg_complete boolean := false;
  v_current_user uuid;
BEGIN
  v_current_user := (SELECT auth.uid());
  
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock match
  SELECT * INTO v_match
  FROM online_matches
  WHERE id = p_match_id
  AND status = 'in_progress'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or already finished';
  END IF;

  -- Verify it's the current player's turn
  IF v_match.current_player_id != v_current_user THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  -- Determine which player
  v_is_player1 := v_match.player1_id = v_current_user;

  -- Calculate new remaining
  IF v_is_player1 THEN
    v_new_remaining := v_match.p1_remaining - p_score;
    IF v_new_remaining < 0 OR (v_match.double_out AND v_new_remaining = 1) THEN
      v_new_remaining := v_match.p1_remaining; -- Bust
      p_is_checkout := false;
    END IF;
  ELSE
    v_new_remaining := v_match.p2_remaining - p_score;
    IF v_new_remaining < 0 OR (v_match.double_out AND v_new_remaining = 1) THEN
      v_new_remaining := v_match.p2_remaining; -- Bust
      p_is_checkout := false;
    END IF;
  END IF;

  -- Get visit number
  SELECT COALESCE(MAX(visit_number), 0) + 1
  INTO v_visit_number
  FROM online_match_visits
  WHERE match_id = p_match_id
  AND leg_number = v_match.leg_number
  AND player_id = v_current_user;

  -- Insert visit
  INSERT INTO online_match_visits (
    match_id,
    player_id,
    leg_number,
    visit_number,
    score,
    darts_at_double,
    is_checkout,
    checkout_value,
    new_remaining
  ) VALUES (
    p_match_id,
    v_current_user,
    v_match.leg_number,
    v_visit_number,
    p_score,
    p_darts_at_double,
    p_is_checkout,
    p_checkout_value,
    v_new_remaining
  );

  -- Check if leg is complete
  IF p_is_checkout AND v_new_remaining = 0 THEN
    v_leg_complete := true;
    
    -- Calculate legs to win
    v_legs_to_win := CASE
      WHEN v_match.format = 'best-of-1' THEN 1
      WHEN v_match.format = 'best-of-3' THEN 2
      WHEN v_match.format = 'best-of-5' THEN 3
      WHEN v_match.format = 'best-of-7' THEN 4
      WHEN v_match.format = 'best-of-9' THEN 5
      ELSE 2
    END;

    -- Update legs won
    IF v_is_player1 THEN
      v_match.p1_legs_won := v_match.p1_legs_won + 1;
      
      IF v_match.p1_legs_won >= v_legs_to_win THEN
        v_match_complete := true;
        UPDATE online_matches
        SET 
          p1_legs_won = v_match.p1_legs_won,
          status = 'finished',
          winner_id = v_match.player1_id,
          updated_at = now()
        WHERE id = p_match_id;
      ELSE
        UPDATE online_matches
        SET 
          p1_legs_won = v_match.p1_legs_won,
          leg_number = v_match.leg_number + 1,
          p1_remaining = v_match.game_type,
          p2_remaining = v_match.game_type,
          current_player_id = v_match.player1_id,
          updated_at = now()
        WHERE id = p_match_id;
      END IF;
    ELSE
      v_match.p2_legs_won := v_match.p2_legs_won + 1;
      
      IF v_match.p2_legs_won >= v_legs_to_win THEN
        v_match_complete := true;
        UPDATE online_matches
        SET 
          p2_legs_won = v_match.p2_legs_won,
          status = 'finished',
          winner_id = v_match.player2_id,
          updated_at = now()
        WHERE id = p_match_id;
      ELSE
        UPDATE online_matches
        SET 
          p2_legs_won = v_match.p2_legs_won,
          leg_number = v_match.leg_number + 1,
          p1_remaining = v_match.game_type,
          p2_remaining = v_match.game_type,
          current_player_id = v_match.player1_id,
          updated_at = now()
        WHERE id = p_match_id;
      END IF;
    END IF;
  ELSE
    -- Update remaining and switch turns
    IF v_is_player1 THEN
      UPDATE online_matches
      SET 
        p1_remaining = v_new_remaining,
        current_player_id = v_match.player2_id,
        updated_at = now()
      WHERE id = p_match_id;
    ELSE
      UPDATE online_matches
      SET 
        p2_remaining = v_new_remaining,
        current_player_id = v_match.player1_id,
        updated_at = now()
      WHERE id = p_match_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'leg_complete', v_leg_complete,
    'match_complete', v_match_complete,
    'new_remaining', v_new_remaining
  );
END;
$$;
