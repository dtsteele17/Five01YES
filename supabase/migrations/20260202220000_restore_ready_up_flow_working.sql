/*
  # RESTORE READY-UP FLOW (1/2 → 2/2 → Game Starts)
  
  User wants: Player 1 ready → 1/2, Player 2 ready → 2/2 → Game starts
  This fixes the ready-up system to work properly.
*/

-- ============================================================
-- 1. Remove auto-start trigger (we want ready-up flow)
-- ============================================================

DROP TRIGGER IF EXISTS trigger_auto_start_tournament_match_on_players ON tournament_matches;
DROP FUNCTION IF EXISTS auto_start_tournament_match_on_players();

-- ============================================================
-- 2. Fix ready_up_tournament_match RPC (SIMPLE, WORKING VERSION)
-- ============================================================

DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match record;
  v_tournament record;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF v_match.player1_id <> v_user_id AND v_match.player2_id <> v_user_id THEN
    RETURN jsonb_build_object('error', 'You are not a player in this match');
  END IF;

  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN jsonb_build_object('error', 'Match is not in ready phase');
  END IF;

  -- INSERT ready status
  INSERT INTO tournament_match_ready (match_id, user_id, ready_at)
  VALUES (p_match_id, v_user_id, now())
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET ready_at = now();

  -- Count ready players
  SELECT COUNT(*) INTO v_ready_count
  FROM tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both ready, create match room
  IF v_ready_count >= 2 AND v_match.match_room_id IS NULL THEN
    SELECT * INTO v_tournament
    FROM tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

      INSERT INTO online_matches (
        player1_id, player2_id, game_type, format, double_out,
        status, leg_number, p1_remaining, p2_remaining, current_player_id
      ) VALUES (
        v_match.player1_id, v_match.player2_id, v_tournament.game_mode,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        true, 'in_progress', 1,
        v_tournament.game_mode, v_tournament.game_mode, v_match.player1_id
      )
      RETURNING id INTO v_match_room_id;

      UPDATE tournament_matches
      SET match_room_id = v_match_room_id,
          status = 'in_game',
          started_at = now(),
          updated_at = now()
      WHERE id = p_match_id;

      RETURN jsonb_build_object(
        'ready_count', v_ready_count,
        'status', 'in_game',
        'match_room_id', v_match_room_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', 'ready',
    'match_room_id', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

-- ============================================================
-- 3. Restore start_tournament_round_matches to use ready_check
-- ============================================================

DROP FUNCTION IF EXISTS start_tournament_round_matches(uuid, integer);

CREATE FUNCTION start_tournament_round_matches(p_tournament_id uuid, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t record;
  m record;
BEGIN
  SELECT * INTO t FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF p_round = 1 THEN
    UPDATE tournaments
    SET status = 'in_progress'
    WHERE id = p_tournament_id AND status IN ('open', 'scheduled', 'locked');
  END IF;

  -- Set matches to ready_check with deadlines
  UPDATE tournament_matches
  SET 
    status = 'ready_check',
    playable_at = now(),
    ready_deadline = now() + interval '5 minutes',
    ready_open_at = now(),
    updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND status = 'pending'
    AND player1_id IS NOT NULL
    AND player2_id IS NOT NULL;

  -- Process ready_check to ready status
  UPDATE tournament_matches
  SET status = 'ready'
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND status = 'ready_check'
    AND ready_deadline > now();
END;
$$;

GRANT EXECUTE ON FUNCTION start_tournament_round_matches(uuid, integer) TO authenticated;

-- ============================================================
-- 4. Add trigger as backup (fires when both ready)
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
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = NEW.match_id;

  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN RETURN NEW; END IF;
  IF v_match.match_room_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_ready_count
  FROM tournament_match_ready
  WHERE match_id = NEW.match_id;

  IF v_ready_count >= 2 THEN
    SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

      INSERT INTO online_matches (
        player1_id, player2_id, game_type, format, double_out,
        status, leg_number, p1_remaining, p2_remaining, current_player_id
      ) VALUES (
        v_match.player1_id, v_match.player2_id, v_tournament.game_mode,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        true, 'in_progress', 1,
        v_tournament.game_mode, v_tournament.game_mode, v_match.player1_id
      )
      RETURNING id INTO v_match_room_id;

      UPDATE tournament_matches
      SET match_room_id = v_match_room_id,
          status = 'in_game',
          started_at = now(),
          updated_at = now()
      WHERE id = NEW.match_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_start_tournament_match
AFTER INSERT ON tournament_match_ready
FOR EACH ROW
EXECUTE FUNCTION auto_start_tournament_match_on_ready();

GRANT EXECUTE ON FUNCTION auto_start_tournament_match_on_ready() TO authenticated;
