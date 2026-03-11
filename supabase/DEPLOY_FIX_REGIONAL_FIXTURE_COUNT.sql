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
  v_player_match career_matches;
  v_player_opponent career_opponents;
  v_fixtures JSON[];
  v_other_opponents career_opponents[];
  v_i INTEGER;
  v_best_of INTEGER;
  v_legs_to_win INTEGER;
  v_total_league_players INTEGER;
  v_other_match_count INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_event FROM career_events
  WHERE id = p_event_id AND career_id = p_career_id;
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Event not found');
  END IF;

  v_best_of := v_event.format_legs;
  v_legs_to_win := ceil(v_best_of / 2.0)::integer;

  SELECT COUNT(*) INTO v_total_league_players
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  v_other_match_count := floor(v_total_league_players / 2.0)::integer - 1;
  IF v_other_match_count < 1 THEN v_other_match_count := 1; END IF;

  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.career_id = p_career_id AND cm.event_id = v_event.id
  LIMIT 1;

  IF v_player_match.id IS NOT NULL THEN
    SELECT co.* INTO v_player_opponent
    FROM career_opponents co WHERE co.id = v_player_match.opponent_id;
  END IF;

  IF v_player_match.id IS NULL OR v_player_opponent.id IS NULL THEN
    RETURN json_build_object('error', 'No match found for this event');
  END IF;

  v_fixtures := ARRAY[
    json_build_object(
      'id', 'player_match',
      'home_team', 'You',
      'away_team', v_player_opponent.first_name || COALESCE(' ''' || v_player_opponent.nickname || ''' ', ' ') || v_player_opponent.last_name,
      'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won END,
      'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won END,
      'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
      'is_player_match', true,
      'event_id', v_event.id,
      'match_id', v_player_match.id
    )
  ];

  SELECT ARRAY(
    SELECT co FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id
      AND ls.season = v_career.season
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id != v_player_opponent.id
    ORDER BY random()
    LIMIT (v_other_match_count * 2)
  ) INTO v_other_opponents;

  FOR v_i IN 1..v_other_match_count LOOP
    IF v_i * 2 <= array_length(v_other_opponents, 1) THEN
      DECLARE
        v_home_wins BOOLEAN := random() < 0.5;
        v_winner_legs INTEGER := v_legs_to_win;
        v_loser_legs INTEGER := floor(random() * v_legs_to_win)::integer;
        v_home_name TEXT;
        v_away_name TEXT;
      BEGIN
        v_home_name := v_other_opponents[v_i * 2 - 1].first_name ||
          COALESCE(' ''' || v_other_opponents[v_i * 2 - 1].nickname || ''' ', ' ') ||
          v_other_opponents[v_i * 2 - 1].last_name;
        v_away_name := v_other_opponents[v_i * 2].first_name ||
          COALESCE(' ''' || v_other_opponents[v_i * 2].nickname || ''' ', ' ') ||
          v_other_opponents[v_i * 2].last_name;

        v_fixtures := v_fixtures || json_build_object(
          'id', 'sim_match_' || v_i,
          'home_team', v_home_name,
          'away_team', v_away_name,
          'home_score', CASE WHEN v_player_match.result != 'pending' THEN
            CASE WHEN v_home_wins THEN v_winner_legs ELSE v_loser_legs END
          ELSE NULL END,
          'away_score', CASE WHEN v_player_match.result != 'pending' THEN
            CASE WHEN v_home_wins THEN v_loser_legs ELSE v_winner_legs END
          ELSE NULL END,
          'status', CASE WHEN v_player_match.result != 'pending' THEN 'completed' ELSE 'pending' END,
          'is_player_match', false
        );
      END;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_event.event_name,
    'format_legs', v_best_of,
    'fixtures', v_fixtures
  );
END;
$$;
