/*
  # AUTO-START GAME WHEN BOTH PLAYERS JOIN
  
  Goal: When player2 joins tournament and match is created with both players,
  automatically start the game - NO READY-UP NEEDED.
*/

-- ============================================================
-- TRIGGER: Auto-start match when both players assigned
-- ============================================================

DROP TRIGGER IF EXISTS trigger_auto_start_tournament_match_on_players ON tournament_matches;
DROP FUNCTION IF EXISTS auto_start_tournament_match_on_players();

CREATE FUNCTION auto_start_tournament_match_on_players()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament record;
  v_match_room_id uuid;
  v_best_of integer;
BEGIN
  -- Only trigger when both players are assigned and match is pending
  IF NEW.player1_id IS NULL OR NEW.player2_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only for new matches or when status changes to pending/ready_check
  IF NEW.status NOT IN ('pending', 'ready_check') THEN
    RETURN NEW;
  END IF;

  -- Don't create if match room already exists
  IF NEW.match_room_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get tournament config
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = NEW.tournament_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

  -- Create online match immediately
  INSERT INTO online_matches (
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
    NEW.player1_id,
    NEW.player2_id,
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
    NEW.player1_id
  )
  RETURNING id INTO v_match_room_id;

  -- Update match to link room and mark as in_game
  UPDATE tournament_matches
  SET match_room_id = v_match_room_id,
      status = 'in_game',
      started_at = now(),
      updated_at = now()
  WHERE id = NEW.id;

  -- Update NEW record for return
  NEW.match_room_id := v_match_room_id;
  NEW.status := 'in_game';
  NEW.started_at := now();
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

-- Trigger fires AFTER INSERT or UPDATE when both players are present
CREATE TRIGGER trigger_auto_start_tournament_match_on_players
AFTER INSERT OR UPDATE ON tournament_matches
FOR EACH ROW
WHEN (NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL)
EXECUTE FUNCTION auto_start_tournament_match_on_players();

GRANT EXECUTE ON FUNCTION auto_start_tournament_match_on_players() TO authenticated;

-- ============================================================
-- UPDATE: start_tournament_round_matches to skip ready_check
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

  -- Mark tournament in progress at round 1
  IF p_round = 1 THEN
    UPDATE tournaments
    SET status = 'in_progress'
    WHERE id = p_tournament_id AND status IN ('open', 'scheduled', 'locked');
  END IF;

  -- Update matches to pending - trigger will auto-start them
  UPDATE tournament_matches
  SET 
    status = 'pending',
    playable_at = now(),
    updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND status = 'pending'
    AND player1_id IS NOT NULL
    AND player2_id IS NOT NULL;

  -- The trigger will automatically create online_matches and update status to 'in_game'
END;
$$;

GRANT EXECUTE ON FUNCTION start_tournament_round_matches(uuid, integer) TO authenticated;
