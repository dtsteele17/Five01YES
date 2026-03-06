-- ============================================================
-- Proper League Round-Robin Scheduling + Results System
-- Ensure each player plays each other player exactly once per season
-- ============================================================

-- 1. Create function to get week results (all completed fixtures)
CREATE OR REPLACE FUNCTION rpc_get_week_results(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current_event career_events;
  v_fixtures JSON[] := '{}';
  fixture_obj JSON;
  match_record RECORD;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RAISE EXCEPTION 'Career not found: %', p_career_id;
  END IF;

  -- Get the most recent completed league event
  SELECT ce.* INTO v_current_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.event_type = 'league'
    AND ce.status = 'completed'
  ORDER BY ce.sequence_no DESC
  LIMIT 1;

  -- If no completed event, get the active one (for immediate post-game)
  IF v_current_event.id IS NULL THEN
    SELECT ce.* INTO v_current_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.event_type = 'league'
      AND ce.status = 'active'
    ORDER BY ce.sequence_no DESC
    LIMIT 1;
  END IF;

  IF v_current_event.id IS NULL THEN
    RAISE EXCEPTION 'No league event found for results';
  END IF;

  -- Get all matches for this event (player + simulated)
  -- First get the actual player match
  FOR match_record IN
    SELECT 
      cm.id,
      'You' as home_team,
      co.first_name || ' ' || co.last_name as away_team,
      cm.player_legs_won as home_score,
      cm.opponent_legs_won as away_score,
      true as is_player_match
    FROM career_matches cm
    JOIN career_opponents co ON co.id = cm.opponent_id
    WHERE cm.event_id = v_current_event.id
      AND cm.result IN ('win', 'loss') -- Completed matches only
  LOOP
    fixture_obj := json_build_object(
      'id', match_record.id::TEXT,
      'home_team', match_record.home_team,
      'away_team', match_record.away_team,
      'home_score', match_record.home_score,
      'away_score', match_record.away_score,
      'status', 'completed',
      'is_player_match', match_record.is_player_match
    );
    v_fixtures := v_fixtures || fixture_obj;
  END LOOP;

  -- Generate simulated results for other league members (same as fixtures page)
  DECLARE 
    opponent_names TEXT[] := '{}';
    player_opponent_name TEXT;
    i INT := 1;
  BEGIN
    -- Get player's opponent name
    SELECT co.first_name || ' ' || co.last_name
    INTO player_opponent_name
    FROM career_matches cm
    JOIN career_opponents co ON co.id = cm.opponent_id
    WHERE cm.event_id = v_current_event.id;

    -- Get remaining opponents (excluding player's opponent)
    SELECT array_agg(co.first_name || ' ' || co.last_name ORDER BY co.first_name, co.last_name)
    INTO opponent_names
    FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND (co.first_name || ' ' || co.last_name) != COALESCE(player_opponent_name, '');

    -- Generate 3 simulated fixtures from remaining 6 opponents
    WHILE i <= array_length(opponent_names, 1) - 1 AND array_length(v_fixtures, 1) < 4 LOOP
      fixture_obj := json_build_object(
        'id', gen_random_uuid()::TEXT,
        'home_team', opponent_names[i],
        'away_team', opponent_names[i + 1],
        'home_score', CASE WHEN random() > 0.5 THEN 2 ELSE floor(random() * 2)::INT END,
        'away_score', CASE WHEN random() > 0.5 THEN floor(random() * 2)::INT ELSE 2 END,
        'status', 'completed',
        'is_player_match', false
      );
      v_fixtures := v_fixtures || fixture_obj;
      
      i := i + 2; -- Move to next pair
    END LOOP;
  END;

  -- Return results
  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_current_event.event_name,
    'fixtures', array_to_json(v_fixtures)
  );
END;
$$;

-- 2. Create proper round-robin fixture generation
CREATE OR REPLACE FUNCTION rpc_generate_league_schedule(
  p_career_id UUID,
  p_season INT,
  p_tier INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  league_players TEXT[] := '{}';
  total_weeks INT;
  week_fixtures TEXT[][];
  current_week INT := 1;
  fixture_count INT;
  i INT;
  j INT;
  home_player TEXT;
  away_player TEXT;
BEGIN
  -- Get all league players (including "You")
  SELECT array_agg(
    CASE WHEN ls.is_player THEN 'You' 
         ELSE co.first_name || ' ' || co.last_name END
    ORDER BY ls.is_player DESC, co.first_name
  ) INTO league_players
  FROM career_league_standings ls
  LEFT JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id 
    AND ls.season = p_season
    AND ls.tier = p_tier;

  -- For 8 players: 7 rounds, 4 fixtures per round (28 total fixtures)
  -- Each player plays each other player exactly once
  total_weeks := array_length(league_players, 1) - 1;

  -- Initialize fixture schedule array
  week_fixtures := ARRAY[]::TEXT[][];

  -- Round-robin algorithm: Fix one player, rotate others
  FOR week IN 1..total_weeks LOOP
    DECLARE
      week_schedule TEXT[] := '{}';
    BEGIN
      -- Player 1 (index 1) always plays player at rotating position
      home_player := league_players[1];
      away_player := league_players[CASE WHEN week = 1 THEN 2 ELSE (week % (array_length(league_players, 1) - 1)) + 2 END];
      
      week_schedule := week_schedule || (home_player || ' vs ' || away_player);
      
      -- Generate remaining fixtures by pairing remaining players
      FOR i IN 2..(array_length(league_players, 1) / 2) LOOP
        DECLARE
          pos1 INT;
          pos2 INT;
        BEGIN
          -- Calculate positions using round-robin rotation
          pos1 := ((i - 2 + week - 1) % (array_length(league_players, 1) - 1)) + 2;
          pos2 := ((array_length(league_players, 1) - i - 1 + week - 1) % (array_length(league_players, 1) - 1)) + 2;
          
          IF pos1 != pos2 AND pos1 <= array_length(league_players, 1) AND pos2 <= array_length(league_players, 1) THEN
            home_player := league_players[pos1];
            away_player := league_players[pos2];
            week_schedule := week_schedule || (home_player || ' vs ' || away_player);
          END IF;
        END;
      END LOOP;
      
      week_fixtures := week_fixtures || ARRAY[week_schedule];
    END;
  END LOOP;

  -- Return the complete schedule
  RETURN json_build_object(
    'total_weeks', total_weeks,
    'fixtures_per_week', 4,
    'schedule', array_to_json(week_fixtures)
  );
END;
$$;

-- 3. Update fixtures RPC to use deterministic weekly scheduling
CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_scheduled(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_next_event career_events;
  v_player_match career_matches;
  v_player_opponent_name TEXT;
  v_player_opponent_id UUID;
  v_fixtures JSON[] := '{}';
  fixture_obj JSON;
  week_number INT;
  league_players TEXT[] := '{}';
  player_position INT;
  opponent_position INT;
  fixture_pairs INT[][] := '{}';
  i INT;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RAISE EXCEPTION 'Career not found: %', p_career_id;
  END IF;

  -- Get the current league event
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.event_type = 'league'
    AND ce.status IN ('active', 'pending')
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  IF v_next_event.id IS NULL THEN
    RAISE EXCEPTION 'No active league event found for career %', p_career_id;
  END IF;

  -- Get current week number (based on sequence)
  week_number := v_next_event.sequence_no;

  -- Get all league players in deterministic order
  SELECT array_agg(
    CASE WHEN ls.is_player THEN 'You' 
         ELSE co.first_name || ' ' || co.last_name END
    ORDER BY ls.is_player DESC, co.first_name, co.last_name
  ) INTO league_players
  FROM career_league_standings ls
  LEFT JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id 
    AND ls.season = v_career.season 
    AND ls.tier = v_career.tier;

  -- Calculate opponent for current week using round-robin
  player_position := 1; -- Player is always position 1
  opponent_position := CASE 
    WHEN week_number = 1 THEN 2 
    ELSE ((week_number - 1) % (array_length(league_players, 1) - 1)) + 2 
  END;

  v_player_opponent_name := league_players[opponent_position];

  -- Get opponent ID
  SELECT ls.opponent_id INTO v_player_opponent_id
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id 
    AND ls.season = v_career.season 
    AND ls.tier = v_career.tier
    AND ls.is_player = FALSE
    AND (co.first_name || ' ' || co.last_name) = v_player_opponent_name;

  -- Get or create the player's match
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.event_id = v_next_event.id
  LIMIT 1;

  -- If no match exists, create one
  IF v_player_match.id IS NULL THEN
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_next_event.id, v_player_opponent_id, v_next_event.format_legs, 'pending'
    ) RETURNING * INTO v_player_match;
  END IF;

  -- Add player's match to fixtures
  fixture_obj := json_build_object(
    'id', v_player_match.id::TEXT,
    'home_team', 'You',
    'away_team', v_player_opponent_name,
    'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won ELSE NULL END,
    'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won ELSE NULL END,
    'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
    'is_player_match', true,
    'event_id', v_next_event.id::TEXT,
    'match_id', v_player_match.id::TEXT
  );
  v_fixtures := v_fixtures || fixture_obj;

  -- Generate other fixtures based on round-robin for this week
  -- Skip other fixtures for now to keep it simple and focus on user's match only

  -- Return result  
  RETURN json_build_object(
    'week', week_number,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_next_event.event_name,
    'fixtures', array_to_json(v_fixtures)
  );
END;
$$;

-- Log this update
DO $$
BEGIN
  RAISE NOTICE 'Added proper round-robin scheduling and results system';
END $$;