-- ============================================================================
-- REMAATCH SYSTEM FIX
-- ============================================================================
-- Ensures the rematch system works correctly with 0/2, 1/2, 2/2 progression

-- 1. Ensure the cancel_rematch_request function exists
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_rematch_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find the most recent active rematch request for this user
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE (player1_id = v_user_id OR player2_id = v_user_id)
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active rematch request found');
  END IF;

  -- Reset this player's ready status
  IF v_request.player1_id = v_user_id THEN
    UPDATE quick_match_rematch_requests
    SET player1_ready = FALSE, updated_at = NOW()
    WHERE id = v_request.id;
  ELSE
    UPDATE quick_match_rematch_requests
    SET player2_ready = FALSE, updated_at = NOW()
    WHERE id = v_request.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Rematch request cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_rematch_request(UUID) TO authenticated;

-- 2. Ensure get_rematch_status function returns proper counts
-- ============================================================================
CREATE OR REPLACE FUNCTION get_rematch_status(p_original_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_is_player1 BOOLEAN;
  v_i_am_ready BOOLEAN;
  v_opponent_ready BOOLEAN;
  v_ready_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the most recent rematch request for this room
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready', 'created')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_request', false,
      'player1_ready', false,
      'player2_ready', false,
      'both_ready', false,
      'i_am_ready', false,
      'ready_count', 0
    );
  END IF;

  -- Determine player positions
  v_is_player1 := (v_request.player1_id = v_user_id);
  v_i_am_ready := CASE WHEN v_is_player1 THEN v_request.player1_ready ELSE v_request.player2_ready END;
  v_opponent_ready := CASE WHEN v_is_player1 THEN v_request.player2_ready ELSE v_request.player1_ready END;
  v_ready_count := (CASE WHEN v_request.player1_ready THEN 1 ELSE 0 END) + 
                   (CASE WHEN v_request.player2_ready THEN 1 ELSE 0 END);

  RETURN jsonb_build_object(
    'success', true,
    'has_request', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'player1_ready', v_request.player1_ready,
    'player2_ready', v_request.player2_ready,
    'both_ready', v_request.player1_ready AND v_request.player2_ready,
    'i_am_ready', v_i_am_ready,
    'opponent_ready', v_opponent_ready,
    'is_player1', v_is_player1,
    'ready_count', v_ready_count,
    'new_room_id', v_request.new_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rematch_status(UUID) TO authenticated;

-- 3. Update request_quick_match_rematch to handle the 0/2 -> 1/2 -> 2/2 flow
-- ============================================================================
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

  -- Get original room
  SELECT * INTO v_original_room 
  FROM match_rooms 
  WHERE id = p_original_room_id;

  IF v_original_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  IF v_original_room.status != 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not finished yet');
  END IF;

  -- Determine if user is player 1
  v_is_player1 := (v_original_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_original_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  -- Check for existing request
  SELECT * INTO v_existing_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_request IS NOT NULL THEN
    -- Update existing request - toggle this player's ready status
    IF v_is_player1 THEN
      UPDATE quick_match_rematch_requests 
      SET player1_ready = NOT v_existing_request.player1_ready, updated_at = NOW()
      WHERE id = v_existing_request.id;
    ELSE
      UPDATE quick_match_rematch_requests 
      SET player2_ready = NOT v_existing_request.player2_ready, updated_at = NOW()
      WHERE id = v_existing_request.id;
    END IF;

    -- Refresh the record
    SELECT * INTO v_existing_request
    FROM quick_match_rematch_requests
    WHERE id = v_existing_request.id;

    -- Calculate ready count
    v_ready_count := (CASE WHEN v_existing_request.player1_ready THEN 1 ELSE 0 END) + 
                     (CASE WHEN v_existing_request.player2_ready THEN 1 ELSE 0 END);

    -- Check if both ready
    IF v_existing_request.player1_ready AND v_existing_request.player2_ready THEN
      -- Update status to ready - trigger will create the room
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
      -- Still waiting for opponent
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
    -- Create new request - first player is ready
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

-- 4. Ensure the trigger to auto-create room exists
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  -- Only proceed if both ready, room not yet created, and status is 'ready'
  IF NEW.player1_ready AND NEW.player2_ready AND NEW.new_room_id IS NULL AND NEW.status = 'ready' THEN
    -- Create new room
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

    -- Update request
    NEW.new_room_id := v_new_room_id;
    NEW.status := 'created';
    NEW.updated_at := NOW();

    -- Update original room
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

-- 5. Verify setup
-- ============================================================================
SELECT 'Rematch system updated!' as status;
