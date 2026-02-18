-- ============================================================================
-- FIX: Private Match Column Name Mismatch
-- ============================================================================
-- The column is 'options' not 'match_options' in the existing table

-- 1. Drop the broken function
DROP FUNCTION IF EXISTS rpc_create_private_match_invite(uuid, uuid, jsonb);

-- 2. Recreate with correct column name 'options'
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

  -- Create invite - USING 'options' NOT 'match_options'
  INSERT INTO private_match_invites (
    from_user_id, 
    to_user_id, 
    room_id, 
    options,  -- <-- CORRECT COLUMN NAME
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
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION rpc_create_private_match_invite(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_create_private_match_invite(uuid, uuid, jsonb) TO service_role;

-- Verify
SELECT 'Private match invite function fixed!' as status;
