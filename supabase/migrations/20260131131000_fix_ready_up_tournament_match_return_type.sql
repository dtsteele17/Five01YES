/*
  # Fix ready_up_tournament_match RPC Return Type

  ## Problem
  Migration 20260129053408 attempted to insert into match_rooms with columns
  (match_type, source, tournament_match_id) that don't exist, causing the
  function to fail and preventing tournament games from starting.

  The frontend expects:
  - { match_room_id: uuid, ready_count: N } when both players ready
  - { match_room_id: null, ready_count: N } when waiting for opponent

  ## Solution
  Recreate ready_up_tournament_match() using only columns that exist in
  match_rooms table, and ensure it returns the correct JSON structure.
*/

DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_player1_auth_id uuid;
  v_player2_auth_id uuid;
  v_match RECORD;
  v_tournament RECORD;
  v_is_player boolean;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
  v_status text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament match not found';
  END IF;

  -- Map auth.uid() to profile.id to check if user is a player
  -- (tournament_matches stores profile IDs, not auth user IDs)
  SELECT id INTO v_player1_auth_id
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  v_is_player := (v_match.player1_id = v_player1_auth_id OR v_match.player2_id = v_player1_auth_id);

  IF NOT v_is_player THEN
    RAISE EXCEPTION 'You are not a player in this match';
  END IF;

  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RAISE EXCEPTION 'Match is not in ready check phase';
  END IF;

  -- Record player readiness using profiles.user_id (not auth.users.id)
  INSERT INTO public.tournament_match_ready (match_id, user_id, ready_at)
  SELECT p_match_id, p.user_id, now()
  FROM public.profiles p
  WHERE p.id = v_user_id
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET ready_at = now();

  -- Count how many players are ready
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready tmr
  WHERE tmr.match_id = p_match_id;

  -- If both players are ready and no match room yet, create it
  IF v_ready_count >= 2 AND v_match.match_room_id IS NULL THEN
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of, v_tournament.best_of_legs, 3);

      -- Resolve profile IDs to auth.user IDs for online_matches (RLS expects auth.uid())
      SELECT p.user_id INTO v_player1_auth_id FROM public.profiles p WHERE p.id = v_match.player1_id;
      SELECT p.user_id INTO v_player2_auth_id FROM public.profiles p WHERE p.id = v_match.player2_id;

      -- Fallback to original IDs if mapping not found (handles older schemas)
      v_player1_auth_id := COALESCE(v_player1_auth_id, v_match.player1_id);
      v_player2_auth_id := COALESCE(v_player2_auth_id, v_match.player2_id);

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
        CASE v_best_of
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
      RETURNING id INTO v_match_room_id;

      -- Update tournament match with room ID and mark as in_game
      UPDATE public.tournament_matches
      SET 
        match_room_id = v_match_room_id,
        status = 'in_game',
        started_at = now(),
        updated_at = now()
      WHERE id = p_match_id;

      v_status := 'in_game';
    END IF;
  ELSIF v_ready_count >= 2 AND v_match.match_room_id IS NOT NULL THEN
    v_match_room_id := v_match.match_room_id;
    v_status := 'in_game';
  ELSE
    v_match_room_id := NULL;
    v_status := 'ready';
  END IF;

  -- Return complete match state for UI
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;
