-- ============================================================================
-- FIX: Rematch System v2 - Database-driven like ready up system
-- ============================================================================

-- Add rematch tracking columns to match_rooms (if not exists)
ALTER TABLE match_rooms
ADD COLUMN IF NOT EXISTS player1_rematch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS player2_rematch BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS rematch_room_id UUID DEFAULT NULL REFERENCES match_rooms(id);

-- Create index for rematch lookups
CREATE INDEX IF NOT EXISTS idx_match_rooms_rematch ON match_rooms(player1_rematch, player2_rematch) 
WHERE player1_rematch = TRUE OR player2_rematch = TRUE;

-- ============================================================================
-- FUNCTION: Request rematch (sets player's rematch flag)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_request_rematch(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_opponent_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get room details
  SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Determine if user is player 1 or 2
  v_is_player1 := (v_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  -- Update the appropriate rematch flag
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_rematch = TRUE WHERE id = p_room_id;
    v_opponent_id := v_room.player2_id;
  ELSE
    UPDATE match_rooms SET player2_rematch = TRUE WHERE id = p_room_id;
    v_opponent_id := v_room.player1_id;
  END IF;

  -- Send signal to opponent
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES (p_room_id, v_user_id, v_opponent_id, 'rematch_requested', jsonb_build_object('timestamp', extract(epoch from now())));

  RETURN jsonb_build_object(
    'success', true, 
    'is_player1', v_is_player1,
    'both_ready', (
      SELECT (player1_rematch AND player2_rematch) 
      FROM match_rooms 
      WHERE id = p_room_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_request_rematch(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Check rematch status (for polling)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_check_rematch_status(
  p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
BEGIN
  SELECT player1_rematch, player2_rematch, rematch_room_id, player1_id, player2_id, game_mode, match_format, match_type, legs_to_win, double_out, source
  INTO v_room
  FROM match_rooms 
  WHERE id = p_room_id;

  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'player1_rematch', v_room.player1_rematch,
    'player2_rematch', v_room.player2_rematch,
    'both_ready', (v_room.player1_rematch AND v_room.player2_rematch),
    'rematch_room_id', v_room.rematch_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_check_rematch_status(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Create rematch room (called when both players are ready)
-- Only player 1 should call this
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_create_rematch_room(
  p_original_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_original_room RECORD;
  v_new_room_id UUID;
BEGIN
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

  -- Only player 1 can create rematch room
  IF v_original_room.player1_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only player 1 can create rematch room');
  END IF;

  -- Check if rematch room already exists
  IF v_original_room.rematch_room_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'room_id', v_original_room.rematch_room_id, 'existing', true);
  END IF;

  -- Verify both players want rematch
  IF NOT (v_original_room.player1_rematch AND v_original_room.player2_rematch) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Both players must request rematch');
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
    pregame_status
  ) VALUES (
    v_original_room.player1_id,
    v_original_room.player2_id,
    v_original_room.game_mode,
    v_original_room.match_format,
    v_original_room.match_type,
    'active',
    1,
    v_original_room.legs_to_win,
    v_original_room.game_mode,
    v_original_room.game_mode,
    v_original_room.player1_id,
    v_original_room.double_out,
    v_original_room.source,
    TRUE, -- Auto-ready for rematch
    TRUE, -- Auto-ready for rematch
    'ready' -- Skip pregame lobby for rematch
  )
  RETURNING id INTO v_new_room_id;

  -- Update original room with rematch room reference
  UPDATE match_rooms 
  SET rematch_room_id = v_new_room_id 
  WHERE id = p_original_room_id;

  -- Send signals to both players
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES 
    (p_original_room_id, v_user_id, v_original_room.player1_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id)),
    (p_original_room_id, v_user_id, v_original_room.player2_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id));

  RETURN jsonb_build_object('success', true, 'room_id', v_new_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_rematch_room(UUID) TO authenticated;

-- ============================================================================
-- TRIGGER: Auto-create rematch room when both flags are set
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auto_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  -- Only proceed if both players want rematch and no rematch room exists yet
  IF NEW.player1_rematch AND NEW.player2_rematch AND NEW.rematch_room_id IS NULL THEN
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
      TRUE, -- Auto-ready for rematch
      TRUE, -- Auto-ready for rematch  
      'ready' -- Skip pregame for rematch
    )
    RETURNING id INTO v_new_room_id;

    -- Update the original room with rematch room reference
    NEW.rematch_room_id := v_new_room_id;
    
    -- Send signals to both players
    INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
    VALUES 
      (NEW.id, NEW.player1_id, NEW.player1_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id)),
      (NEW.id, NEW.player1_id, NEW.player2_id, 'rematch_room_created', jsonb_build_object('new_room_id', v_new_room_id));
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists to avoid errors
DROP TRIGGER IF EXISTS trg_auto_create_rematch_room ON match_rooms;

-- Create trigger
CREATE TRIGGER trg_auto_create_rematch_room
  BEFORE UPDATE ON match_rooms
  FOR EACH ROW
  WHEN (NEW.player1_rematch = TRUE AND NEW.player2_rematch = TRUE AND NEW.rematch_room_id IS NULL)
  EXECUTE FUNCTION fn_auto_create_rematch_room();

SELECT 'Rematch system v2 created!' as status;
