-- FIFA-STYLE FIXTURES RPC FUNCTION
-- This creates the missing rpc_fifa_get_week_fixtures function

CREATE OR REPLACE FUNCTION rpc_fifa_get_week_fixtures(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_player_match career_matches;
  v_player_opponent career_opponents;
  v_fixtures JSON[] := '{}';
  v_other_opponents career_opponents[];
  v_i INTEGER;
  v_match_count INTEGER;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get current week's league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active', 'completed')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event found');
  END IF;

  -- Get/create player's match for this event
  SELECT * INTO v_player_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  -- If no player match exists, create one
  IF v_player_match.id IS NULL THEN
    -- Pick opponent from league standings who hasn't been played recently
    SELECT co.* INTO v_player_opponent 
    FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
    ORDER BY random() 
    LIMIT 1;

    IF v_player_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    -- Create the player's match
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, 
      format_legs, result, source, match_type
    ) VALUES (
      p_career_id, v_event.id, v_player_opponent.id, 
      CASE WHEN v_career.tier = 3 THEN 5 ELSE 3 END,
      'pending', 'career', 'career'
    ) RETURNING * INTO v_player_match;
  ELSE
    -- Get existing opponent
    SELECT co.* INTO v_player_opponent 
    FROM career_opponents co 
    WHERE co.id = v_player_match.opponent_id;
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

  -- Generate other fixtures based on tier
  -- Tier 2: 8 players = 4 matches per week (user + 3 other matches)
  -- Tier 3: 12 players = 6 matches per week (user + 5 other matches)
  v_match_count := CASE WHEN v_career.tier = 2 THEN 3 ELSE 5 END;

  -- Get available opponents (excluding player's opponent)
  SELECT ARRAY(
    SELECT co FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id != v_player_opponent.id
    ORDER BY random()
    LIMIT (v_match_count * 2)
  ) INTO v_other_opponents;

  -- Create other matches (pairs of opponents)
  FOR v_i IN 1..v_match_count LOOP
    IF (v_i * 2) <= array_length(v_other_opponents, 1) THEN
      v_fixtures := v_fixtures || json_build_object(
        'id', 'sim_match_' || v_i,
        'home_team', v_other_opponents[v_i * 2 - 1].first_name || ' ' || v_other_opponents[v_i * 2 - 1].last_name,
        'away_team', v_other_opponents[v_i * 2].first_name || ' ' || v_other_opponents[v_i * 2].last_name,
        'home_score', CASE 
          WHEN v_player_match.result != 'pending' THEN 
            -- Simulate result based on tier format
            CASE WHEN v_career.tier = 3 THEN 
              (random() * 2)::integer + 3  -- 3-5 legs for best-of-5
            ELSE 
              (random() * 1)::integer + 2  -- 2-3 legs for best-of-3
            END
          ELSE NULL 
        END,
        'away_score', CASE 
          WHEN v_player_match.result != 'pending' THEN 
            -- Losing score
            CASE WHEN v_career.tier = 3 THEN 
              (random() * 2)::integer + 1  -- 1-2 legs
            ELSE 
              (random() * 1)::integer + 1  -- 1-2 legs
            END
          ELSE NULL 
        END,
        'status', CASE WHEN v_player_match.result != 'pending' THEN 'completed' ELSE 'pending' END,
        'is_player_match', false
      );
    END IF;
  END LOOP;

  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_event.event_name,
    'fixtures', array_to_json(v_fixtures),
    'fifa_style', true
  );
END;
$$;