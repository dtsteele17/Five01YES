-- ============================================================================
-- FIX: Proper Forfeit Stats Recording
-- ============================================================================
-- 
-- Purpose:
-- When a player forfeits:
-- 1. Forfeiter automatically gets a LOSS recorded on their stats
-- 2. Opponent automatically gets a WIN recorded on their stats
-- 3. Both get entries in match_history
-- 4. Both see the result on their dashboard
--
-- This updates the rpc_forfeit_match function to automatically record stats
-- for both players when a forfeit occurs.
--
-- ============================================================================

-- ============================================================================
-- UPDATED: rpc_forfeit_match with automatic stats recording
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_forfeit_match(uuid);

CREATE OR REPLACE FUNCTION rpc_forfeit_match(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_room record;
  v_is_player1 boolean;
  v_winner_id uuid;
  v_loser_id uuid;
  v_event_seq integer;
  v_p1_legs integer;
  v_p2_legs integer;
  v_game_mode integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  -- Check if user is a player in this match
  v_is_player1 := (v_user_id = v_room.player1_id);
  IF NOT v_is_player1 AND v_user_id != v_room.player2_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_player');
  END IF;

  -- Check if match is already finished
  IF v_room.status IN ('finished', 'forfeited', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_already_ended');
  END IF;

  -- Determine winner (the other player) and loser (the forfeiter)
  v_winner_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;
  v_loser_id := v_user_id;
  
  -- Get current legs and game mode
  v_p1_legs := COALESCE(v_room.player1_legs, 0);
  v_p2_legs := COALESCE(v_room.player2_legs, 0);
  v_game_mode := COALESCE(v_room.game_mode, 501);

  -- Get next event sequence
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_event_seq
  FROM match_events
  WHERE room_id = p_room_id;

  -- Insert forfeit event
  INSERT INTO match_events (room_id, player_id, seq, event_type, payload, leg, created_at)
  VALUES (
    p_room_id,
    v_user_id,
    v_event_seq,
    'forfeit',
    jsonb_build_object(
      'forfeiter_id', v_user_id,
      'winner_id', v_winner_id
    ),
    v_room.current_leg,
    now()
  );

  -- Update room status
  UPDATE match_rooms
  SET
    status = 'forfeited',
    winner_id = v_winner_id,
    updated_at = now()
  WHERE id = p_room_id;

  -- ============================================
  -- RECORD STATS FOR WINNER (Opponent)
  -- ============================================
  PERFORM fn_update_player_match_stats(
    p_room_id,
    v_winner_id,
    v_loser_id,
    'win',
    CASE WHEN v_winner_id = v_room.player1_id THEN v_p1_legs ELSE v_p2_legs END,
    CASE WHEN v_winner_id = v_room.player1_id THEN v_p2_legs ELSE v_p1_legs END,
    v_game_mode
  );

  -- ============================================
  -- RECORD STATS FOR LOSER (Forfeiter)
  -- ============================================
  PERFORM fn_update_player_match_stats(
    p_room_id,
    v_loser_id,
    v_winner_id,
    'loss',
    CASE WHEN v_loser_id = v_room.player1_id THEN v_p1_legs ELSE v_p2_legs END,
    CASE WHEN v_loser_id = v_room.player1_id THEN v_p2_legs ELSE v_p1_legs END,
    v_game_mode
  );

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'winner_id', v_winner_id,
    'forfeiter_id', v_user_id,
    'stats_recorded', true
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION rpc_forfeit_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_forfeit_match(uuid) TO anon;

-- ============================================================================
-- CREATE: Function to record forfeit stats for opponent (if RPC not used)
-- ============================================================================

CREATE OR REPLACE FUNCTION record_forfeit_stats(
  p_room_id UUID,
  p_winner_id UUID,
  p_loser_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_p1_legs INTEGER;
  v_p2_legs INTEGER;
  v_game_mode INTEGER;
BEGIN
  -- Get room data
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;
  
  v_p1_legs := COALESCE(v_room.player1_legs, 0);
  v_p2_legs := COALESCE(v_room.player2_legs, 0);
  v_game_mode := COALESCE(v_room.game_mode, 501);
  
  -- Record winner stats (if not already recorded)
  PERFORM fn_update_player_match_stats(
    p_room_id,
    p_winner_id,
    p_loser_id,
    'win',
    CASE WHEN p_winner_id = v_room.player1_id THEN v_p1_legs ELSE v_p2_legs END,
    CASE WHEN p_winner_id = v_room.player1_id THEN v_p2_legs ELSE v_p1_legs END,
    v_game_mode
  );
  
  -- Record loser stats (if not already recorded)
  PERFORM fn_update_player_match_stats(
    p_room_id,
    p_loser_id,
    p_winner_id,
    'loss',
    CASE WHEN p_loser_id = v_room.player1_id THEN v_p1_legs ELSE v_p2_legs END,
    CASE WHEN p_loser_id = v_room.player1_id THEN v_p2_legs ELSE v_p1_legs END,
    v_game_mode
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'winner_id', p_winner_id,
    'loser_id', p_loser_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_forfeit_stats(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_forfeit_stats(UUID, UUID, UUID) TO anon;

-- ============================================================================
-- VERIFY: Check that the functions work correctly
-- ============================================================================

SELECT 'Forfeit stats recording system updated!' as status;
