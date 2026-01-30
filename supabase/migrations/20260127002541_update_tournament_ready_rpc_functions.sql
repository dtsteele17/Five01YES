/*
  # Update Tournament Ready RPC Functions

  1. Changes
    - Recreate `ready_up_tournament_match(p_match_id UUID)` to return integer (ready count)
      - Simpler function that just records readiness and returns count
      - Does NOT create match room
    - Create `try_start_tournament_match(p_match_id UUID)` to handle match room creation
      - Called after both players are ready
      - Creates match room and updates tournament match status
      - Returns match_room_id

  2. Purpose
    - Cleaner separation of concerns
    - Better realtime experience with explicit ready count
    - Allows 1-second delay before starting match
*/

-- Drop and recreate ready_up_tournament_match to return integer
DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_is_player boolean;
  v_ready_count integer;
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

  v_is_player := (v_match.player1_id = v_user_id OR v_match.player2_id = v_user_id);

  IF NOT v_is_player THEN
    RAISE EXCEPTION 'You are not a player in this match';
  END IF;

  IF v_match.status NOT IN ('pending', 'ready_check') THEN
    RAISE EXCEPTION 'Match is not in ready check phase';
  END IF;

  INSERT INTO public.tournament_match_ready (tournament_match_id, user_id, ready_at)
  VALUES (p_match_id, v_user_id, now())
  ON CONFLICT (tournament_match_id, user_id) 
  DO UPDATE SET ready_at = now();

  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE tournament_match_id = p_match_id;

  RETURN v_ready_count;
END;
$$;

-- Create try_start_tournament_match function
DROP FUNCTION IF EXISTS try_start_tournament_match(uuid);

CREATE FUNCTION try_start_tournament_match(p_match_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_tournament RECORD;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
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

  IF v_match.player1_id != v_user_id AND v_match.player2_id != v_user_id THEN
    RAISE EXCEPTION 'You are not a player in this match';
  END IF;

  IF v_match.match_room_id IS NOT NULL THEN
    RETURN v_match.match_room_id;
  END IF;

  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE tournament_match_id = p_match_id;

  IF v_ready_count < 2 THEN
    RAISE EXCEPTION 'Both players must be ready';
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = v_match.tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  v_best_of := COALESCE(v_tournament.best_of, v_tournament.best_of_legs, 3);

  INSERT INTO public.match_rooms (
    player1_id,
    player2_id,
    game_mode,
    match_format,
    status,
    current_leg,
    legs_to_win,
    player1_remaining,
    player2_remaining,
    current_turn
  ) VALUES (
    v_match.player1_id,
    v_match.player2_id,
    v_tournament.game_mode,
    CASE v_best_of
      WHEN 1 THEN 'best-of-1'
      WHEN 3 THEN 'best-of-3'
      WHEN 5 THEN 'best-of-5'
      WHEN 7 THEN 'best-of-7'
      ELSE 'best-of-3'
    END,
    'active',
    1,
    CASE v_best_of
      WHEN 1 THEN 1
      WHEN 3 THEN 2
      WHEN 5 THEN 3
      WHEN 7 THEN 4
      ELSE 2
    END,
    v_tournament.game_mode,
    v_tournament.game_mode,
    v_match.player1_id
  )
  RETURNING id INTO v_match_room_id;

  UPDATE public.tournament_matches
  SET 
    match_room_id = v_match_room_id,
    status = 'in_progress',
    started_at = now(),
    updated_at = now()
  WHERE id = p_match_id;

  RETURN v_match_room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION try_start_tournament_match(uuid) TO authenticated;
