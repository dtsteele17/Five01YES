/*
  # REVERT TO WORKING VERSION
  
  The previous migration (20260202260000) was working.
  Reverting to that exact logic which used profiles.id.
  
  Note: Even though the table schema says user_id REFERENCES auth.users(id),
  the working code was using profiles.id, so we'll keep that.
*/

-- Drop and recreate ready_up_tournament_match - REVERT TO WORKING VERSION
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
  v_profile_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  IF v_match.player1_id <> v_user_id AND v_match.player2_id <> v_user_id THEN
    RETURN jsonb_build_object('error', 'You are not a player in this match');
  END IF;

  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN jsonb_build_object('error', 'Match is not in ready phase');
  END IF;

  -- Get profile ID (tournament_match_ready.user_id is profiles.id - as the working version did)
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  -- INSERT ready status using profiles.id (REVERTING TO WORKING VERSION)
  INSERT INTO tournament_match_ready (match_id, user_id, ready_at)
  VALUES (p_match_id, v_profile_id, now())
  ON CONFLICT (match_id, user_id)
  DO UPDATE SET ready_at = now();

  -- Count ready players
  SELECT COUNT(*) INTO v_ready_count
  FROM tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both ready, create match room using match_rooms (not online_matches)
  IF v_ready_count >= 2 AND v_match.match_room_id IS NULL THEN
    SELECT * INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;
    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

      -- Create match room using match_rooms table
      INSERT INTO match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn,
        source,
        match_type,
        tournament_match_id
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
        v_match.player1_id,
        'tournament',
        'tournament',
        p_match_id
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

-- Also revert the trigger to the working version
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
  SELECT * INTO v_match FROM tournament_matches WHERE id = NEW.match_id;
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

      -- Use match_rooms (not online_matches)
      INSERT INTO match_rooms (
        player1_id, player2_id, game_mode, match_format, status,
        current_leg, legs_to_win, player1_remaining, player2_remaining,
        current_turn, source, match_type, tournament_match_id
      ) VALUES (
        v_match.player1_id, v_match.player2_id, v_tournament.game_mode,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        'active', 1,
        CASE v_best_of WHEN 1 THEN 1 WHEN 3 THEN 2 WHEN 5 THEN 3 WHEN 7 THEN 4 ELSE 2 END,
        v_tournament.game_mode, v_tournament.game_mode, v_match.player1_id,
        'tournament', 'tournament', NEW.match_id
      )
      RETURNING id INTO v_match_room_id;

      UPDATE tournament_matches
      SET match_room_id = v_match_room_id, status = 'in_game', started_at = now(), updated_at = now()
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
