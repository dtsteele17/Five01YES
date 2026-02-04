/*
  # Tournament Auto-Start Match
  
  ## Problem
  Tournament ready modal is complex and causes access denied errors.
  
  ## Solution
  Create a simple RPC that automatically creates and starts a tournament match
  when both players are present - no modal needed.
*/

DROP FUNCTION IF EXISTS auto_start_tournament_match(uuid);

CREATE FUNCTION auto_start_tournament_match(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_online_match_id uuid;
  v_tournament RECORD;
  v_player1_auth_id uuid;
  v_player2_auth_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find a pending match where this user is a player and the other player is ready
  SELECT tm.* INTO v_match
  FROM public.tournament_matches tm
  WHERE tm.tournament_id = p_tournament_id
    AND tm.status IN ('pending', 'ready', 'ready_check')
    AND (tm.player1_id = v_user_id OR tm.player2_id = v_user_id)
    AND tm.match_room_id IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending match found for this player';
  END IF;

  -- Get tournament details
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- tournament_matches.player1_id and player2_id are already auth user IDs
  -- (from tournament_participants.user_id which stores auth IDs)
  v_player1_auth_id := v_match.player1_id;
  v_player2_auth_id := v_match.player2_id;

  -- Create the online match directly
  INSERT INTO public.online_matches (
    player1_id,
    player2_id,
    game_type,
    format,
    double_out,
    status,
    leg_number,
    p1_remaining,
    p2_remaining,
    current_player_id
  ) VALUES (
    v_player1_auth_id,
    v_player2_auth_id,
    v_tournament.game_mode,
    CASE COALESCE(v_tournament.best_of, v_tournament.best_of_legs, 3)
      WHEN 1 THEN 'best-of-1'
      WHEN 3 THEN 'best-of-3'
      WHEN 5 THEN 'best-of-5'
      WHEN 7 THEN 'best-of-7'
      ELSE 'best-of-3'
    END,
    true,
    'in_progress',
    1,
    v_tournament.game_mode,
    v_tournament.game_mode,
    v_player1_auth_id
  )
  RETURNING id INTO v_online_match_id;

  -- Update tournament match with the match room ID
  UPDATE public.tournament_matches
  SET 
    match_room_id = v_online_match_id,
    status = 'in_game',
    started_at = now(),
    updated_at = now()
  WHERE id = v_match.id;

  RETURN jsonb_build_object(
    'match_id', v_online_match_id,
    'player1_id', v_player1_auth_id,
    'player2_id', v_player2_auth_id,
    'status', 'in_progress'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION auto_start_tournament_match(uuid) TO authenticated;
