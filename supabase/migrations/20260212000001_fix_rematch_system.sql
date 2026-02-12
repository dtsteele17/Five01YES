-- ============================================================================
-- FIX REMATCH SYSTEM - Like DartCounter
-- 
-- This migration ensures that:
-- 1. Both players click rematch
-- 2. System waits for both to be ready
-- 3. Player 1 creates new room
-- 4. Player 2 joins automatically
-- 5. Both navigate to new match
-- ============================================================================

-- ============================================================================
-- 1. FUNCTION: Request Rematch (Enhanced)
-- Called when a player clicks the rematch button
-- ============================================================================

CREATE OR REPLACE FUNCTION request_rematch_v2(p_old_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
  v_old_room match_rooms%ROWTYPE;
  v_rematch match_rematches%ROWTYPE;
  v_is_player1 boolean;
  v_ready_count int;
  v_new_room_id uuid;
  v_other_player_ready boolean;
BEGIN
  v_current_user := auth.uid();

  IF v_current_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Fetch the old match room
  SELECT * INTO v_old_room
  FROM match_rooms
  WHERE id = p_old_room_id
  AND status IN ('finished', 'completed', 'forfeited');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found or not finished');
  END IF;

  -- Verify the user was in the match
  IF v_old_room.player1_id != v_current_user AND v_old_room.player2_id != v_current_user THEN
    RETURN jsonb_build_object('success', false, 'error', 'You were not part of this match');
  END IF;

  -- Determine if current user is player1 or player2
  v_is_player1 := (v_old_room.player1_id = v_current_user);

  -- Try to get existing rematch record with lock
  SELECT * INTO v_rematch
  FROM match_rematches
  WHERE old_room_id = p_old_room_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Create new rematch record
    INSERT INTO match_rematches (
      old_room_id,
      player1_id,
      player2_id,
      player1_ready,
      player2_ready,
      created_at,
      updated_at
    ) VALUES (
      p_old_room_id,
      v_old_room.player1_id,
      v_old_room.player2_id,
      v_is_player1,
      NOT v_is_player1,
      NOW(),
      NOW()
    ) RETURNING * INTO v_rematch;
  ELSE
    -- Update existing rematch record
    IF v_is_player1 THEN
      UPDATE match_rematches
      SET player1_ready = true, updated_at = NOW()
      WHERE old_room_id = p_old_room_id
      RETURNING * INTO v_rematch;
    ELSE
      UPDATE match_rematches
      SET player2_ready = true, updated_at = NOW()
      WHERE old_room_id = p_old_room_id
      RETURNING * INTO v_rematch;
    END IF;
  END IF;

  -- Calculate ready count
  v_ready_count := 0;
  IF v_rematch.player1_ready THEN v_ready_count := v_ready_count + 1; END IF;
  IF v_rematch.player2_ready THEN v_ready_count := v_ready_count + 1; END IF;

  -- Check if other player is already ready
  IF v_is_player1 THEN
    v_other_player_ready := v_rematch.player2_ready;
  ELSE
    v_other_player_ready := v_rematch.player1_ready;
  END IF;

  -- If both players are ready and new room not yet created
  IF v_ready_count = 2 AND v_rematch.new_room_id IS NULL THEN
    -- Only Player 1 creates the room (prevents race conditions)
    IF v_is_player1 THEN
      -- Create new match room with same settings
      INSERT INTO match_rooms (
        lobby_id,
        status,
        game_mode,
        match_format,
        match_type,
        player1_id,
        player2_id,
        current_turn,
        player1_remaining,
        player2_remaining,
        current_leg,
        legs_to_win,
        double_out,
        source,
        created_at
      ) VALUES (
        v_old_room.lobby_id,
        'active',
        v_old_room.game_mode,
        v_old_room.match_format,
        COALESCE(v_old_room.match_type, 'quick'),
        v_old_room.player1_id,
        v_old_room.player2_id,
        v_old_room.player1_id,
        v_old_room.game_mode,
        v_old_room.game_mode,
        1,
        v_old_room.legs_to_win,
        v_old_room.double_out,
        COALESCE(v_old_room.source, 'quick'),
        NOW()
      ) RETURNING id INTO v_new_room_id;

      -- Update rematch record with new room
      UPDATE match_rematches
      SET new_room_id = v_new_room_id, 
          start_at = NOW() + INTERVAL '2 seconds',
          updated_at = NOW()
      WHERE old_room_id = p_old_room_id;

      -- Update lobby if exists
      IF v_old_room.lobby_id IS NOT NULL THEN
        UPDATE quick_match_lobbies
        SET match_id = v_new_room_id, 
            status = 'active',
            updated_at = NOW()
        WHERE id = v_old_room.lobby_id;
      END IF;
    ELSE
      -- Player 2 waits for room to be created
      -- Return immediately, they'll poll for the room
      RETURN jsonb_build_object(
        'success', true,
        'ready_count', v_ready_count,
        'both_ready', true,
        'is_player1', v_is_player1,
        'waiting_for_room', true,
        'new_room_id', null
      );
    END IF;
  END IF;

  -- Return status
  RETURN jsonb_build_object(
    'success', true,
    'ready_count', v_ready_count,
    'both_ready', v_ready_count = 2,
    'is_player1', v_is_player1,
    'new_room_id', COALESCE(v_rematch.new_room_id, v_new_room_id),
    'other_player_ready', v_other_player_ready
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_rematch_v2(uuid) TO authenticated;

-- ============================================================================
-- 2. FUNCTION: Check Rematch Status
-- Poll this to check if rematch room is created
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rematch_status(p_old_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
  v_rematch match_rematches%ROWTYPE;
  v_ready_count int;
  v_is_player1 boolean;
BEGIN
  v_current_user := auth.uid();

  IF v_current_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get rematch record
  SELECT * INTO v_rematch
  FROM match_rematches
  WHERE old_room_id = p_old_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'exists', false,
      'ready_count', 0,
      'both_ready', false
    );
  END IF;

  -- Determine if current user is player1
  v_is_player1 := (v_rematch.player1_id = v_current_user);

  -- Calculate ready count
  v_ready_count := 0;
  IF v_rematch.player1_ready THEN v_ready_count := v_ready_count + 1; END IF;
  IF v_rematch.player2_ready THEN v_ready_count := v_ready_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'exists', true,
    'ready_count', v_ready_count,
    'both_ready', v_ready_count = 2,
    'is_player1', v_is_player1,
    'new_room_id', v_rematch.new_room_id,
    'player1_ready', v_rematch.player1_ready,
    'player2_ready', v_rematch.player2_ready,
    'start_at', v_rematch.start_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_rematch_status(uuid) TO authenticated;

-- ============================================================================
-- 3. FUNCTION: Cancel Rematch
-- Called when a player cancels their rematch request
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_rematch(p_old_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user uuid;
  v_rematch match_rematches%ROWTYPE;
  v_is_player1 boolean;
BEGIN
  v_current_user := auth.uid();

  IF v_current_user IS NULL THEN
    RETURN false;
  END IF;

  -- Get rematch record
  SELECT * INTO v_rematch
  FROM match_rematches
  WHERE old_room_id = p_old_room_id;

  IF NOT FOUND THEN
    RETURN true; -- Nothing to cancel
  END IF;

  -- Determine if current user is player1
  v_is_player1 := (v_rematch.player1_id = v_current_user);

  -- Reset ready status for current player
  IF v_is_player1 THEN
    UPDATE match_rematches
    SET player1_ready = false, updated_at = NOW()
    WHERE old_room_id = p_old_room_id;
  ELSE
    UPDATE match_rematches
    SET player2_ready = false, updated_at = NOW()
    WHERE old_room_id = p_old_room_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_rematch(uuid) TO authenticated;

-- ============================================================================
-- 4. FUNCTION: Cleanup old rematch records
-- Run this periodically to clean up stale rematch requests
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stale_rematches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM match_rematches
  WHERE created_at < NOW() - INTERVAL '5 minutes'
    AND new_room_id IS NULL;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- ============================================================================
-- 5. INDEXES for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_match_rematches_old_room ON match_rematches(old_room_id);
CREATE INDEX IF NOT EXISTS idx_match_rematches_new_room ON match_rematches(new_room_id);
CREATE INDEX IF NOT EXISTS idx_match_rematches_created ON match_rematches(created_at);

-- ============================================================================
-- DONE
-- ============================================================================
