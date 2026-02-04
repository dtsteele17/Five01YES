/*
  # FINAL FIX - Player 2 Ready Up Not Working
  
  The issue: Player 2 clicks Ready Up but it stays 1/2
  This ensures BOTH players can ready up correctly.
*/

-- ============================================================
-- 1. Drop and recreate ready_up_tournament_match with better error handling
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
  v_inserted_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Not authenticated',
      'user_id', NULL
    );
  END IF;

  -- Get match
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Match not found',
      'match_id', p_match_id
    );
  END IF;

  -- Check user is a player
  IF v_match.player1_id <> v_user_id AND v_match.player2_id <> v_user_id THEN
    RETURN jsonb_build_object(
      'error', 'You are not a player in this match',
      'user_id', v_user_id,
      'player1_id', v_match.player1_id,
      'player2_id', v_match.player2_id
    );
  END IF;

  -- Check status
  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN jsonb_build_object(
      'error', 'Match is not in ready phase',
      'status', v_match.status
    );
  END IF;

  -- CRITICAL: Insert ready status - this MUST work for both players
  BEGIN
    INSERT INTO tournament_match_ready (match_id, user_id, ready_at)
    VALUES (p_match_id, v_user_id, now())
    ON CONFLICT (match_id, user_id)
    DO UPDATE SET ready_at = now()
    RETURNING user_id INTO v_inserted_user_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', 'Failed to insert ready status: ' || SQLERRM,
      'user_id', v_user_id,
      'match_id', p_match_id
    );
  END;

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
        'match_room_id', v_match_room_id,
        'user_id', v_user_id,
        'success', true
      );
    END IF;
  END IF;

  -- Return ready status
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', 'ready',
    'match_room_id', NULL,
    'user_id', v_user_id,
    'success', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

-- ============================================================
-- 2. Ensure RLS allows inserts for both players
-- ============================================================

-- Check and fix RLS policy
DROP POLICY IF EXISTS "Users can ready up for their matches" ON tournament_match_ready;

CREATE POLICY "Users can ready up for their matches"
  ON tournament_match_ready FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
        AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

-- ============================================================
-- 3. Keep trigger as backup
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
      ) RETURNING id INTO v_match_room_id;
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
