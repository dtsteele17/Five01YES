-- ============================================================================
-- NEW REMAATCH SYSTEM - Simplified and Reliable
-- ============================================================================

-- Drop old rematch-related triggers and functions that caused issues
DROP TRIGGER IF EXISTS trg_auto_create_rematch_room ON match_rooms;
DROP FUNCTION IF EXISTS fn_auto_create_rematch_room();

-- Create rematch requests table
CREATE TABLE IF NOT EXISTS quick_match_rematch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_room_id UUID NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL,
  player2_id UUID NOT NULL,
  player1_ready BOOLEAN DEFAULT FALSE,
  player2_ready BOOLEAN DEFAULT FALSE,
  new_room_id UUID REFERENCES match_rooms(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'created', 'cancelled')),
  game_mode INTEGER NOT NULL,
  match_format TEXT NOT NULL,
  match_type TEXT NOT NULL,
  legs_to_win INTEGER NOT NULL,
  double_out BOOLEAN DEFAULT TRUE,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rematch_requests_original_room ON quick_match_rematch_requests(original_room_id);
CREATE INDEX IF NOT EXISTS idx_rematch_requests_status ON quick_match_rematch_requests(status);
CREATE INDEX IF NOT EXISTS idx_rematch_requests_new_room ON quick_match_rematch_requests(new_room_id);

-- Enable RLS
ALTER TABLE quick_match_rematch_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Players can view their own rematch requests"
  ON quick_match_rematch_requests
  FOR SELECT
  TO authenticated
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "Players can create rematch requests for their matches"
  ON quick_match_rematch_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "Players can update their own rematch requests"
  ON quick_match_rematch_requests
  FOR UPDATE
  TO authenticated
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

-- ============================================================================
-- FUNCTION: Request or confirm rematch
-- Called when a player clicks the rematch button
-- ============================================================================
CREATE OR REPLACE FUNCTION request_quick_match_rematch(
  p_original_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_original_room RECORD;
  v_is_player1 BOOLEAN;
  v_opponent_id UUID;
  v_existing_request RECORD;
  v_new_request_id UUID;
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
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Check if match is finished
  IF v_original_room.status != 'finished' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not finished yet');
  END IF;

  -- Determine if user is player 1
  v_is_player1 := (v_original_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_original_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  v_opponent_id := CASE WHEN v_is_player1 THEN v_original_room.player2_id ELSE v_original_room.player1_id END;

  -- Check for existing request
  SELECT * INTO v_existing_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_request IS NOT NULL THEN
    -- Update existing request
    IF v_is_player1 THEN
      UPDATE quick_match_rematch_requests 
      SET player1_ready = TRUE, updated_at = NOW()
      WHERE id = v_existing_request.id;
    ELSE
      UPDATE quick_match_rematch_requests 
      SET player2_ready = TRUE, updated_at = NOW()
      WHERE id = v_existing_request.id;
    END IF;

    -- Refresh the record
    SELECT * INTO v_existing_request
    FROM quick_match_rematch_requests
    WHERE id = v_existing_request.id;

    -- Check if both ready
    IF v_existing_request.player1_ready AND v_existing_request.player2_ready THEN
      -- Update status to ready
      UPDATE quick_match_rematch_requests 
      SET status = 'ready'
      WHERE id = v_existing_request.id;

      RETURN jsonb_build_object(
        'success', true,
        'request_id', v_existing_request.id,
        'both_ready', true,
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
        'player1_ready', v_existing_request.player1_ready,
        'player2_ready', v_existing_request.player2_ready,
        'is_player1', v_is_player1,
        'waiting', true
      );
    END IF;
  ELSE
    -- Create new request
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
-- FUNCTION: Create rematch room (called when both players are ready)
-- Can be called by either player - uses atomic check to prevent duplicates
-- ============================================================================
CREATE OR REPLACE FUNCTION create_quick_match_rematch_room(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_new_room_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get request with lock to prevent race conditions
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE id = p_request_id
    AND status = 'ready'
    AND player1_ready = TRUE 
    AND player2_ready = TRUE
  FOR UPDATE SKIP LOCKED;

  IF v_request IS NULL THEN
    -- Check if room was already created
    SELECT * INTO v_request
    FROM quick_match_rematch_requests
    WHERE id = p_request_id;

    IF v_request IS NOT NULL AND v_request.new_room_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'room_id', v_request.new_room_id,
        'existing', true
      );
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Request not found or not ready');
  END IF;

  -- Verify user is one of the players
  IF v_request.player1_id != v_user_id AND v_request.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
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
    v_request.player1_id,
    v_request.player2_id,
    v_request.game_mode,
    v_request.match_format,
    v_request.match_type,
    'active',
    1,
    v_request.legs_to_win,
    v_request.game_mode,
    v_request.game_mode,
    v_request.player1_id,
    v_request.double_out,
    v_request.source,
    TRUE,
    TRUE,
    'ready'
  )
  RETURNING id INTO v_new_room_id;

  -- Update request with new room info
  UPDATE quick_match_rematch_requests 
  SET 
    new_room_id = v_new_room_id,
    status = 'created',
    updated_at = NOW()
  WHERE id = p_request_id;

  -- Update original room with rematch reference (for backwards compatibility)
  UPDATE match_rooms 
  SET rematch_room_id = v_new_room_id
  WHERE id = v_request.original_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_new_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_quick_match_rematch_room(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Get rematch status for a room
-- ============================================================================
CREATE OR REPLACE FUNCTION get_rematch_status(
  p_original_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_is_player1 BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the most recent request for this room
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'has_request', false,
      'player1_ready', false,
      'player2_ready', false,
      'both_ready', false,
      'new_room_id', NULL
    );
  END IF;

  v_is_player1 := (v_request.player1_id = v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'has_request', true,
    'request_id', v_request.id,
    'status', v_request.status,
    'player1_ready', v_request.player1_ready,
    'player2_ready', v_request.player2_ready,
    'both_ready', (v_request.player1_ready AND v_request.player2_ready),
    'new_room_id', v_request.new_room_id,
    'is_player1', v_is_player1,
    'i_am_ready', CASE WHEN v_is_player1 THEN v_request.player1_ready ELSE v_request.player2_ready END,
    'opponent_ready', CASE WHEN v_is_player1 THEN v_request.player2_ready ELSE v_request.player1_ready END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rematch_status(UUID) TO authenticated;

-- ============================================================================
-- FUNCTION: Cancel rematch request
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_rematch_request(
  p_request_id UUID
)
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

  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.player1_id != v_user_id AND v_request.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE quick_match_rematch_requests 
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_rematch_request(UUID) TO authenticated;

-- ============================================================================
-- TRIGGER: Auto-create room when both players ready
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  -- Only proceed if both ready and room not yet created
  IF NEW.player1_ready AND NEW.player2_ready AND NEW.new_room_id IS NULL AND NEW.status = 'pending' THEN
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

SELECT 'New rematch system created successfully!' as status;
