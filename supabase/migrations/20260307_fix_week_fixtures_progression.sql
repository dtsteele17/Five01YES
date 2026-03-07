-- ============================================================
-- FIX: Week fixtures page stuck on completed matchday
-- Problem: rpc_get_week_fixtures_with_match_lock includes 'completed' 
-- events in the query, so it always returns Matchday 1 even after 
-- it's done, instead of advancing to Matchday 2.
-- Fix: Prioritize pending/active events. Only show completed event
-- if it was JUST completed (has a match but user returned to page).
-- ============================================================

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
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- First: try to get a pending or active league event (next matchday)
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;

  -- If no pending/active event, get the most recently completed one
  -- (this handles the case where user returns to fixtures after finishing a match)
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

  -- Calculate best-of for this tier
  v_best_of := v_event.format_legs;
  v_legs_to_win := ceil(v_best_of / 2.0)::integer;

  -- Get/create player's match for this event
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.career_id = p_career_id AND cm.event_id = v_event.id;

  -- Get opponent details if match exists
  IF v_player_match.id IS NOT NULL THEN
    SELECT co.* INTO v_player_opponent
    FROM career_opponents co
    WHERE co.id = v_player_match.opponent_id;
  END IF;

  IF v_player_match.id IS NULL THEN
    -- Create player match if it doesn't exist (fixture generation)
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
    ORDER BY random()
    LIMIT 1;

    -- Fallback: any league opponent if all played
    IF v_player_opponent.id IS NULL THEN
      SELECT co.* INTO v_player_opponent FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_player_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    -- Create the player's match fixture
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
      'away_team', v_player_opponent.first_name || ' ' || v_player_opponent.last_name,
      'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won END,
      'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won END,
      'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
      'is_player_match', true,
      'event_id', v_event.id,
      'match_id', v_player_match.id
    )
  ];

  -- Generate other fixtures (simulated league matches)
  SELECT ARRAY(
    SELECT co FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id != v_player_opponent.id
    ORDER BY random()
    LIMIT 6
  ) INTO v_other_opponents;

  -- Create 3 simulated matches from the 6 opponents
  FOR v_i IN 1..3 LOOP
    IF v_i * 2 <= array_length(v_other_opponents, 1) THEN
      DECLARE
        v_home_wins BOOLEAN := random() < 0.5;
        v_winner_legs INTEGER := v_legs_to_win;
        v_loser_legs INTEGER := floor(random() * v_legs_to_win)::integer;
      BEGIN
        v_fixtures := v_fixtures || json_build_object(
          'id', 'sim_match_' || v_i,
          'home_team', v_other_opponents[v_i * 2 - 1].first_name || ' ' || v_other_opponents[v_i * 2 - 1].last_name,
          'away_team', v_other_opponents[v_i * 2].first_name || ' ' || v_other_opponents[v_i * 2].last_name,
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
