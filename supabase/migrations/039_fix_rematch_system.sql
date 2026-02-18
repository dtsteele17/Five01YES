-- ============================================================================
-- FIX: Rematch System for 301/501 Quick Matches
-- ============================================================================

-- 1. Create rematch requests table if it doesn't exist
-- ============================================================================
CREATE TABLE IF NOT EXISTS quick_match_rematch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_room_id UUID NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL,
  player2_id UUID NOT NULL,
  player1_ready BOOLEAN DEFAULT FALSE,
  player2_ready BOOLEAN DEFAULT FALSE,
  both_ready BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'created', 'cancelled')),
  new_room_id UUID REFERENCES match_rooms(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rematch_original_room ON quick_match_rematch_requests(original_room_id);
CREATE INDEX IF NOT EXISTS idx_rematch_status ON quick_match_rematch_requests(status);
CREATE INDEX IF NOT EXISTS idx_rematch_new_room ON quick_match_rematch_requests(new_room_id);

-- Enable RLS
ALTER TABLE quick_match_rematch_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "rematch_select" ON quick_match_rematch_requests;
DROP POLICY IF EXISTS "rematch_insert" ON quick_match_rematch_requests;
DROP POLICY IF EXISTS "rematch_update" ON quick_match_rematch_requests;

CREATE POLICY "rematch_select" ON quick_match_rematch_requests FOR SELECT
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "rematch_insert" ON quick_match_rematch_requests FOR INSERT
  WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

CREATE POLICY "rematch_update" ON quick_match_rematch_requests FOR UPDATE
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE quick_match_rematch_requests;

-- 2. Function to request a rematch
-- ============================================================================
DROP FUNCTION IF EXISTS request_quick_match_rematch(UUID);

CREATE OR REPLACE FUNCTION request_quick_match_rematch(
  p_original_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_existing_request RECORD;
  v_is_player1 BOOLEAN;
  v_player1_ready BOOLEAN;
  v_player2_ready BOOLEAN;
  v_request_id UUID;
  v_both_ready BOOLEAN;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get the original room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_original_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Room not found');
  END IF;

  -- Verify user is a player in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not a player in this room');
  END IF;

  -- Determine which player
  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Check for existing request
  SELECT * INTO v_existing_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Update existing request
    IF v_is_player1 THEN
      UPDATE quick_match_rematch_requests
      SET player1_ready = TRUE,
          both_ready = player2_ready OR FALSE,
          status = CASE WHEN player2_ready THEN 'ready' ELSE 'pending' END,
          updated_at = NOW()
      WHERE id = v_existing_request.id
      RETURNING player1_ready, player2_ready, both_ready, id
      INTO v_player1_ready, v_player2_ready, v_both_ready, v_request_id;
    ELSE
      UPDATE quick_match_rematch_requests
      SET player2_ready = TRUE,
          both_ready = player1_ready OR FALSE,
          status = CASE WHEN player1_ready THEN 'ready' ELSE 'pending' END,
          updated_at = NOW()
      WHERE id = v_existing_request.id
      RETURNING player1_ready, player2_ready, both_ready, id
      INTO v_player1_ready, v_player2_ready, v_both_ready, v_request_id;
    END IF;
  ELSE
    -- Create new request
    INSERT INTO quick_match_rematch_requests (
      original_room_id,
      player1_id,
      player2_id,
      player1_ready,
      player2_ready,
      both_ready,
      status
    ) VALUES (
      p_original_room_id,
      v_room.player1_id,
      v_room.player2_id,
      v_is_player1,
      NOT v_is_player1,
      FALSE,
      'pending'
    )
    RETURNING id, player1_ready, player2_ready, both_ready
    INTO v_request_id, v_player1_ready, v_player2_ready, v_both_ready;
  END IF;

  -- If both ready, create the rematch room
  IF v_both_ready THEN
    DECLARE
      v_new_room_id UUID;
    BEGIN
      -- Create new room with same settings
      INSERT INTO match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        double_out,
        status,
        current_turn,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_leg,
        player1_legs,
        player2_legs,
        source,
        match_type,
        rematch_of
      ) VALUES (
        v_room.player1_id,
        v_room.player2_id,
        v_room.game_mode,
        v_room.match_format,
        v_room.double_out,
        'waiting', -- Start in waiting state for ready-up
        v_room.player1_id, -- Player 1 starts
        v_room.legs_to_win,
        v_room.game_mode,
        v_room.game_mode,
        1,
        0,
        0,
        v_room.source,
        v_room.match_type,
        p_original_room_id
      )
      RETURNING id INTO v_new_room_id;

      -- Update request with new room
      UPDATE quick_match_rematch_requests
      SET new_room_id = v_new_room_id,
          status = 'created'
      WHERE id = v_request_id;

      -- Update original room with rematch info
      UPDATE match_rooms
      SET rematch_room_id = v_new_room_id
      WHERE id = p_original_room_id;

      RETURN jsonb_build_object(
        'success', TRUE,
        'request_id', v_request_id,
        'player1_ready', v_player1_ready,
        'player2_ready', v_player2_ready,
        'both_ready', TRUE,
        'new_room_id', v_new_room_id
      );
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'request_id', v_request_id,
    'player1_ready', v_player1_ready,
    'player2_ready', v_player2_ready,
    'both_ready', FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to get rematch status
-- ============================================================================
DROP FUNCTION IF EXISTS get_rematch_status(UUID);

CREATE OR REPLACE FUNCTION get_rematch_status(
  p_original_room_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_request RECORD;
  v_is_player1 BOOLEAN;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get the original room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_original_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Room not found');
  END IF;

  -- Determine which player
  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Get latest request
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'has_request', FALSE,
      'i_am_ready', FALSE,
      'opponent_ready', FALSE,
      'both_ready', FALSE
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'has_request', TRUE,
    'request_id', v_request.id,
    'status', v_request.status,
    'player1_ready', v_request.player1_ready,
    'player2_ready', v_request.player2_ready,
    'i_am_ready', CASE WHEN v_is_player1 THEN v_request.player1_ready ELSE v_request.player2_ready END,
    'opponent_ready', CASE WHEN v_is_player1 THEN v_request.player2_ready ELSE v_request.player1_ready END,
    'both_ready', v_request.both_ready,
    'new_room_id', v_request.new_room_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to cancel rematch request
-- ============================================================================
DROP FUNCTION IF EXISTS cancel_rematch_request(UUID);

CREATE OR REPLACE FUNCTION cancel_rematch_request(
  p_request_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- If 'current' is passed, find the latest request for this user
  IF p_request_id IS NULL OR p_request_id::TEXT = 'current' THEN
    SELECT * INTO v_request
    FROM quick_match_rematch_requests
    WHERE (player1_id = v_user_id OR player2_id = v_user_id)
      AND status IN ('pending', 'ready')
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_request
    FROM quick_match_rematch_requests
    WHERE id = p_request_id;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Request not found');
  END IF;

  -- Verify user is a player
  IF v_request.player1_id != v_user_id AND v_request.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authorized');
  END IF;

  -- Cancel the request
  UPDATE quick_match_rematch_requests
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = v_request.id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to create rematch room (manual fallback)
-- ============================================================================
DROP FUNCTION IF EXISTS create_quick_match_rematch_room(UUID);

CREATE OR REPLACE FUNCTION create_quick_match_rematch_room(
  p_request_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_request RECORD;
  v_room RECORD;
  v_new_room_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get the request
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Request not found');
  END IF;

  -- Verify user is a player
  IF v_request.player1_id != v_user_id AND v_request.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not authorized');
  END IF;

  -- Only create if both ready
  IF NOT v_request.both_ready THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Both players must be ready');
  END IF;

  -- Get original room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = v_request.original_room_id;

  -- Create new room
  INSERT INTO match_rooms (
    player1_id,
    player2_id,
    game_mode,
    match_format,
    double_out,
    status,
    current_turn,
    legs_to_win,
    player1_remaining,
    player2_remaining,
    current_leg,
    player1_legs,
    player2_legs,
    source,
    match_type,
    rematch_of
  ) VALUES (
    v_room.player1_id,
    v_room.player2_id,
    v_room.game_mode,
    v_room.match_format,
    v_room.double_out,
    'active', -- Auto-start
    v_room.player1_id,
    v_room.legs_to_win,
    v_room.game_mode,
    v_room.game_mode,
    1,
    0,
    0,
    v_room.source,
    v_room.match_type,
    v_request.original_room_id
  )
  RETURNING id INTO v_new_room_id;

  -- Update request
  UPDATE quick_match_rematch_requests
  SET new_room_id = v_new_room_id,
      status = 'created'
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'room_id', v_new_room_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION request_quick_match_rematch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_rematch_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_rematch_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_quick_match_rematch_room(UUID) TO authenticated;

-- ============================================================================
SELECT 'Rematch system fixed!' as status;
