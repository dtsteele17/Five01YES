/*
  # Create RPC Functions for Online Multiplayer

  ## Overview
  This migration creates atomic RPC functions for:
  1. Joining quick match lobbies (prevents race conditions)
  2. Starting online matches from lobbies
  3. Submitting online match visits with turn validation
  4. Tournament invitation functions
*/

-- ============================================================
-- 1. JOIN QUICK MATCH LOBBY (ATOMIC)
-- ============================================================

CREATE OR REPLACE FUNCTION join_quick_match_lobby(lobby_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quick_match_lobbies%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Lock the lobby row for update
  SELECT * INTO v_lobby
  FROM quick_match_lobbies
  WHERE id = lobby_uuid
  FOR UPDATE;

  -- Check if lobby exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lobby not found'
    );
  END IF;

  -- Check if lobby is open
  IF v_lobby.status != 'open' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lobby is not open'
    );
  END IF;

  -- Check if guest spot is available
  IF v_lobby.guest_player_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lobby is already full'
    );
  END IF;

  -- Check if user is not the host
  IF v_lobby.host_player_id = auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot join your own lobby'
    );
  END IF;

  -- Claim the guest spot and update status
  UPDATE quick_match_lobbies
  SET 
    guest_player_id = auth.uid(),
    status = 'in_game',
    updated_at = now()
  WHERE id = lobby_uuid;

  -- Return success with updated lobby data
  SELECT jsonb_build_object(
    'success', true,
    'lobby', row_to_json(l.*)
  ) INTO v_result
  FROM quick_match_lobbies l
  WHERE l.id = lobby_uuid;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 2. START ONLINE MATCH FROM LOBBY
-- ============================================================

CREATE OR REPLACE FUNCTION start_online_match_from_lobby(lobby_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby quick_match_lobbies%ROWTYPE;
  v_match_id uuid;
  v_initial_state jsonb;
BEGIN
  -- Get lobby data
  SELECT * INTO v_lobby
  FROM quick_match_lobbies
  WHERE id = lobby_uuid;

  -- Verify lobby exists and has both players
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lobby not found');
  END IF;

  IF v_lobby.guest_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lobby does not have both players');
  END IF;

  IF v_lobby.status != 'in_game' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lobby is not ready to start');
  END IF;

  -- Build initial match state
  v_initial_state := jsonb_build_object(
    'player1Score', v_lobby.game_type,
    'player2Score', v_lobby.game_type,
    'player1LegsWon', 0,
    'player2LegsWon', 0,
    'currentLeg', 1,
    'visits', jsonb_build_array(),
    'legsToWin', CASE
      WHEN v_lobby.best_of = 1 THEN 1
      WHEN v_lobby.best_of = 3 THEN 2
      WHEN v_lobby.best_of = 5 THEN 3
      WHEN v_lobby.best_of = 7 THEN 4
      WHEN v_lobby.best_of = 9 THEN 5
      ELSE 2
    END
  );

  -- Create online match
  INSERT INTO online_matches (
    lobby_id,
    status,
    game_type,
    best_of,
    double_out,
    created_by,
    player1_id,
    player2_id,
    current_turn_player_id,
    state
  ) VALUES (
    lobby_uuid,
    'active',
    v_lobby.game_type,
    v_lobby.best_of,
    v_lobby.double_out,
    v_lobby.created_by,
    v_lobby.host_player_id,
    v_lobby.guest_player_id,
    v_lobby.host_player_id,
    v_initial_state
  )
  RETURNING id INTO v_match_id;

  -- Update lobby with match_id
  UPDATE quick_match_lobbies
  SET match_id = v_match_id
  WHERE id = lobby_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'matchId', v_match_id
  );
END;
$$;

-- ============================================================
-- 3. SUBMIT ONLINE VISIT WITH VALIDATION
-- ============================================================

