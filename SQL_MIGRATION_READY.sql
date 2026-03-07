-- ============================================================
-- Tier 2 Career Weekly Flow + Mid-season Tournament System
-- READY FOR SUPABASE DEPLOYMENT
-- Copy this entire file and paste into Supabase SQL Editor
-- ============================================================

-- Function: Play Weekend Event (idempotent)
-- Returns existing active room if one exists, creates new one if needed
CREATE OR REPLACE FUNCTION rpc_play_weekend_event(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_existing_room TEXT;
  v_match_id UUID;
  v_opponent career_opponents;
  v_result JSON;
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
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event available');
  END IF;

  -- Check for existing active match room
  SELECT match_room_id INTO v_existing_room
  FROM career_matches 
  WHERE career_id = p_career_id 
    AND event_id = v_event.id
    AND result = 'pending';

  -- Return existing room if found
  IF v_existing_room IS NOT NULL THEN
    SELECT co.* INTO v_opponent FROM career_matches cm
    JOIN career_opponents co ON co.id = cm.opponent_id
    WHERE cm.career_id = p_career_id AND cm.event_id = v_event.id;
    
    RETURN json_build_object(
      'success', true,
      'match_room_id', v_existing_room,
      'event', json_build_object(
        'id', v_event.id,
        'name', v_event.event_name,
        'format_legs', v_event.format_legs
      ),
      'opponent', json_build_object(
        'id', v_opponent.id,
        'name', v_opponent.first_name || ' ' || v_opponent.last_name
      ),
      'existing', true
    );
  END IF;

  -- Create new match
  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  -- Pick opponent for league match
  SELECT co.* INTO v_opponent FROM career_league_standings ls
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
  IF v_opponent.id IS NULL THEN
    SELECT co.* INTO v_opponent FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF v_opponent.id IS NULL THEN
    RETURN json_build_object('error', 'No opponents available');
  END IF;

  -- Create match room ID (simulate room creation)
  v_existing_room := 'career_' || p_career_id || '_' || extract(epoch from now())::bigint;

  -- Create career match record
  INSERT INTO career_matches (
    career_id, event_id, opponent_id, format_legs, 
    result, match_room_id
  ) VALUES (
    p_career_id, v_event.id, v_opponent.id, v_event.format_legs,
    'pending', v_existing_room
  ) RETURNING id INTO v_match_id;

  RETURN json_build_object(
    'success', true,
    'match_room_id', v_existing_room,
    'match_id', v_match_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name,
      'format_legs', v_event.format_legs
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', v_opponent.first_name || ' ' || v_opponent.last_name
    ),
    'existing', false
  );
END;
$$;

