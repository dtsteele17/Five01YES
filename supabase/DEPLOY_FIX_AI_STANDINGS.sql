DROP FUNCTION IF EXISTS rpc_simulate_matchday_results(UUID, UUID, SMALLINT);

CREATE OR REPLACE FUNCTION rpc_simulate_matchday_results(
  p_career_id UUID,
  p_event_id UUID,
  p_best_of SMALLINT DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_legs_to_win SMALLINT;
  v_player_opponent_id UUID;
  v_ai_ids UUID[];
  v_n INTEGER;
  v_i INTEGER;
  v_other_match_count INTEGER;
  v_home_id UUID;
  v_away_id UUID;
  v_home_wins BOOLEAN;
  v_winner_legs SMALLINT;
  v_loser_legs SMALLINT;
  v_simulated INTEGER := 0;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('simulated', 0); END IF;

  v_legs_to_win := ceil(p_best_of::REAL / 2);

  SELECT cm.opponent_id INTO v_player_opponent_id
  FROM career_matches cm
  WHERE cm.event_id = p_event_id AND cm.career_id = p_career_id
  LIMIT 1;

  SELECT array_agg(co_id ORDER BY md5_order)
  INTO v_ai_ids
  FROM (
    SELECT co.id AS co_id, md5(co.id::text || p_event_id::text) AS md5_order
    FROM career_opponents co
    JOIN career_league_standings ls ON ls.opponent_id = co.id
      AND ls.career_id = p_career_id AND ls.season = v_career.season
      AND ls.is_player = FALSE AND ls.opponent_id IS NOT NULL
    WHERE co.career_id = p_career_id
      AND co.id != COALESCE(v_player_opponent_id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) sub;

  IF v_ai_ids IS NULL OR array_length(v_ai_ids, 1) < 2 THEN
    RETURN json_build_object('simulated', 0);
  END IF;

  v_n := array_length(v_ai_ids, 1);
  v_other_match_count := v_n / 2;

  FOR v_i IN 1..v_other_match_count LOOP
    v_home_id := v_ai_ids[v_i * 2 - 1];
    v_away_id := v_ai_ids[v_i * 2];

    v_home_wins := (ascii(md5(v_home_id::text || p_event_id::text)) % 2) = 0;
    v_winner_legs := v_legs_to_win;
    v_loser_legs := (ascii(md5(v_away_id::text || p_event_id::text)) % v_legs_to_win)::SMALLINT;

    IF v_home_wins THEN
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_winner_legs, legs_against = legs_against + v_loser_legs
      WHERE career_id = p_career_id AND opponent_id = v_home_id AND season = v_career.season;
      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_loser_legs, legs_against = legs_against + v_winner_legs
      WHERE career_id = p_career_id AND opponent_id = v_away_id AND season = v_career.season;
    ELSE
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_winner_legs, legs_against = legs_against + v_loser_legs
      WHERE career_id = p_career_id AND opponent_id = v_away_id AND season = v_career.season;
      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_loser_legs, legs_against = legs_against + v_winner_legs
      WHERE career_id = p_career_id AND opponent_id = v_home_id AND season = v_career.season;
    END IF;

    v_simulated := v_simulated + 1;
  END LOOP;

  RETURN json_build_object('simulated', v_simulated);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_simulate_matchday_results(UUID, UUID, SMALLINT) TO authenticated;