CREATE OR REPLACE FUNCTION submit_online_visit(
  match_uuid uuid,
  score_value int,
  darts_thrown_count int,
  is_checkout_flag boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match online_matches%ROWTYPE;
  v_state jsonb;
  v_current_player text;
  v_current_score int;
  v_new_score int;
  v_legs_won_key text;
  v_legs_won int;
  v_legs_to_win int;
  v_next_player_id uuid;
BEGIN
  -- Lock match row
  SELECT * INTO v_match
  FROM online_matches
  WHERE id = match_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Verify it's the player's turn
  IF v_match.current_turn_player_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn');
  END IF;

  -- Verify match is active
  IF v_match.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not active');
  END IF;

  -- Determine which player is submitting
  IF v_match.player1_id = auth.uid() THEN
    v_current_player := 'player1';
    v_next_player_id := v_match.player2_id;
  ELSE
    v_current_player := 'player2';
    v_next_player_id := v_match.player1_id;
  END IF;

  -- Get current state
  v_state := v_match.state;

  -- Get current score
  v_current_score := (v_state ->> (v_current_player || 'Score'))::int;
  v_new_score := v_current_score - score_value;

  -- Update score
  v_state := jsonb_set(v_state, ARRAY[v_current_player || 'Score'], to_jsonb(v_new_score));

  -- Add visit to history
  v_state := jsonb_set(
    v_state,
    '{visits}',
    (v_state -> 'visits') || jsonb_build_object(
      'player', v_current_player,
      'score', score_value,
      'dartsThrown', darts_thrown_count,
      'isCheckout', is_checkout_flag,
      'timestamp', now()
    )
  );

  -- Check if leg won
  IF is_checkout_flag AND v_new_score = 0 THEN
    v_legs_won_key := v_current_player || 'LegsWon';
    v_legs_won := (v_state ->> v_legs_won_key)::int + 1;
    v_state := jsonb_set(v_state, ARRAY[v_legs_won_key], to_jsonb(v_legs_won));

    -- Check if match won
    v_legs_to_win := (v_state ->> 'legsToWin')::int;
    IF v_legs_won >= v_legs_to_win THEN
      -- Match complete
      UPDATE online_matches
      SET
        state = v_state,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
      WHERE id = match_uuid;

      RETURN jsonb_build_object(
        'success', true,
        'matchComplete', true,
        'winner', v_current_player,
        'state', v_state
      );
    ELSE
      -- Start new leg
      v_state := jsonb_set(v_state, '{player1Score}', to_jsonb(v_match.game_type));
      v_state := jsonb_set(v_state, '{player2Score}', to_jsonb(v_match.game_type));
      v_state := jsonb_set(v_state, '{currentLeg}', to_jsonb((v_state ->> 'currentLeg')::int + 1));
    END IF;
  END IF;

  -- Update match with new state and switch turn
  UPDATE online_matches
  SET
    state = v_state,
    current_turn_player_id = v_next_player_id,
    updated_at = now()
  WHERE id = match_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'matchComplete', false,
    'state', v_state
  );
END;
$$;

-- ============================================================
-- 4. INVITE USERS TO TOURNAMENT
-- ============================================================

CREATE OR REPLACE FUNCTION invite_users_to_tournament(
  tournament_uuid uuid,
  user_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_user_id uuid;
  v_invited_count int := 0;
  v_profile_name text;
BEGIN
  -- Verify tournament exists and user is creator
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = tournament_uuid
  AND created_by = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found or not authorized');
  END IF;

  -- Insert invites and create notifications
  FOREACH v_user_id IN ARRAY user_ids
  LOOP
    -- Insert or update tournament entry
    INSERT INTO tournament_entries (tournament_id, user_id, status_type, role)
    VALUES (tournament_uuid, v_user_id, 'invited', 'participant')
    ON CONFLICT (tournament_id, user_id)
    DO UPDATE SET status_type = 'invited', updated_at = now();

    -- Get inviting user's name
    SELECT display_name INTO v_profile_name
    FROM profiles
    WHERE id = auth.uid();

    -- Create notification
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_user_id,
      'tournament_invite',
      'Tournament Invitation',
      v_profile_name || ' invited you to ' || v_tournament.name,
      '/app/tournaments/' || tournament_uuid,
      jsonb_build_object('tournament_id', tournament_uuid, 'inviter_id', auth.uid())
    );

    v_invited_count := v_invited_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'invitedCount', v_invited_count
  );
END;
$$;

-- ============================================================
-- 5. ACCEPT TOURNAMENT INVITE
-- ============================================================

CREATE OR REPLACE FUNCTION accept_tournament_invite(tournament_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry tournament_entries%ROWTYPE;
  v_tournament tournaments%ROWTYPE;
  v_current_count int;
BEGIN
  -- Check if user has an invite
  SELECT * INTO v_entry
  FROM tournament_entries
  WHERE tournament_id = tournament_uuid
  AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No invitation found');
  END IF;

  IF v_entry.status_type != 'invited' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation already processed');
  END IF;

  -- Get tournament info
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = tournament_uuid;

  -- Check if tournament is still open
  IF v_tournament.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is no longer accepting players');
  END IF;

  -- Check participant count
  SELECT COUNT(*) INTO v_current_count
  FROM tournament_entries
  WHERE tournament_id = tournament_uuid
  AND status_type IN ('registered', 'invited', 'checked-in');

  IF v_current_count >= v_tournament.max_participants THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is full');
  END IF;

  -- Accept invitation
  UPDATE tournament_entries
  SET status_type = 'registered', updated_at = now()
  WHERE tournament_id = tournament_uuid
  AND user_id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;