-- Function: Complete Career Match (transactional)
CREATE OR REPLACE FUNCTION rpc_complete_career_match(
  p_match_id UUID,
  p_player_legs_won INTEGER,
  p_opponent_legs_won INTEGER,
  p_player_average REAL DEFAULT NULL,
  p_opponent_average REAL DEFAULT NULL,
  p_player_checkout_pct REAL DEFAULT NULL,
  p_player_180s INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match career_matches;
  v_event career_events;
  v_career career_profiles;
  v_result TEXT;
  v_rep_gained INTEGER := 0;
  v_next_action TEXT := 'career_home';
  v_next_route TEXT;
  v_completed_matches INTEGER;
  v_should_trigger_tournament BOOLEAN := false;
BEGIN
  -- Get match details
  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RETURN json_build_object('error', 'Match not found');
  END IF;

  -- Get event and career
  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;
  SELECT * INTO v_career FROM career_profiles WHERE id = v_match.career_id;

  -- Determine result
  v_result := CASE WHEN p_player_legs_won > p_opponent_legs_won THEN 'win' ELSE 'loss' END;

  -- Update match with results
  UPDATE career_matches SET
    result = v_result,
    player_legs_won = p_player_legs_won,
    opponent_legs_won = p_opponent_legs_won,
    player_average = p_player_average,
    opponent_average = p_opponent_average,
    player_checkout_pct = p_player_checkout_pct,
    player_180s = p_player_180s
  WHERE id = p_match_id;

  -- Complete the event
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now(),
    result = json_build_object('outcome', v_result, 'legs_won', p_player_legs_won, 'legs_lost', p_opponent_legs_won)
  WHERE id = v_match.event_id;

  -- Update league standings for Tier 2+
  IF v_career.tier >= 2 AND v_event.event_type = 'league' THEN
    IF v_result = 'win' THEN
      -- Player wins: +3 points, +1 W
      UPDATE career_league_standings SET 
        wins = wins + 1, 
        points = points + 3,
        updated_at = now()
      WHERE career_id = v_match.career_id 
        AND season = v_career.season 
        AND is_player = TRUE;
      
      -- Opponent loses: +0 points, +1 L  
      UPDATE career_league_standings SET 
        losses = losses + 1,
        updated_at = now()
      WHERE career_id = v_match.career_id 
        AND season = v_career.season 
        AND opponent_id = v_match.opponent_id;

      v_rep_gained := 15;
    ELSE
      -- Player loses: +0 points, +1 L
      UPDATE career_league_standings SET 
        losses = losses + 1,
        updated_at = now()
      WHERE career_id = v_match.career_id 
        AND season = v_career.season 
        AND is_player = TRUE;
      
      -- Opponent wins: +3 points, +1 W
      UPDATE career_league_standings SET 
        wins = wins + 1, 
        points = points + 3,
        updated_at = now()
      WHERE career_id = v_match.career_id 
        AND season = v_career.season 
        AND opponent_id = v_match.opponent_id;

      v_rep_gained := 5;
    END IF;
  END IF;

  -- Award REP
  IF v_rep_gained > 0 THEN
    UPDATE career_profiles SET 
      rep = rep + v_rep_gained,
      updated_at = now()
    WHERE id = v_match.career_id;
  END IF;

  -- Check for mid-season tournament trigger (after 4th league match)
  SELECT COUNT(*) INTO v_completed_matches
  FROM career_events ce
  JOIN career_matches cm ON cm.event_id = ce.id
  WHERE ce.career_id = v_match.career_id 
    AND ce.season = v_career.season
    AND ce.event_type = 'league'
    AND cm.result IN ('win', 'loss');

  -- Trigger mid-season tournament choice after 4th league match
  IF v_completed_matches = 4 AND v_career.tier >= 2 THEN
    -- Check if tournament choice event already exists
    IF NOT EXISTS(
      SELECT 1 FROM career_events 
      WHERE career_id = v_match.career_id 
        AND season = v_career.season
        AND event_type = 'tournament_choice'
    ) THEN
      -- Create tournament choice event
      INSERT INTO career_events (
        career_id, season, sequence_no, event_type, event_name,
        format_legs, status, day, metadata
      ) VALUES (
        v_match.career_id, v_career.season, 100, 'tournament_choice',
        'Mid-Season Tournament Choice',
        v_event.format_legs, 'pending',
        v_career.day + 7,
        json_build_object(
          'description', 'Choose between two 16-player tournaments',
          'tournaments', json_build_array(
            json_build_object('name', 'County Championship', 'size', 16, 'description', 'Established county-level competition'),
            json_build_object('name', 'Regional Masters', 'size', 16, 'description', 'Prestigious regional tournament')
          ),
          'can_decline', false
        )
      );
      v_should_trigger_tournament := true;
    END IF;
  END IF;

  -- Determine next action
  IF v_should_trigger_tournament THEN
    v_next_action := 'tournament_choice';
    v_next_route := '/app/career/tournament-choice';
  ELSE
    v_next_action := 'fixtures_page';
    v_next_route := '/app/career/fixtures';
  END IF;

  RETURN json_build_object(
    'success', true,
    'result', v_result,
    'rep_gained', v_rep_gained,
    'next_action', v_next_action,
    'next_route', v_next_route,
    'tournament_triggered', v_should_trigger_tournament,
    'completed_matches', v_completed_matches
  );
END;
$$;

-- Function: Get Week Fixtures with Match Context
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
    -- Pick opponent from league standings who hasn't been played this season
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
  -- Get 6 other opponents from league standings to create 3 more matches (8 total players = 4 matches per week)
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

  -- Create 3 simulated matches from the 6 opponents (2 per match)
  FOR v_i IN 1..3 LOOP
    IF v_i * 2 <= array_length(v_other_opponents, 1) THEN
      v_fixtures := v_fixtures || json_build_object(
        'id', 'sim_match_' || v_i,
        'home_team', v_other_opponents[v_i * 2 - 1].first_name || ' ' || v_other_opponents[v_i * 2 - 1].last_name,
        'away_team', v_other_opponents[v_i * 2].first_name || ' ' || v_other_opponents[v_i * 2].last_name,
        'home_score', CASE WHEN v_player_match.result != 'pending' THEN (random() * 3)::integer + 1 ELSE NULL END,
        'away_score', CASE WHEN v_player_match.result != 'pending' THEN (random() * 3)::integer + 1 ELSE NULL END,
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
    'fixtures', v_fixtures
  );
END;
$$;

-- Add tournament choice processing function
CREATE OR REPLACE FUNCTION rpc_career_tournament_choice(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_choice INTEGER  -- 0 = first tournament, 1 = second tournament, -1 = decline
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_tournament_name TEXT;
BEGIN
  -- Get career and event
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  
  IF v_career.id IS NULL OR v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Career or event not found');
  END IF;

  -- Complete the tournament choice event
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now(),
    result = json_build_object('choice', p_tournament_choice)
  WHERE id = p_event_id;

  IF p_tournament_choice >= 0 THEN
    -- Player chose a tournament - create tournament event
    v_tournament_name := CASE 
      WHEN p_tournament_choice = 0 THEN 'County Championship'
      ELSE 'Regional Masters'
    END;

    INSERT INTO career_events (
      career_id, season, sequence_no, event_type, event_name,
      format_legs, bracket_size, status, day
    ) VALUES (
      p_career_id, v_career.season, 101, 'open', v_tournament_name,
      v_event.format_legs, 16, 'pending',
      v_career.day + 3
    );

    RETURN json_build_object(
      'success', true,
      'tournament_name', v_tournament_name,
      'action', 'tournament'
    );
  ELSE
    -- Player declined - continue with league
    RETURN json_build_object(
      'success', true,
      'declined', true,
      'action', 'continue_league'
    );
  END IF;
END;
$$;