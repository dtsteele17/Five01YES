-- ============================================================
-- ONLINE LEAGUES PHASE 3
-- Match launching, forfeit handling, fixture improvements
-- ============================================================

-- 1. League match rooms — track ready-up state for league fixtures
CREATE TABLE IF NOT EXISTS league_match_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id UUID NOT NULL REFERENCES league_fixtures(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  home_user_id UUID NOT NULL REFERENCES auth.users(id),
  away_user_id UUID NOT NULL REFERENCES auth.users(id),
  home_ready BOOLEAN DEFAULT FALSE,
  away_ready BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','ready','playing','completed','forfeit')),
  match_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fixture_id)
);

ALTER TABLE league_match_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "league_match_rooms_select" ON league_match_rooms FOR SELECT USING (home_user_id = auth.uid() OR away_user_id = auth.uid());
CREATE POLICY "league_match_rooms_all" ON league_match_rooms FOR ALL USING (true) WITH CHECK (true);

-- 2. RPC: Check for upcoming league matches (called by polling)
CREATE OR REPLACE FUNCTION rpc_check_league_match_ready(p_user_id UUID DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_fixture league_fixtures;
  v_room league_match_rooms;
  v_league leagues;
BEGIN
  -- Find a fixture that's due now (within 5 min window)
  SELECT * INTO v_fixture
  FROM league_fixtures
  WHERE (home_user_id = v_user_id OR away_user_id = v_user_id)
    AND status = 'scheduled'
    AND scheduled_date = CURRENT_DATE
    AND scheduled_time BETWEEN (CURRENT_TIME - INTERVAL '5 minutes') AND (CURRENT_TIME + INTERVAL '5 minutes')
  ORDER BY scheduled_time ASC
  LIMIT 1;

  IF v_fixture.id IS NULL THEN
    RETURN json_build_object('has_match', false);
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = v_fixture.league_id;

  -- Create or get match room
  INSERT INTO league_match_rooms (fixture_id, league_id, home_user_id, away_user_id)
  VALUES (v_fixture.id, v_fixture.league_id, v_fixture.home_user_id, v_fixture.away_user_id)
  ON CONFLICT (fixture_id) DO NOTHING;

  SELECT * INTO v_room FROM league_match_rooms WHERE fixture_id = v_fixture.id;

  -- Update fixture to live
  UPDATE league_fixtures SET status = 'live' WHERE id = v_fixture.id AND status = 'scheduled';

  RETURN json_build_object(
    'has_match', true,
    'fixture_id', v_fixture.id,
    'room_id', v_room.id,
    'league_name', v_league.name,
    'legs_per_game', v_league.legs_per_game,
    'home_user_id', v_fixture.home_user_id,
    'away_user_id', v_fixture.away_user_id,
    'home_username', (SELECT username FROM profiles WHERE id = v_fixture.home_user_id),
    'away_username', (SELECT username FROM profiles WHERE id = v_fixture.away_user_id),
    'home_ready', v_room.home_ready,
    'away_ready', v_room.away_ready,
    'is_home', v_fixture.home_user_id = v_user_id,
    'status', v_room.status
  );
END;
$$;

-- 3. RPC: Ready up for a league match
CREATE OR REPLACE FUNCTION rpc_league_match_ready_up(p_room_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room league_match_rooms;
  v_both_ready BOOLEAN;
BEGIN
  SELECT * INTO v_room FROM league_match_rooms WHERE id = p_room_id;
  IF v_room.id IS NULL THEN
    RETURN json_build_object('error', 'Match room not found');
  END IF;

  IF v_room.status NOT IN ('waiting', 'ready') THEN
    RETURN json_build_object('error', 'Match already started or completed');
  END IF;

  -- Mark user as ready
  IF v_user_id = v_room.home_user_id THEN
    UPDATE league_match_rooms SET home_ready = TRUE WHERE id = p_room_id;
  ELSIF v_user_id = v_room.away_user_id THEN
    UPDATE league_match_rooms SET away_ready = TRUE WHERE id = p_room_id;
  ELSE
    RETURN json_build_object('error', 'Not a participant');
  END IF;

  -- Check if both ready
  SELECT home_ready AND away_ready INTO v_both_ready
  FROM league_match_rooms WHERE id = p_room_id;

  IF v_both_ready THEN
    UPDATE league_match_rooms SET status = 'playing', match_started_at = now() WHERE id = p_room_id;
  ELSE
    UPDATE league_match_rooms SET status = 'ready' WHERE id = p_room_id AND status = 'waiting';
  END IF;

  RETURN json_build_object(
    'success', true,
    'both_ready', v_both_ready,
    'status', (SELECT status FROM league_match_rooms WHERE id = p_room_id)
  );
END;
$$;

-- 4. RPC: Complete a league match (called after game finishes)
-- Override the existing one to also handle the match room
CREATE OR REPLACE FUNCTION rpc_complete_league_match(
  p_fixture_id UUID,
  p_home_legs SMALLINT,
  p_away_legs SMALLINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture league_fixtures;
  v_league leagues;
  v_home_won BOOLEAN;
BEGIN
  SELECT * INTO v_fixture FROM league_fixtures WHERE id = p_fixture_id;
  IF v_fixture.id IS NULL THEN
    RETURN json_build_object('error', 'Fixture not found');
  END IF;

  IF v_fixture.status NOT IN ('scheduled', 'live') THEN
    RETURN json_build_object('error', 'Match already completed');
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = v_fixture.league_id;
  v_home_won := p_home_legs > p_away_legs;

  -- Update fixture
  UPDATE league_fixtures SET
    status = 'completed',
    home_legs_won = p_home_legs,
    away_legs_won = p_away_legs,
    completed_at = now()
  WHERE id = p_fixture_id;

  -- Update match room
  UPDATE league_match_rooms SET status = 'completed' WHERE fixture_id = p_fixture_id;

  -- Update home player standings
  UPDATE league_standings SET
    played = played + 1,
    won = won + CASE WHEN v_home_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN v_home_won THEN 0 ELSE 1 END,
    legs_for = legs_for + p_home_legs,
    legs_against = legs_against + p_away_legs,
    points = points + CASE WHEN v_home_won THEN 2 ELSE 0 END,
    form = LEFT(CASE WHEN v_home_won THEN 'W' ELSE 'L' END || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = v_fixture.home_user_id;

  -- Update away player standings
  UPDATE league_standings SET
    played = played + 1,
    won = won + CASE WHEN v_home_won THEN 0 ELSE 1 END,
    lost = lost + CASE WHEN v_home_won THEN 1 ELSE 0 END,
    legs_for = legs_for + p_away_legs,
    legs_against = legs_against + p_home_legs,
    points = points + CASE WHEN v_home_won THEN 0 ELSE 2 END,
    form = LEFT(CASE WHEN v_home_won THEN 'L' ELSE 'W' END || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = v_fixture.away_user_id;

  -- Check if all fixtures completed → mark league complete
  IF NOT EXISTS(SELECT 1 FROM league_fixtures WHERE league_id = v_fixture.league_id AND status IN ('scheduled', 'live')) THEN
    UPDATE leagues SET status = 'completed' WHERE id = v_fixture.league_id;
  END IF;

  -- Check for next fixture on same day (games_per_day > 1)
  DECLARE
    v_next_fixture league_fixtures;
  BEGIN
    SELECT * INTO v_next_fixture
    FROM league_fixtures
    WHERE league_id = v_fixture.league_id
      AND scheduled_date = v_fixture.scheduled_date
      AND status = 'scheduled'
      AND (home_user_id IN (v_fixture.home_user_id, v_fixture.away_user_id)
        OR away_user_id IN (v_fixture.home_user_id, v_fixture.away_user_id))
    ORDER BY scheduled_time ASC
    LIMIT 1;

    RETURN json_build_object(
      'success', true,
      'home_won', v_home_won,
      'next_fixture_id', v_next_fixture.id,
      'next_fixture_opponent', CASE 
        WHEN v_next_fixture.id IS NOT NULL THEN
          (SELECT username FROM profiles WHERE id = 
            CASE WHEN v_next_fixture.home_user_id = auth.uid() THEN v_next_fixture.away_user_id ELSE v_next_fixture.home_user_id END)
        ELSE NULL END
    );
  END;
END;
$$;

-- 5. RPC: Forfeit a league match (no-show)
CREATE OR REPLACE FUNCTION rpc_forfeit_league_match(p_fixture_id UUID, p_forfeit_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture league_fixtures;
  v_winner_id UUID;
  v_league leagues;
  v_legs_to_win SMALLINT;
BEGIN
  SELECT * INTO v_fixture FROM league_fixtures WHERE id = p_fixture_id;
  IF v_fixture.id IS NULL THEN RETURN json_build_object('error', 'Fixture not found'); END IF;

  SELECT * INTO v_league FROM leagues WHERE id = v_fixture.league_id;
  v_legs_to_win := ceil(v_league.legs_per_game / 2.0)::SMALLINT;

  -- Determine winner (the one who didn't forfeit)
  IF p_forfeit_user_id = v_fixture.home_user_id THEN
    v_winner_id := v_fixture.away_user_id;
    UPDATE league_fixtures SET status = 'forfeit', home_legs_won = 0, away_legs_won = v_legs_to_win, completed_at = now() WHERE id = p_fixture_id;
  ELSE
    v_winner_id := v_fixture.home_user_id;
    UPDATE league_fixtures SET status = 'forfeit', home_legs_won = v_legs_to_win, away_legs_won = 0, completed_at = now() WHERE id = p_fixture_id;
  END IF;

  UPDATE league_match_rooms SET status = 'forfeit' WHERE fixture_id = p_fixture_id;

  -- Update standings — winner gets 2 pts, loser gets 0
  UPDATE league_standings SET played = played + 1, won = won + 1, legs_for = legs_for + v_legs_to_win,
    points = points + 2, form = LEFT('W' || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = v_winner_id;

  UPDATE league_standings SET played = played + 1, lost = lost + 1, legs_against = legs_against + v_legs_to_win,
    form = LEFT('L' || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = p_forfeit_user_id;

  RETURN json_build_object('success', true, 'winner_id', v_winner_id);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION rpc_check_league_match_ready(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_league_match_ready_up(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_league_match(UUID, SMALLINT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_forfeit_league_match(UUID, UUID) TO authenticated;
