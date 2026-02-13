-- ============================================================================
-- FINAL FIX: Quick Match Rematch System
-- 
-- This migration ensures:
-- 1. Both players click rematch (shows 1/2 then 2/2)
-- 2. System waits for both to be ready
-- 3. Player 1 creates new room, Player 2 joins
-- 4. Both navigate to the SAME new match room
-- ============================================================================

-- First, ensure the match_rooms table has the required columns
ALTER TABLE match_rooms
ADD COLUMN IF NOT EXISTS player1_rematch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS player2_rematch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rematch_room_id UUID DEFAULT NULL REFERENCES match_rooms(id);

-- Create index for faster rematch lookups
CREATE INDEX IF NOT EXISTS idx_match_rooms_rematch_flags ON match_rooms(player1_rematch, player2_rematch) 
WHERE player1_rematch = TRUE OR player2_rematch = TRUE;

CREATE INDEX IF NOT EXISTS idx_match_rooms_rematch_room ON match_rooms(rematch_room_id) 
WHERE rematch_room_id IS NOT NULL;

-- ============================================================================
-- FUNCTION: Request Rematch (Called when player clicks rematch button)
-- Returns: { success: true, ready_count: 1|2, both_ready: false|true, is_player1: true|false }
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_request_rematch(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_opponent_id UUID;
  v_ready_count INTEGER := 0;
BEGIN
  -- Check authentication
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get room details
  SELECT * INTO v_room 
  FROM match_rooms 
  WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Verify user is a player in this match
  v_is_player1 := (v_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  -- Set the appropriate rematch flag
  IF v_is_player1 THEN
    UPDATE match_rooms 
    SET player1_rematch = TRUE, updated_at = NOW()
    WHERE id = p_room_id;
    v_opponent_id := v_room.player2_id;
  ELSE
    UPDATE match_rooms 
    SET player2_rematch = TRUE, updated_at = NOW()
    WHERE id = p_room_id;
    v_opponent_id := v_room.player1_id;
  END IF;

  -- Send signal to opponent that we want a rematch
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES (p_room_id, v_user_id, v_opponent_id, 'rematch_requested', 
          jsonb_build_object('timestamp', extract(epoch from now()), 'player', CASE WHEN v_is_player1 THEN 'player1' ELSE 'player2' END));

  -- Get updated room to check if both are ready
  SELECT player1_rematch, player2_rematch INTO v_room
  FROM match_rooms WHERE id = p_room_id;

  -- Calculate ready count
  IF v_room.player1_rematch THEN v_ready_count := v_ready_count + 1; END IF;
  IF v_room.player2_rematch THEN v_ready_count := v_ready_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ready_count', v_ready_count,
    'both_ready', (v_ready_count = 2),
    'is_player1', v_is_player1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_request_rematch(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Check Rematch Status (For polling)
-- Returns current rematch status including if room has been created
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_check_rematch_status(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_ready_count INTEGER := 0;
BEGIN
  -- Get room details
  SELECT player1_rematch, player2_rematch, rematch_room_id, player1_id, player2_id
  INTO v_room
  FROM match_rooms 
  WHERE id = p_room_id;

  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Calculate ready count
  IF v_room.player1_rematch THEN v_ready_count := v_ready_count + 1; END IF;
  IF v_room.player2_rematch THEN v_ready_count := v_ready_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ready_count', v_ready_count,
    'both_ready', (v_ready_count = 2),
    'player1_ready', v_room.player1_rematch,
    'player2_ready', v_room.player2_rematch,
    'rematch_room_id', v_room.rematch_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_rematch_status(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Create Rematch Room (Only Player 1 calls this)
-- Creates new room with same settings and returns the new room ID
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_create_rematch_room(p_original_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_original_room RECORD;
  v_new_room_id UUID;
  v_is_player1 BOOLEAN;
BEGIN
  -- Check authentication
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get original room
  SELECT * INTO v_original_room 
  FROM match_rooms 
  WHERE id = p_original_room_id;

  IF v_original_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original room not found');
  END IF;

  -- Verify this is player 1
  v_is_player1 := (v_original_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only player 1 can create rematch room');
  END IF;

  -- Check if rematch room already exists
  IF v_original_room.rematch_room_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'room_id', v_original_room.rematch_room_id, 'existing', true);
  END IF;

  -- Verify both players want rematch
  IF NOT (v_original_room.player1_rematch AND v_original_room.player2_rematch) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both players must accept rematch');
  END IF;

  -- Create new room with same settings
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
    pregame_status,
    player1_legs,
    player2_legs
  ) VALUES (
    v_original_room.player1_id,
    v_original_room.player2_id,
    v_original_room.game_mode,
    v_original_room.match_format,
    COALESCE(v_original_room.match_type, 'quick'),
    'active',
    1,
    v_original_room.legs_to_win,
    v_original_room.game_mode,  -- Reset to starting score
    v_original_room.game_mode,  -- Reset to starting score
    v_original_room.player1_id, -- Player 1 starts
    v_original_room.double_out,
    COALESCE(v_original_room.source, 'quick'),
    TRUE,  -- Auto-ready for rematch
    TRUE,  -- Auto-ready for rematch
    'ready', -- Skip pregame for rematch
    0,     -- Reset leg counts
    0      -- Reset leg counts
  )
  RETURNING id INTO v_new_room_id;

  -- Update original room with rematch room reference
  UPDATE match_rooms 
  SET rematch_room_id = v_new_room_id 
  WHERE id = p_original_room_id;

  -- Send signal to both players about the new room
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES 
    (p_original_room_id, v_user_id, v_original_room.player1_id, 'rematch_room_created', 
     jsonb_build_object('new_room_id', v_new_room_id)),
    (p_original_room_id, v_user_id, v_original_room.player2_id, 'rematch_room_created', 
     jsonb_build_object('new_room_id', v_new_room_id));

  RETURN jsonb_build_object('success', true, 'room_id', v_new_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_rematch_room(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Cancel Rematch (Allow players to cancel their rematch request)
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_cancel_rematch(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_is_player1 BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  v_is_player1 := (v_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  -- Reset the appropriate flag
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_rematch = FALSE WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms SET player2_rematch = FALSE WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_cancel_rematch(UUID) TO authenticated;

-- ============================================================================
-- TRIGGER: Auto-create rematch room when both flags are set
-- This is a fallback in case Player 1 doesn't manually create it
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_create_rematch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  -- Only proceed if both players want rematch and no room exists yet
  IF NEW.player1_rematch AND NEW.player2_rematch AND NEW.rematch_room_id IS NULL THEN
    -- Only Player 1 creates the room (to avoid race conditions)
    IF auth.uid() = NEW.player1_id THEN
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
        pregame_status,
        player1_legs,
        player2_legs
      ) VALUES (
        NEW.player1_id,
        NEW.player2_id,
        NEW.game_mode,
        NEW.match_format,
        COALESCE(NEW.match_type, 'quick'),
        'active',
        1,
        NEW.legs_to_win,
        NEW.game_mode,
        NEW.game_mode,
        NEW.player1_id,
        NEW.double_out,
        COALESCE(NEW.source, 'quick'),
        TRUE,
        TRUE,
        'ready',
        0,
        0
      )
      RETURNING id INTO v_new_room_id;

      NEW.rematch_room_id := v_new_room_id;
      
      -- Send signals to both players
      INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
      VALUES 
        (NEW.id, NEW.player1_id, NEW.player1_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id)),
        (NEW.id, NEW.player1_id, NEW.player2_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_auto_create_rematch ON match_rooms;

-- Create trigger
CREATE TRIGGER trg_auto_create_rematch
  BEFORE UPDATE ON match_rooms
  FOR EACH ROW
  WHEN (NEW.player1_rematch = TRUE AND NEW.player2_rematch = TRUE AND NEW.rematch_room_id IS NULL)
  EXECUTE FUNCTION fn_auto_create_rematch();

-- ============================================================================
-- DONE
-- ============================================================================

SELECT 'Rematch system final fix applied!' as status;
