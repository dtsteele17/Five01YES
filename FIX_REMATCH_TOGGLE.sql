-- ============================================================================
-- FIX REMAATCH TOGGLE ISSUE
-- ============================================================================
-- The problem: Clicking rematch toggles the ready state on/off
-- The fix: Only set ready to TRUE, never toggle back to FALSE on click

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
    -- Update existing request - SET ready to TRUE (don't toggle)
    -- Only update this player's ready status, leave the other player unchanged
    IF v_is_player1 THEN
      -- Only update if player1 is not already ready (prevents unnecessary updates)
      IF NOT v_existing_request.player1_ready THEN
        UPDATE quick_match_rematch_requests 
        SET player1_ready = TRUE, updated_at = NOW()
        WHERE id = v_existing_request.id;
        v_existing_request.player1_ready := TRUE;
      END IF;
    ELSE
      -- Only update if player2 is not already ready
      IF NOT v_existing_request.player2_ready THEN
        UPDATE quick_match_rematch_requests 
        SET player2_ready = TRUE, updated_at = NOW()
        WHERE id = v_existing_request.id;
        v_existing_request.player2_ready := TRUE;
      END IF;
    END IF;

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
      v_is_player1,      -- TRUE if player 1 clicked
      NOT v_is_player1,  -- TRUE if player 2 clicked
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

-- ============================================================================
-- Also fix the cancel function to properly reset a player's ready status
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

  -- Reset this player's ready status to FALSE (this is the toggle-off action)
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

SELECT 'Rematch toggle fix applied!' as status;
