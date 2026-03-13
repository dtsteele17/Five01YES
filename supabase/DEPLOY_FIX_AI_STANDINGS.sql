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
  v_matchday_num INTEGER;
  v_n INTEGER;
  v_i INTEGER;
  v_home_id UUID;
  v_away_id UUID;
  v_home_wins BOOLEAN;
  v_winner_legs SMALLINT;
  v_loser_legs SMALLINT;
  v_simulated INTEGER := 0;
  v_shuffled UUID[];
  v_temp UUID;
  v_j INTEGER;
  v_seed INTEGER;
  v_has_tier BOOLEAN;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('simulated', 0); END IF;

  v_legs_to_win := ceil(p_best_of::REAL / 2);

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'career_league_standings' AND column_name = 'tier'
  ) INTO v_has_tier;

  SELECT cm.opponent_id INTO v_player_opponent_id
  FROM career_matches cm
  WHERE cm.event_id = p_event_id AND cm.career_id = p_career_id
  LIMIT 1;

  SELECT COUNT(*) INTO v_matchday_num
  FROM career_events
  WHERE career_id = p_career_id
    AND event_type = 'league'
    AND season = v_career.season
    AND status IN ('completed', 'active', 'pending')
    AND id <= p_event_id;

  IF v_has_tier THEN
    SELECT array_agg(ls.opponent_id ORDER BY ls.opponent_id)
    INTO v_ai_ids
    FROM career_league_standings ls
    WHERE ls.career_id = p_career_id
      AND ls.season = v_career.season
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id IS NOT NULL
      AND ls.opponent_id != COALESCE(v_player_opponent_id, '00000000-0000-0000-0000-000000000000'::UUID);
  ELSE
    SELECT array_agg(ls.opponent_id ORDER BY ls.opponent_id)
    INTO v_ai_ids
    FROM career_league_standings ls
    WHERE ls.career_id = p_career_id
      AND ls.season = v_career.season
      AND ls.is_player = FALSE
      AND ls.opponent_id IS NOT NULL
      AND ls.opponent_id != COALESCE(v_player_opponent_id, '00000000-0000-0000-0000-000000000000'::UUID);
  END IF;

  IF v_ai_ids IS NULL OR array_length(v_ai_ids, 1) < 2 THEN
    RETURN json_build_object('simulated', 0);
  END IF;

  v_n := array_length(v_ai_ids, 1);
  IF v_n % 2 = 1 THEN
    v_ai_ids := v_ai_ids[1:v_n-1];
    v_n := v_n - 1;
  END IF;

  v_shuffled := v_ai_ids;
  FOR v_i IN REVERSE v_n..2 LOOP
    v_seed := abs(hashtext(p_event_id::text || v_i::text || v_matchday_num::text));
    v_j := (v_seed % v_i) + 1;
    v_temp := v_shuffled[v_i];
    v_shuffled[v_i] := v_shuffled[v_j];
    v_shuffled[v_j] := v_temp;
  END LOOP;

  v_i := 1;
  WHILE v_i + 1 <= v_n LOOP
    v_home_id := v_shuffled[v_i];
    v_away_id := v_shuffled[v_i + 1];

    v_home_wins := (abs(hashtext(v_home_id::text || v_away_id::text || v_matchday_num::text)) % 2) = 0;
    v_winner_legs := v_legs_to_win;
    v_loser_legs := (abs(hashtext(v_away_id::text || v_home_id::text || v_matchday_num::text)) % v_legs_to_win)::SMALLINT;

    IF v_has_tier THEN
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
    ELSE
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
    END IF;

    v_simulated := v_simulated + 1;
    v_i := v_i + 2;
  END LOOP;

  RETURN json_build_object('simulated', v_simulated, 'matchday', v_matchday_num);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_simulate_matchday_results(UUID, UUID, SMALLINT) TO authenticated;
