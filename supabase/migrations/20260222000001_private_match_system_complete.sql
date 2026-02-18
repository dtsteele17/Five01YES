-- ============================================================================
-- COMPLETE PRIVATE MATCH SYSTEM
-- ============================================================================
-- This migration creates:
-- 1. Function to create private match with room
-- 2. Function to set ready status
-- 3. Function to start the match when both ready
-- 4. Triggers for auto-starting
-- ============================================================================

-- 1. Function to create a private match invite with match room
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_create_private_match_invite(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION rpc_create_private_match_invite(
  p_to_user_id uuid,
  p_room_id uuid,
  p_match_options jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_user_id uuid;
  v_invite_id uuid;
  v_from_username text;
  v_to_username text;
  v_is_friend boolean;
  v_game_mode integer;
  v_legs_to_win integer;
  v_double_out boolean;
BEGIN
  v_from_user_id := auth.uid();
  
  IF v_from_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_from_user_id = p_to_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_invite_self');
  END IF;

  -- Check if users are friends
  SELECT EXISTS(
    SELECT 1 FROM friends
    WHERE (user_low = v_from_user_id AND user_high = p_to_user_id)
       OR (user_low = p_to_user_id AND user_high = v_from_user_id)
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_friends');
  END IF;

  -- Extract settings from options
  v_game_mode := COALESCE((p_match_options->>'gameMode')::integer, 501);
  v_legs_to_win := COALESCE((p_match_options->>'legsToWin')::integer, 3);
  v_double_out := COALESCE((p_match_options->>'doubleOut')::boolean, true);

  -- Get usernames
  SELECT username INTO v_from_username
  FROM profiles WHERE id = v_from_user_id;
  
  SELECT username INTO v_to_username
  FROM profiles WHERE id = p_to_user_id;

  -- Create match room first (status = 'waiting')
  INSERT INTO match_rooms (
    id,
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
    player2_ready
  ) VALUES (
    p_room_id,
    v_from_user_id,
    p_to_user_id,
    v_game_mode,
    'best-of-' || (v_legs_to_win * 2 - 1),
    'private',
    'waiting',
    1,
    v_legs_to_win,
    v_game_mode,
    v_game_mode,
    v_from_user_id,
    v_double_out,
    'private',
    false,
    false
  );

  -- Create invite
  INSERT INTO private_match_invites (
    from_user_id, 
    to_user_id, 
    room_id, 
    match_options, 
    status
  ) VALUES (
    v_from_user_id, 
    p_to_user_id, 
    p_room_id, 
    p_match_options, 
    'pending'
  )
  RETURNING id INTO v_invite_id;

  -- Create notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_to_user_id,
    'match_invite',
    'Private Match Invite',
    v_from_username || ' invited you to a private ' || v_game_mode || ' match',
    jsonb_build_object(
      'href', '/app/play/private/lobby/' || p_room_id,
      'invite_id', v_invite_id,
      'room_id', p_room_id,
      'from_user_id', v_from_user_id,
      'from_username', v_from_username,
      'match_options', p_match_options,
      'kind', 'private_match_invite'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'invite_id', v_invite_id,
    'room_id', p_room_id
  );
END;
$$;

-- 2. Function to set ready status in private match
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_set_private_match_ready(uuid, boolean);

CREATE OR REPLACE FUNCTION rpc_set_private_match_ready(
  p_room_id uuid,
  p_ready boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
  v_is_player1 boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Check user is in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  v_is_player1 := (v_room.player1_id = v_user_id);

  -- Update ready status
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_ready = p_ready WHERE id = p_room_id;
  ELSE
    UPDATE match_rooms SET player2_ready = p_ready WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'is_player1', v_is_player1,
    'ready', p_ready
  );
END;
$$;

-- 3. Function to start a private match (when both ready)
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_start_private_match(uuid);

CREATE OR REPLACE FUNCTION rpc_start_private_match(
  p_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Only host can start
  IF v_room.player1_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_host_can_start');
  END IF;

  -- Check both ready
  IF NOT (v_room.player1_ready AND v_room.player2_ready) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_all_ready');
  END IF;

  -- Update room status to active
  UPDATE match_rooms 
  SET 
    status = 'active',
    updated_at = NOW()
  WHERE id = p_room_id;

  -- Update invite status
  UPDATE private_match_invites
  SET status = 'accepted'
  WHERE room_id = p_room_id AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'room_id', p_room_id
  );
END;
$$;

-- 4. Function to cancel a private match
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_cancel_private_match(uuid);

CREATE OR REPLACE FUNCTION rpc_cancel_private_match(
  p_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF v_room.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Check user is in this room
  IF v_room.player1_id != v_user_id AND v_room.player2_id != v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_room');
  END IF;

  -- Cancel invites
  UPDATE private_match_invites
  SET status = 'cancelled'
  WHERE room_id = p_room_id AND status = 'pending';

  -- Cancel room
  UPDATE match_rooms
  SET status = 'cancelled'
  WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Trigger function to auto-start match when both ready
-- ============================================================================
DROP FUNCTION IF EXISTS trg_auto_start_private_match() CASCADE;

CREATE OR REPLACE FUNCTION trg_auto_start_private_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if both players are ready and status is waiting
  IF NEW.status = 'waiting' AND 
     NEW.player1_ready = true AND 
     NEW.player2_ready = true AND
     (OLD.player1_ready = false OR OLD.player2_ready = false) THEN
    
    -- Auto-start after a short delay (handled by client countdown)
    -- Just update the status here if you want immediate start
    -- For now, we'll let the client handle the countdown
    
    -- Update invite status
    UPDATE private_match_invites
    SET status = 'accepted'
    WHERE room_id = NEW.id AND status = 'pending';
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_start_private ON match_rooms;

CREATE TRIGGER trg_auto_start_private
  AFTER UPDATE OF player1_ready, player2_ready ON match_rooms
  FOR EACH ROW
  WHEN (NEW.match_type = 'private')
  EXECUTE FUNCTION trg_auto_start_private_match();

-- 6. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION rpc_create_private_match_invite TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_set_private_match_ready TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_start_private_match TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_cancel_private_match TO authenticated;

-- 7. Ensure match_rooms has the correct structure for private matches
-- ============================================================================
-- Make sure match_type column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'match_type'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN match_type TEXT DEFAULT 'quick';
  END IF;
  
  -- Ensure player1_ready and player2_ready exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'player1_ready'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN player1_ready BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'player2_ready'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN player2_ready BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 8. Update constraint to allow 'waiting' status
-- ============================================================================
ALTER TABLE match_rooms 
  DROP CONSTRAINT IF EXISTS match_rooms_status_check;

ALTER TABLE match_rooms
  ADD CONSTRAINT match_rooms_status_check 
  CHECK (status IN ('waiting', 'active', 'finished', 'cancelled', 'forfeited'));

-- Verify setup
SELECT 'Private match system setup complete!' as status;
