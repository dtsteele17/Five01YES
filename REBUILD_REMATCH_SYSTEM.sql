-- ============================================================================
-- COMPLETE REBUILD OF REMAATCH SYSTEM
-- ============================================================================

-- 1. Drop and recreate the rematch requests table
-- ============================================================================
DROP TABLE IF EXISTS quick_match_rematch_requests CASCADE;

CREATE TABLE quick_match_rematch_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_room_id UUID NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL,
  player2_id UUID NOT NULL,
  player1_ready BOOLEAN DEFAULT FALSE,
  player2_ready BOOLEAN DEFAULT FALSE,
  both_ready BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending', -- 'pending', 'ready', 'created'
  new_room_id UUID REFERENCES match_rooms(id),
  game_mode INTEGER DEFAULT 501,
  match_format TEXT DEFAULT 'quick',
  match_type TEXT,
  legs_to_win INTEGER DEFAULT 3,
  double_out BOOLEAN DEFAULT TRUE,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE quick_match_rematch_requests ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_rematch_requests_original_room ON quick_match_rematch_requests(original_room_id);
CREATE INDEX idx_rematch_requests_status ON quick_match_rematch_requests(status);
CREATE INDEX idx_rematch_requests_new_room ON quick_match_rematch_requests(new_room_id);

-- RLS Policies
DROP POLICY IF EXISTS "Rematch requests viewable by players" ON quick_match_rematch_requests;
CREATE POLICY "Rematch requests viewable by players"
  ON quick_match_rematch_requests FOR SELECT
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

DROP POLICY IF EXISTS "Rematch requests insertable by players" ON quick_match_rematch_requests;
CREATE POLICY "Rematch requests insertable by players"
  ON quick_match_rematch_requests FOR INSERT
  WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

DROP POLICY IF EXISTS "Rematch requests updatable by players" ON quick_match_rematch_requests;
CREATE POLICY "Rematch requests updatable by players"
  ON quick_match_rematch_requests FOR UPDATE
  USING (player1_id = auth.uid() OR player2_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE quick_match_rematch_requests;

-- 2. Create the main rematch request function
-- ============================================================================
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
  v_request RECORD;
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
    RETURN jsonb_build_object('success', false, 'error', 'Match not finished');
  END IF;

  -- Determine if user is player 1
  v_is_player1 := (v_original_room.player1_id = v_user_id);
  
  IF NOT v_is_player1 AND v_original_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a player');
  END IF;

  -- Look for existing pending/ready request
  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE original_room_id = p_original_room_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request IS NULL THEN
    -- Create NEW request - this player is the first to click
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
      CASE WHEN v_is_player1 THEN TRUE ELSE FALSE END,
      CASE WHEN v_is_player1 THEN FALSE ELSE TRUE END,
      v_original_room.game_mode,
      v_original_room.match_format,
      v_original_room.match_type,
      v_original_room.legs_to_win,
      v_original_room.double_out,
      v_original_room.source
    )
    RETURNING * INTO v_request;
    
    RETURN jsonb_build_object(
      'success', true,
      'request_id', v_request.id,
      'both_ready', false,
      'ready_count', 1,
      'player1_ready', v_request.player1_ready,
      'player2_ready', v_request.player2_ready,
      'is_player1', v_is_player1,
      'message', 'Request created, waiting for opponent'
    );
  
  ELSE
    -- Request EXISTS - update THIS player's ready status to TRUE
    -- Only update if not already ready
    IF v_is_player1 AND NOT v_request.player1_ready THEN
      UPDATE quick_match_rematch_requests 
      SET player1_ready = TRUE, updated_at = NOW()
      WHERE id = v_request.id;
      v_request.player1_ready := TRUE;
      
    ELSIF NOT v_is_player1 AND NOT v_request.player2_ready THEN
      UPDATE quick_match_rematch_requests 
      SET player2_ready = TRUE, updated_at = NOW()
      WHERE id = v_request.id;
      v_request.player2_ready := TRUE;
    END IF;

    -- Calculate ready count
    v_ready_count := (CASE WHEN v_request.player1_ready THEN 1 ELSE 0 END) + 
                     (CASE WHEN v_request.player2_ready THEN 1 ELSE 0 END);

    -- Check if BOTH ready
    IF v_request.player1_ready AND v_request.player2_ready THEN
      -- Update to ready - trigger will create the room
      UPDATE quick_match_rematch_requests 
      SET both_ready = TRUE, status = 'ready', updated_at = NOW()
      WHERE id = v_request.id;

      RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request.id,
        'both_ready', true,
        'ready_count', 2,
        'player1_ready', true,
        'player2_ready', true,
        'is_player1', v_is_player1,
        'message', 'Both ready! Creating new match...'
      );
    ELSE
      -- Still waiting
      RETURN jsonb_build_object(
        'success', true,
        'request_id', v_request.id,
        'both_ready', false,
        'ready_count', v_ready_count,
        'player1_ready', v_request.player1_ready,
        'player2_ready', v_request.player2_ready,
        'is_player1', v_is_player1,
        'message', 'Waiting for opponent...'
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION request_quick_match_rematch(UUID) TO authenticated;

-- 3. Create trigger to auto-create room when both ready
-- ============================================================================
DROP FUNCTION IF EXISTS trg_create_rematch_room() CASCADE;

CREATE OR REPLACE FUNCTION trg_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
BEGIN
  -- Only proceed if both ready and room not yet created
  IF NEW.both_ready AND NEW.new_room_id IS NULL AND NEW.status = 'ready' THEN
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

    -- Update request with new room
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

-- 4. Create get status function
-- ============================================================================
DROP FUNCTION IF EXISTS get_rematch_status(UUID);

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
    'both_ready', v_request.both_ready,
    'i_am_ready', v_i_am_ready,
    'opponent_ready', v_opponent_ready,
    'is_player1', v_is_player1,
    'ready_count', v_ready_count,
    'new_room_id', v_request.new_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_rematch_status(UUID) TO authenticated;

-- 5. Create cancel function
-- ============================================================================
DROP FUNCTION IF EXISTS cancel_rematch_request(UUID);

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

  SELECT * INTO v_request
  FROM quick_match_rematch_requests
  WHERE id = p_request_id
    AND status IN ('pending', 'ready')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active request');
  END IF;

  IF v_request.player1_id = v_user_id THEN
    UPDATE quick_match_rematch_requests
    SET player1_ready = FALSE, both_ready = FALSE, status = 'pending', updated_at = NOW()
    WHERE id = v_request.id;
  ELSE
    UPDATE quick_match_rematch_requests
    SET player2_ready = FALSE, both_ready = FALSE, status = 'pending', updated_at = NOW()
    WHERE id = v_request.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Cancelled');
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_rematch_request(UUID) TO authenticated;

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT 'Rematch system rebuilt successfully!' as status;
