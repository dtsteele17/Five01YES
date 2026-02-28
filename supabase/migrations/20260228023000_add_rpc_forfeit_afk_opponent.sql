/*
  # Add RPC to forfeit AFK opponent
  
  Allows the waiting player to forfeit an opponent who has been AFK.
  Unlike rpc_forfeit_match (which forfeits the CALLER and requires it to be their turn),
  this function forfeits the OTHER player when they've been inactive.
  
  Security: SECURITY DEFINER to bypass RLS. Validates caller is a player in the match.
*/

CREATE OR REPLACE FUNCTION rpc_forfeit_afk_opponent(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
  v_is_player1 boolean;
  v_afk_player_id uuid;
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

  -- Check if match is still active
  IF v_room.status IN ('finished', 'forfeited', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_already_ended');
  END IF;

  -- The AFK player is the opponent (not the caller)
  v_afk_player_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  -- Get next event sequence
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_event_seq
  FROM match_events
  WHERE room_id = p_room_id;

  -- Insert forfeit event
  INSERT INTO match_events (room_id, player_id, seq, event_type, payload, leg, created_at)
  VALUES (
    p_room_id,
    v_afk_player_id,
    v_event_seq,
    'forfeit',
    jsonb_build_object(
      'forfeiter_id', v_afk_player_id,
      'winner_id', v_user_id,
      'reason', 'afk_timeout'
    ),
    v_room.current_leg,
    now()
  );

  -- Update room status — caller wins
  UPDATE match_rooms
  SET
    status = 'forfeited',
    winner_id = v_user_id,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'winner_id', v_user_id,
    'forfeiter_id', v_afk_player_id,
    'reason', 'afk_timeout'
  );
END;
$$;
