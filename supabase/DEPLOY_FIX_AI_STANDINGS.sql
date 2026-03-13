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
  v_opponents career_opponents[];
  v_match_event career_events;
  v_player_opponent_id UUID;
  v_available UUID[];
  v_i INTEGER;
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

  SELECT array_agg(co.id ORDER BY random())
  INTO v_available
  FROM career_opponents co
  JOIN career_league_standings ls ON ls.opponent_id = co.id AND ls.career_id = p_career_id
    AND ls.season = v_career.season AND ls.tier = v_career.tier
  WHERE co.career_id = p_career_id
    AND co.id != COALESCE(v_player_opponent_id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_available IS NULL OR array_length(v_available, 1) < 2 THEN
    RETURN json_build_object('simulated', 0);
  END IF;

  v_i := 1;
  WHILE v_i + 1 <= array_length(v_available, 1) LOOP
    v_home_id := v_available[v_i];
    v_away_id := v_available[v_i + 1];

    v_home_wins := (random() < 0.5);
    v_winner_legs := v_legs_to_win;
    v_loser_legs := floor(random() * v_legs_to_win)::SMALLINT;

    IF v_home_wins THEN
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_winner_legs, legs_against = legs_against + v_loser_legs
      WHERE career_id = p_career_id AND opponent_id = v_home_id
        AND season = v_career.season AND tier = v_career.tier;

      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_loser_legs, legs_against = legs_against + v_winner_legs
      WHERE career_id = p_career_id AND opponent_id = v_away_id
        AND season = v_career.season AND tier = v_career.tier;
    ELSE
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + v_winner_legs, legs_against = legs_against + v_loser_legs
      WHERE career_id = p_career_id AND opponent_id = v_away_id
        AND season = v_career.season AND tier = v_career.tier;

      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + v_loser_legs, legs_against = legs_against + v_winner_legs
      WHERE career_id = p_career_id AND opponent_id = v_home_id
        AND season = v_career.season AND tier = v_career.tier;
    END IF;

    v_simulated := v_simulated + 1;
    v_i := v_i + 2;
  END LOOP;

  RETURN json_build_object('simulated', v_simulated);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_simulate_matchday_results(UUID, UUID, SMALLINT) TO authenticated;
