-- Fix: County Circuit (10 players) should show 4 other matches, not 3
-- Fix: Best of 5 scores must be valid (3-0, 3-1, 3-2, 0-3, 1-3, 2-3)
-- Dynamic fixture count based on league size

CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_with_match_lock(p_career_id UUID)
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
  v_fixture JSON;
  v_other_opponents career_opponents[];
  v_i INTEGER;
  v_result JSON;
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

  -- Get next pending/active league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;

  -- Fallback to most recently completed
  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM career_events 
    WHERE career_id = p_career_id 
      AND season = v_career.season
      AND event_type = 'league'
      AND status = 'completed'
    ORDER BY sequence_no DESC 
    LIMIT 1;
  END IF;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event found');
  END IF;

  v_best_of := v_event.format_legs;
  v_legs_to_win := ceil(v_best_of / 2.0)::integer;

  -- Count total league players (including player)
  SELECT COUNT(*) INTO v_total_league_players
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  -- Other matches = (total_players / 2) - 1 (minus the player's match)
  v_other_match_count := (v_total_league_players / 2) - 1;
  IF v_other_match_count < 1 THEN v_other_match_count := 1; END IF;

  -- Get/create player's match
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.career_id = p_career_id AND cm.event_id = v_event.id;

  IF v_player_match.id IS NOT NULL THEN
    SELECT co.* INTO v_player_opponent
    FROM career_opponents co WHERE co.id = v_player_match.opponent_id;
  END IF;

  IF v_player_match.id IS NULL THEN
    SELECT co.* INTO v_player_opponent FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id NOT IN (
        SELECT cm.opponent_id FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE cm.career_id = p_career_id 
          AND ce.event_type = 'league' 
          AND ce.season = v_career.season
          AND cm.result != 'pending'
      )
    ORDER BY md5(co.id::text || v_event.id::text)
    LIMIT 1;

    IF v_player_opponent.id IS NULL THEN
      SELECT co.* INTO v_player_opponent FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY md5(co.id::text || v_event.id::text)
      LIMIT 1;
    END IF;

    IF v_player_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_event.id, v_player_opponent.id, v_event.format_legs, 'pending'
    ) RETURNING * INTO v_player_match;
  END IF;

  -- Build player fixture
  v_fixtures := ARRAY[
    json_build_object(
      'id', 'player_match',
      'home_team', 'You',
      'away_team', TRIM(
        COALESCE(v_player_opponent.first_name, '') || 
        CASE WHEN v_player_opponent.nickname IS NOT NULL THEN ' ''' || v_player_opponent.nickname || ''' ' ELSE ' ' END ||
        COALESCE(v_player_opponent.last_name, '')
      ),
      'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won END,
      'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won END,
      'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
      'is_player_match', true,
      'event_id', v_event.id,
      'match_id', v_player_match.id
    )
  ];

  -- Get other opponents for simulated matches (exclude player's opponent)
  -- Need (other_match_count * 2) opponents
  SELECT ARRAY(
    SELECT co FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id != v_player_opponent.id
    ORDER BY md5(co.id::text || v_event.id::text)
    LIMIT (v_other_match_count * 2)
  ) INTO v_other_opponents;

  -- Generate simulated matches with VALID best-of scores
  FOR v_i IN 1..v_other_match_count LOOP
    IF v_i * 2 <= array_length(v_other_opponents, 1) THEN
      DECLARE
        v_home_wins BOOLEAN := (ascii(md5(v_other_opponents[v_i * 2 - 1].id::text || v_event.id::text)) % 2) = 0;
        v_winner_legs INTEGER := v_legs_to_win;  -- Always exactly legs_to_win (e.g. 3 for BO5)
        v_loser_legs INTEGER := (ascii(md5(v_other_opponents[v_i * 2].id::text || v_event.id::text)) % v_legs_to_win)::integer;  -- 0 to legs_to_win-1
      BEGIN
        v_fixtures := v_fixtures || json_build_object(
          'id', 'sim_match_' || v_i,
          'home_team', TRIM(
            COALESCE(v_other_opponents[v_i * 2 - 1].first_name, '') || 
            CASE WHEN v_other_opponents[v_i * 2 - 1].nickname IS NOT NULL THEN ' ''' || v_other_opponents[v_i * 2 - 1].nickname || ''' ' ELSE ' ' END ||
            COALESCE(v_other_opponents[v_i * 2 - 1].last_name, '')
          ),
          'away_team', TRIM(
            COALESCE(v_other_opponents[v_i * 2].first_name, '') || 
            CASE WHEN v_other_opponents[v_i * 2].nickname IS NOT NULL THEN ' ''' || v_other_opponents[v_i * 2].nickname || ''' ' ELSE ' ' END ||
            COALESCE(v_other_opponents[v_i * 2].last_name, '')
          ),
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

GRANT EXECUTE ON FUNCTION rpc_get_week_fixtures_with_match_lock(UUID) TO authenticated;
