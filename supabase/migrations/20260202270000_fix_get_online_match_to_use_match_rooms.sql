/*
  # Fix get_online_match_with_state to use match_rooms
  
  The RPC function is looking for online_matches which doesn't exist.
  Fix it to use match_rooms instead.
*/

DROP FUNCTION IF EXISTS get_online_match_with_state(uuid);

CREATE FUNCTION get_online_match_with_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_room record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get match room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_match_id
    AND (player1_id = auth.uid() OR player2_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or access denied';
  END IF;

  -- Build result compatible with what the frontend expects
  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_room.id,
      'player1_id', v_room.player1_id,
      'player2_id', v_room.player2_id,
      'game_type', v_room.game_mode,
      'best_of', CASE 
        WHEN v_room.match_format = 'best-of-1' THEN 1
        WHEN v_room.match_format = 'best-of-3' THEN 3
        WHEN v_room.match_format = 'best-of-5' THEN 5
        WHEN v_room.match_format = 'best-of-7' THEN 7
        WHEN v_room.match_format = 'best-of-9' THEN 9
        ELSE 3
      END,
      'double_out', true,
      'status', CASE 
        WHEN v_room.status = 'finished' THEN 'completed'
        WHEN v_room.status = 'active' THEN 'active'
        WHEN v_room.status = 'in_progress' THEN 'active'
        ELSE 'active'
      END,
      'current_turn_player_id', v_room.current_turn
    ),
    'state', jsonb_build_object(
      'player1Score', v_room.player1_remaining,
      'player2Score', v_room.player2_remaining,
      'player1LegsWon', COALESCE((v_room.summary->>'player1_legs')::int, 0),
      'player2LegsWon', COALESCE((v_room.summary->>'player2_legs')::int, 0),
      'currentLeg', v_room.current_leg,
      'legsToWin', v_room.legs_to_win,
      'gameMode', v_room.game_mode,
      'visits', '[]'::jsonb
    ),
    'player1_profile', (
      SELECT jsonb_build_object('id', id, 'username', username, 'display_name', username)
      FROM profiles WHERE user_id = v_room.player1_id LIMIT 1
    ),
    'player2_profile', (
      SELECT jsonb_build_object('id', id, 'username', username, 'display_name', username)
      FROM profiles WHERE user_id = v_room.player2_id LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_online_match_with_state(uuid) TO authenticated;
