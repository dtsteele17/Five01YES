-- Clean version of rematch function fix
-- Run this in Supabase SQL Editor

DROP FUNCTION IF EXISTS request_quick_match_rematch(UUID);

CREATE OR REPLACE FUNCTION request_quick_match_rematch(p_original_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_original_room RECORD;
  v_is_player1 BOOLEAN;
  v_existing_request RECORD;
  v_new_request_id UUID;
  v_ready_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_original_room 
  FROM match_rooms 
  WHERE id = p_original_room_id;

  IF v_original_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_original_room.status != 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not finished yet');
  END IF;

  v_is_player1 := (v_original_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_original_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  SELECT * INTO v_existing_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_request IS NOT NULL THEN
    IF v_is_player1 THEN
      UPDATE quick_match_rematch_requests 
      SET player1_ready = NOT v_existing_request.player1_ready, updated_at = NOW()
      WHERE id = v_existing_request.id;
    ELSE
      UPDATE quick_match_rematch_requests 
      SET player2_ready = NOT v_existing_request.player2_ready, updated_at = NOW()
      WHERE id = v_existing_request.id;
    END IF;

    SELECT * INTO v_existing_request
    FROM quick_match_rematch_requests
    WHERE id = v_existing_request.id;

    v_ready_count := (CASE WHEN v_existing_request.player1_ready THEN 1 ELSE 0 END) + 
                     (CASE WHEN v_existing_request.player2_ready THEN 1 ELSE 0 END);

    IF v_existing_request.player1_ready AND v_existing_request.player2_ready THEN
      UPDATE quick_match_rematch_requests 
      SET status = 'ready'
      WHERE id = v_existing_request.id;

      RETURN jsonb_build_object(
        'success', true,
        'request_id', v_existing_request.id,
        'both_ready', true,
        'ready_count', 2,
        'player1_ready', v_existing_request.player1_ready,
        'player2_ready', v_existing_request.player2_ready,
        'is_player1', v_is_player1
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true,
        'request_id', v_existing_request.id,
        'both_ready', false,
        'ready_count', v_ready_count,
        'player1_ready', v_existing_request.player1_ready,
        'player2_ready', v_existing_request.player2_ready,
        'is_player1', v_is_player1,
        'waiting', true
      );
    END IF;
  ELSE
    INSERT INTO quick_match_rematch_requests (
      original_room_id,
      player1_id,
      player2_id,
      player1_ready,
      player2_ready,
      game_mode,
      match_format,
      match_type,
      legs_to_win,
      double_out,
      source
    ) VALUES (
      p_original_room_id,
      v_original_room.player1_id,
      v_original_room.player2_id,
      v_is_player1,
      NOT v_is_player1,
      v_original_room.game_mode,
      v_original_room.match_format,
      v_original_room.match_type,
      v_original_room.legs_to_win,
      v_original_room.double_out,
      v_original_room.source
    )
    RETURNING id INTO v_new_request_id;

    RETURN jsonb_build_object(
      'success', true,
      'request_id', v_new_request_id,
      'both_ready', false,
      'ready_count', 1,
      'player1_ready', v_is_player1,
      'player2_ready', NOT v_is_player1,
      'is_player1', v_is_player1,
      'waiting', true,
      'created', true
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION request_quick_match_rematch(UUID) TO authenticated;

-- Also ensure trigger function exists
CREATE OR REPLACE FUNCTION trg_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  IF NEW.player1_ready AND NEW.player2_ready AND NEW.new_room_id IS NULL AND NEW.status = 'ready' THEN
    INSERT INTO match_rooms (
      player1_id,
      player2_id,
      game_mode,
      match_format,
      match_type,
      status,
      current_leg,
      legs_to_win,
      player1_remaining,
      player2_remaining,
      current_turn,
      double_out,
      source,
      player1_ready,
      player2_ready,
      pregame_status
    ) VALUES (
      NEW.player1_id,
      NEW.player2_id,
      NEW.game_mode,
      NEW.match_format,
      NEW.match_type,
      'active',
      1,
      NEW.legs_to_win,
      NEW.game_mode,
      NEW.game_mode,
      NEW.player1_id,
      NEW.double_out,
      NEW.source,
      TRUE,
      TRUE,
      'ready'
    )
    RETURNING id INTO v_new_room_id;

    NEW.new_room_id := v_new_room_id;
    NEW.status := 'created';
    NEW.updated_at := NOW();

    UPDATE match_rooms 
    SET rematch_room_id = v_new_room_id
    WHERE id = NEW.original_room_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_rematch_room ON quick_match_rematch_requests;
CREATE TRIGGER trg_create_rematch_room
  BEFORE UPDATE ON quick_match_rematch_requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_create_rematch_room();

SELECT 'Rematch functions updated successfully!' as status;
