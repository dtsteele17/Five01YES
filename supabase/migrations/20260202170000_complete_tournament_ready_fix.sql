/*
  # Complete Tournament Ready-Up Fix
  
  ## Problem
  - Player2's Ready Up is not being recorded in tournament_match_ready
  - Match doesn't auto-start when both players are ready
  - Inconsistent use of auth user IDs vs profile IDs
  
  ## Solution
  - Fix ready_up_tournament_match RPC to use auth user IDs consistently
  - Add trigger to auto-start match when both players ready
  - Ensure all ID references are auth user IDs (not profile IDs)
*/

-- ============================================================
-- 1. FIX ready_up_tournament_match RPC FUNCTION
-- ============================================================

DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       uuid;
  v_match         record;
  v_tournament    record;
  v_ready_count   integer;
  v_match_room_id uuid;
  v_best_of       integer;
  v_status        text;
BEGIN
  -- Get current auth user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Load match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament match not found';
  END IF;

  -- Check user is a player (auth IDs everywhere)
  IF v_match.player1_id <> v_user_id AND v_match.player2_id <> v_user_id THEN
    RAISE EXCEPTION 'You are not a player in this match';
  END IF;

  -- Only allow during ready phase
  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RAISE EXCEPTION 'Match is not in ready check phase';
  END IF;

  -- Insert ready status (this is the critical part - uses auth.uid() directly)
  INSERT INTO public.tournament_match_ready (match_id, user_id, ready_at)
  VALUES (p_match_id, v_user_id, now())
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET ready_at = excluded.ready_at;

  -- Count ready players
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both ready, create match room
  IF v_ready_count >= 2 AND v_match.match_room_id IS NULL THEN
    -- Load tournament config
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tournament not found';
    END IF;

    v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

    -- Create online match
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
      true,
      'in_progress',
      1,
      v_tournament.game_mode,
      v_tournament.game_mode,
      v_match.player1_id
    )
    RETURNING id INTO v_match_room_id;

    -- Link tournament match to room
    UPDATE public.tournament_matches
    SET match_room_id = v_match_room_id,
        status = 'in_game',
        started_at = now(),
        updated_at = now()
    WHERE id = p_match_id;

    v_status := 'in_game';
  ELSE
    v_match_room_id := NULL;
    v_status := 'ready';
  END IF;

  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

-- ============================================================
-- 2. ADD TRIGGER TO AUTO-START MATCH WHEN BOTH READY
-- ============================================================

DROP TRIGGER IF EXISTS trigger_auto_start_tournament_match ON tournament_match_ready;
DROP FUNCTION IF EXISTS auto_start_tournament_match_on_ready();

CREATE FUNCTION auto_start_tournament_match_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match record;
  v_tournament record;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
BEGIN
  -- Get the match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = NEW.match_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only proceed if match is in ready phase and doesn't have a room yet
  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN NEW;
  END IF;

  IF v_match.match_room_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Count how many players are ready
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE match_id = NEW.match_id;

  -- If both players are ready, create match room and start match
  IF v_ready_count >= 2 THEN
    -- Get tournament config
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

      -- Create online match
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
        true,
        'in_progress',
        1,
        v_tournament.game_mode,
        v_tournament.game_mode,
        v_match.player1_id
      )
      RETURNING id INTO v_match_room_id;

      -- Update tournament match with room ID and mark as in_game
      UPDATE public.tournament_matches
      SET 
        match_room_id = v_match_room_id,
        status = 'in_game',
        started_at = now(),
        updated_at = now()
      WHERE id = NEW.match_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_auto_start_tournament_match
AFTER INSERT ON tournament_match_ready
FOR EACH ROW
EXECUTE FUNCTION auto_start_tournament_match_on_ready();

GRANT EXECUTE ON FUNCTION auto_start_tournament_match_on_ready() TO authenticated;
