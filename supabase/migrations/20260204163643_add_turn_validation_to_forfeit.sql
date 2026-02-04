/*
  # Add Turn Validation to Forfeit RPC

  ## Purpose
  Enforces server-side turn validation for forfeit:
  - Players can only forfeit on their turn
  - Returns specific error: 'not_your_turn'

  ## Changes
  - Recreates rpc_forfeit_match with turn validation
  - Checks room.current_turn against auth.uid()
  - Returns clear error message for client handling
*/

DROP FUNCTION IF EXISTS rpc_forfeit_match(uuid);

CREATE OR REPLACE FUNCTION rpc_forfeit_match(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
  v_is_player1 boolean;
  v_winner_id uuid;
  v_event_seq integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Check if user is a player in this match
  v_is_player1 := (v_user_id = v_room.player1_id);
  IF NOT v_is_player1 AND v_user_id != v_room.player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_player');
  END IF;

  -- Check if match is already finished
  IF v_room.status IN ('finished', 'forfeited', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_already_ended');
  END IF;

  -- Validate it's the player's turn
  IF v_room.current_turn != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_your_turn');
  END IF;

  -- Determine winner (the other player)
  v_winner_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  -- Get next event sequence
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_event_seq
  FROM match_events
  WHERE room_id = p_room_id;

  -- Insert forfeit event
  INSERT INTO match_events (room_id, player_id, seq, event_type, payload, leg, created_at)
  VALUES (
    p_room_id,
    v_user_id,
    v_event_seq,
    'forfeit',
    jsonb_build_object(
      'forfeiter_id', v_user_id,
      'winner_id', v_winner_id
    ),
    v_room.current_leg,
    now()
  );

  -- Update room status
  UPDATE match_rooms
  SET
    status = 'forfeited',
    winner_id = v_winner_id,
    updated_at = now()
  WHERE id = p_room_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'winner_id', v_winner_id,
    'forfeiter_id', v_user_id
  );
END;
$$;
