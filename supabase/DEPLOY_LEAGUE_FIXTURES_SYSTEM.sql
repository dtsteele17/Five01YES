DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc
    WHERE proname IN ('rpc_generate_season_fixtures','rpc_simulate_matchday_results','rpc_get_week_fixtures_with_match_lock','rpc_get_week_fixtures_for_event')
    AND pronamespace = 'public'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS career_matchday_fixtures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES career_events(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  matchday SMALLINT NOT NULL,
  home_opponent_id UUID REFERENCES career_opponents(id) ON DELETE CASCADE,
  away_opponent_id UUID REFERENCES career_opponents(id) ON DELETE CASCADE,
  is_player_home BOOLEAN DEFAULT FALSE,
  is_player_away BOOLEAN DEFAULT FALSE,
  home_score SMALLINT,
  away_score SMALLINT,
  simulated BOOLEAN DEFAULT FALSE,
  UNIQUE(career_id, season, matchday, home_opponent_id, away_opponent_id)
);

CREATE INDEX IF NOT EXISTS idx_cmf_career_season ON career_matchday_fixtures(career_id, season);
CREATE INDEX IF NOT EXISTS idx_cmf_event ON career_matchday_fixtures(event_id);

CREATE OR REPLACE FUNCTION rpc_generate_season_fixtures(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_opponents UUID[];
  v_num_players INTEGER;
  v_num_matchdays INTEGER;
  v_players UUID[];
  v_temp UUID;
  v_home_idx INTEGER;
  v_away_idx INTEGER;
  v_matchday INTEGER;
  v_pair INTEGER;
  v_num_pairs INTEGER;
  v_events RECORD;
  v_event_ids UUID[];
  v_ghost UUID := '00000000-0000-0000-0000-000000000000'::UUID;
  v_best_of SMALLINT;
  v_legs_to_win SMALLINT;
  v_home_score SMALLINT;
  v_away_score SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_matchday_fixtures WHERE career_id = p_career_id AND season = v_career.season LIMIT 1) THEN
    RETURN json_build_object('success', true, 'message', 'Fixtures already generated');
  END IF;

  SELECT array_agg(id ORDER BY random()) INTO v_opponents
  FROM career_opponents WHERE career_id = p_career_id;

  IF v_opponents IS NULL OR array_length(v_opponents, 1) = 0 THEN
    RETURN json_build_object('error', 'No opponents found');
  END IF;

  v_num_players := array_length(v_opponents, 1) + 1;

  IF v_num_players % 2 = 1 THEN
    v_players := array_append(v_opponents, v_ghost);
    v_num_players := v_num_players + 1;
  ELSE
    v_players := v_opponents;
  END IF;

  v_players := array_prepend(p_career_id, v_players);
  v_num_matchdays := v_num_players - 1;
  v_num_pairs := v_num_players / 2;

  SELECT array_agg(id ORDER BY sequence_no)
  INTO v_event_ids
  FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'league'
  ORDER BY sequence_no;

  FOR v_matchday IN 1..v_num_matchdays LOOP
    FOR v_pair IN 0..(v_num_pairs - 1) LOOP
      IF v_pair = 0 THEN
        v_home_idx := 1;
        v_away_idx := v_num_players - v_matchday + 1;
        IF v_away_idx > v_num_players THEN v_away_idx := v_away_idx - (v_num_players - 1); END IF;
      ELSE
        v_home_idx := v_matchday + v_pair;
        IF v_home_idx > v_num_players THEN v_home_idx := v_home_idx - (v_num_players - 1); END IF;
        IF v_home_idx = 1 THEN v_home_idx := v_num_players; END IF;
        v_away_idx := v_num_players - v_pair + v_matchday;
        IF v_away_idx > v_num_players THEN v_away_idx := v_away_idx - (v_num_players - 1); END IF;
        IF v_away_idx = 1 THEN v_away_idx := v_num_players; END IF;
      END IF;

      IF v_players[v_home_idx] = v_ghost OR v_players[v_away_idx] = v_ghost THEN
        CONTINUE;
      END IF;

      INSERT INTO career_matchday_fixtures (
        career_id, event_id, season, matchday,
        home_opponent_id, away_opponent_id,
        is_player_home, is_player_away
      ) VALUES (
        p_career_id,
        CASE WHEN v_event_ids IS NOT NULL AND v_matchday <= array_length(v_event_ids, 1) THEN v_event_ids[v_matchday] ELSE NULL END,
        v_career.season,
        v_matchday,
        CASE WHEN v_players[v_home_idx] = p_career_id THEN NULL ELSE v_players[v_home_idx] END,
        CASE WHEN v_players[v_away_idx] = p_career_id THEN NULL ELSE v_players[v_away_idx] END,
        v_players[v_home_idx] = p_career_id,
        v_players[v_away_idx] = p_career_id
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN json_build_object('success', true, 'matchdays', v_num_matchdays, 'pairs_per_day', v_num_pairs);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_simulate_matchday_results(
  p_career_id UUID,
  p_event_id UUID,
  p_best_of SMALLINT DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture RECORD;
  v_legs_to_win SMALLINT;
  v_home_score SMALLINT;
  v_away_score SMALLINT;
  v_simulated INTEGER := 0;
  v_career career_profiles;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;

  v_legs_to_win := ceil(p_best_of::REAL / 2);

  FOR v_fixture IN
    SELECT * FROM career_matchday_fixtures
    WHERE career_id = p_career_id
      AND event_id = p_event_id
      AND simulated = FALSE
      AND is_player_home = FALSE
      AND is_player_away = FALSE
  LOOP
    IF random() < 0.5 THEN
      v_home_score := v_legs_to_win;
      v_away_score := floor(random() * v_legs_to_win)::SMALLINT;
    ELSE
      v_away_score := v_legs_to_win;
      v_home_score := floor(random() * v_legs_to_win)::SMALLINT;
    END IF;

    UPDATE career_matchday_fixtures SET
      home_score = v_home_score,
      away_score = v_away_score,
      simulated = TRUE
    WHERE id = v_fixture.id;

    IF v_home_score > v_away_score THEN
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_home_score, legs_against = legs_against + v_away_score
      WHERE career_id = p_career_id AND opponent_id = v_fixture.home_opponent_id
        AND season = v_career.season AND tier = v_career.tier;

      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_away_score, legs_against = legs_against + v_home_score
      WHERE career_id = p_career_id AND opponent_id = v_fixture.away_opponent_id
        AND season = v_career.season AND tier = v_career.tier;
    ELSE
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_away_score, legs_against = legs_against + v_home_score
      WHERE career_id = p_career_id AND opponent_id = v_fixture.away_opponent_id
        AND season = v_career.season AND tier = v_career.tier;

      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_home_score, legs_against = legs_against + v_away_score
      WHERE career_id = p_career_id AND opponent_id = v_fixture.home_opponent_id
        AND season = v_career.season AND tier = v_career.tier;
    END IF;

    v_simulated := v_simulated + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'simulated', v_simulated);
END;
$$;

CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_with_match_lock(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_fixtures JSON[];
  v_fixture RECORD;
  v_player_fixture JSON;
  v_home_name TEXT;
  v_away_name TEXT;
  v_best_of SMALLINT;
  v_match_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_event FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_best_of := COALESCE(v_event.format_legs, CASE v_career.tier WHEN 3 THEN 5 WHEN 4 THEN 7 ELSE 3 END);

  SELECT * INTO v_match FROM career_matches WHERE event_id = v_event.id AND career_id = p_career_id LIMIT 1;
  SELECT * INTO v_opponent FROM career_opponents WHERE id = v_match.opponent_id;

  IF v_match.id IS NOT NULL THEN
    v_match_id := v_match.id;
  END IF;

  v_player_fixture := json_build_object(
    'id', v_event.id,
    'home_team', 'You',
    'away_team', CASE WHEN v_opponent.nickname IS NOT NULL
      THEN v_opponent.first_name || ' ''' || v_opponent.nickname || ''' ' || v_opponent.last_name
      ELSE v_opponent.first_name || ' ' || v_opponent.last_name END,
    'home_score', v_match.player_legs_won,
    'away_score', v_match.opponent_legs_won,
    'is_player_match', TRUE,
    'status', CASE WHEN v_match.result IS NOT NULL THEN 'completed' ELSE 'pending' END,
    'opponent_id', v_opponent.id
  );

  v_fixtures := ARRAY[v_player_fixture];

  FOR v_fixture IN
    SELECT cmf.*,
      ho.first_name AS h_first, ho.last_name AS h_last, ho.nickname AS h_nick,
      ao.first_name AS a_first, ao.last_name AS a_last, ao.nickname AS a_nick
    FROM career_matchday_fixtures cmf
    LEFT JOIN career_opponents ho ON ho.id = cmf.home_opponent_id
    LEFT JOIN career_opponents ao ON ao.id = cmf.away_opponent_id
    WHERE cmf.event_id = v_event.id
      AND cmf.is_player_home = FALSE AND cmf.is_player_away = FALSE
    ORDER BY cmf.id
  LOOP
    v_home_name := CASE WHEN v_fixture.h_nick IS NOT NULL
      THEN v_fixture.h_first || ' ''' || v_fixture.h_nick || ''' ' || v_fixture.h_last
      ELSE v_fixture.h_first || ' ' || v_fixture.h_last END;
    v_away_name := CASE WHEN v_fixture.a_nick IS NOT NULL
      THEN v_fixture.a_first || ' ''' || v_fixture.a_nick || ''' ' || v_fixture.a_last
      ELSE v_fixture.a_first || ' ' || v_fixture.a_last END;

    v_fixtures := array_append(v_fixtures, json_build_object(
      'id', v_fixture.id,
      'home_team', v_home_name,
      'away_team', v_away_name,
      'home_score', v_fixture.home_score,
      'away_score', v_fixture.away_score,
      'is_player_match', FALSE,
      'status', CASE WHEN v_fixture.simulated THEN 'completed' ELSE 'pending' END
    ));
  END LOOP;

  RETURN json_build_object(
    'career_id', p_career_id,
    'tier', v_career.tier,
    'season', v_career.season,
    'week', v_career.week,
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'format_legs', v_best_of,
    'match_id', v_match_id,
    'opponent', json_build_object(
      'id', v_opponent.id,
      'first_name', v_opponent.first_name,
      'last_name', v_opponent.last_name,
      'nickname', v_opponent.nickname
    ),
    'fixtures', to_json(v_fixtures)
  );
END;
$$;

CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_for_event(
  p_career_id UUID,
  p_event_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_fixtures JSON[];
  v_fixture RECORD;
  v_player_fixture JSON;
  v_home_name TEXT;
  v_away_name TEXT;
  v_best_of SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_best_of := COALESCE(v_event.format_legs, CASE v_career.tier WHEN 3 THEN 5 WHEN 4 THEN 7 ELSE 3 END);

  SELECT * INTO v_match FROM career_matches WHERE event_id = v_event.id AND career_id = p_career_id LIMIT 1;
  SELECT * INTO v_opponent FROM career_opponents WHERE id = v_match.opponent_id;

  v_player_fixture := json_build_object(
    'id', v_event.id,
    'home_team', 'You',
    'away_team', CASE WHEN v_opponent.nickname IS NOT NULL
      THEN v_opponent.first_name || ' ''' || v_opponent.nickname || ''' ' || v_opponent.last_name
      ELSE v_opponent.first_name || ' ' || v_opponent.last_name END,
    'home_score', v_match.player_legs_won,
    'away_score', v_match.opponent_legs_won,
    'is_player_match', TRUE,
    'status', CASE WHEN v_match.result IS NOT NULL THEN 'completed' ELSE 'pending' END,
    'opponent_id', v_opponent.id
  );

  v_fixtures := ARRAY[v_player_fixture];

  FOR v_fixture IN
    SELECT cmf.*,
      ho.first_name AS h_first, ho.last_name AS h_last, ho.nickname AS h_nick,
      ao.first_name AS a_first, ao.last_name AS a_last, ao.nickname AS a_nick
    FROM career_matchday_fixtures cmf
    LEFT JOIN career_opponents ho ON ho.id = cmf.home_opponent_id
    LEFT JOIN career_opponents ao ON ao.id = cmf.away_opponent_id
    WHERE cmf.event_id = p_event_id
      AND cmf.is_player_home = FALSE AND cmf.is_player_away = FALSE
    ORDER BY cmf.id
  LOOP
    v_home_name := CASE WHEN v_fixture.h_nick IS NOT NULL
      THEN v_fixture.h_first || ' ''' || v_fixture.h_nick || ''' ' || v_fixture.h_last
      ELSE v_fixture.h_first || ' ' || v_fixture.h_last END;
    v_away_name := CASE WHEN v_fixture.a_nick IS NOT NULL
      THEN v_fixture.a_first || ' ''' || v_fixture.a_nick || ''' ' || v_fixture.a_last
      ELSE v_fixture.a_first || ' ' || v_fixture.a_last END;

    v_fixtures := array_append(v_fixtures, json_build_object(
      'id', v_fixture.id,
      'home_team', v_home_name,
      'away_team', v_away_name,
      'home_score', v_fixture.home_score,
      'away_score', v_fixture.away_score,
      'is_player_match', FALSE,
      'status', CASE WHEN v_fixture.simulated THEN 'completed' ELSE 'pending' END
    ));
  END LOOP;

  RETURN json_build_object(
    'career_id', p_career_id,
    'tier', v_career.tier,
    'season', v_career.season,
    'week', v_career.week,
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'format_legs', v_best_of,
    'fixtures', to_json(v_fixtures)
  );
END;
$$;
