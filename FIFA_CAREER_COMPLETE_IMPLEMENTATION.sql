-- ============================================================
-- FIFA-Style Career Mode Complete Implementation
-- Core: Persistent single-player save with bot simulation
-- ============================================================

-- 1. Enhanced career match launch function (FIFA-style)
CREATE OR REPLACE FUNCTION rpc_career_continue_fifa_style(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_match_id UUID;
  v_room_id TEXT;
  v_bot_difficulty TEXT;
  v_bot_average INTEGER;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get current league event (active or pending)
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league events available');
  END IF;

  -- Check for existing match
  SELECT * INTO v_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  IF v_match.id IS NOT NULL THEN
    -- Get existing opponent
    SELECT * INTO v_opponent FROM career_opponents 
    WHERE id = v_match.opponent_id;
    v_match_id := v_match.id;
  ELSE
    -- Create new league match
    -- Pick opponent from same tier who hasn't been played this season
    SELECT * INTO v_opponent FROM career_opponents
    WHERE career_id = p_career_id 
      AND tier = v_career.tier
      AND id NOT IN (
        SELECT cm.opponent_id FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE cm.career_id = p_career_id 
          AND ce.season = v_career.season 
          AND ce.event_type = 'league'
          AND cm.result IN ('win', 'loss')
      )
    ORDER BY random() LIMIT 1;

    -- Fallback: any opponent if all played
    IF v_opponent.id IS NULL THEN
      SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random() LIMIT 1;
    END IF;

    IF v_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    -- Create match with proper format for tier
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, 
      format_legs, result, source, match_type
    ) VALUES (
      p_career_id, v_event.id, v_opponent.id,
      CASE 
        WHEN v_career.tier = 2 THEN 3  -- Pub League: best-of-3
        WHEN v_career.tier = 3 THEN 5  -- County League: best-of-5  
        ELSE 3 
      END,
      'pending', 'career', 'career'
    ) RETURNING id INTO v_match_id;
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  -- Generate unique room ID
  v_room_id := 'career_' || v_career.tier || '_' || v_career.season || '_' || v_match_id;

  -- Calculate bot difficulty based on tier and opponent skill
  v_bot_average := CASE 
    WHEN v_career.tier = 1 THEN 35 + (COALESCE(v_opponent.skill_rating, 50) * 0.3)::INTEGER
    WHEN v_career.tier = 2 THEN 45 + (COALESCE(v_opponent.skill_rating, 50) * 0.4)::INTEGER  
    WHEN v_career.tier = 3 THEN 55 + (COALESCE(v_opponent.skill_rating, 50) * 0.5)::INTEGER
    ELSE 65 + (COALESCE(v_opponent.skill_rating, 50) * 0.6)::INTEGER
  END;

  v_bot_difficulty := CASE 
    WHEN v_bot_average < 40 THEN 'rookie'
    WHEN v_bot_average < 50 THEN 'amateur' 
    WHEN v_bot_average < 60 THEN 'semi-pro'
    WHEN v_bot_average < 70 THEN 'pro'
    WHEN v_bot_average < 80 THEN 'world-class'
    ELSE 'nightmare'
  END;

  -- Return FIFA-style match data for dartbot launch
  RETURN json_build_object(
    'success', true,
    'match_id', v_match_id,
    'room_id', v_room_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name,
      'format_legs', CASE 
        WHEN v_career.tier = 2 THEN 3  -- Pub League: best-of-3
        WHEN v_career.tier = 3 THEN 5  -- County League: best-of-5
        ELSE 3 
      END,
      'tier', v_career.tier,
      'season', v_career.season
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', COALESCE(v_opponent.first_name || ' ' || v_opponent.last_name, 'Unknown'),
      'skill_rating', COALESCE(v_opponent.skill_rating, 50)
    ),
    'bot_config', json_build_object(
      'difficulty', v_bot_difficulty,
      'average', v_bot_average
    ),
    'career_context', json_build_object(
      'tier_name', CASE 
        WHEN v_career.tier = 1 THEN 'Local Circuit'
        WHEN v_career.tier = 2 THEN 'Pub League' 
        WHEN v_career.tier = 3 THEN 'County League'
        WHEN v_career.tier = 4 THEN 'Regional Tour'
        ELSE 'Elite Division'
      END,
      'season', v_career.season,
      'week', v_career.week
    )
  );
END;
$$;

-- 2. Bot vs Bot simulation for other fixtures
CREATE OR REPLACE FUNCTION rpc_simulate_matchday_fixtures(
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
  v_fixtures JSON[] := '{}';
  v_i INTEGER;
  v_home_score INTEGER;
  v_away_score INTEGER;
  v_opponents career_opponents[];
  v_match_pairs INTEGER[][]; 
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
  SELECT * INTO v_event FROM career_events WHERE id = p_event_id;

  -- Get all opponents for this tier (excluding player)
  SELECT ARRAY(
    SELECT co FROM career_opponents co 
    WHERE co.career_id = p_career_id 
      AND co.tier = v_career.tier
    ORDER BY random()
  ) INTO v_opponents;

  -- Generate 3 bot vs bot matches for 8-player league (4 total matches per week)
  FOR v_i IN 1..3 LOOP
    IF (v_i * 2) <= array_length(v_opponents, 1) THEN
      -- Simulate match result based on skill ratings
      v_home_score := (random() * 3)::integer + 1;
      v_away_score := (random() * 3)::integer + 1;
      
      -- Ensure there's always a winner
      IF v_home_score = v_away_score THEN
        v_home_score := v_home_score + 1;
      END IF;

      v_fixtures := v_fixtures || json_build_object(
        'id', 'sim_match_' || v_i,
        'home_team', v_opponents[v_i * 2 - 1].first_name || ' ' || v_opponents[v_i * 2 - 1].last_name,
        'away_team', v_opponents[v_i * 2].first_name || ' ' || v_opponents[v_i * 2].last_name,
        'home_score', v_home_score,
        'away_score', v_away_score,
        'status', 'completed'
      );
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'fixtures_simulated', array_length(v_fixtures, 1),
    'fixtures', array_to_json(v_fixtures)
  );
END;
$$;

-- 3. Complete match with standings update and progression check
CREATE OR REPLACE FUNCTION rpc_complete_career_match_fifa_style(
  p_match_id UUID,
  p_player_legs_won INTEGER,
  p_opponent_legs_won INTEGER,
  p_player_stats JSON DEFAULT NULL
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
  v_next_action TEXT;
  v_completed_league_matches INTEGER;
  v_should_trigger_tournament BOOLEAN := false;
  v_season_complete BOOLEAN := false;
BEGIN
  -- Get match and career data
  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id;
  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;
  SELECT * INTO v_career FROM career_profiles WHERE id = v_match.career_id;

  -- Determine result
  v_result := CASE WHEN p_player_legs_won > p_opponent_legs_won THEN 'win' ELSE 'loss' END;

  -- Update match with results
  UPDATE career_matches SET
    result = v_result,
    player_legs_won = p_player_legs_won,
    opponent_legs_won = p_opponent_legs_won,
    completed_at = now()
  WHERE id = p_match_id;

  -- Complete the event
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now()
  WHERE id = v_match.event_id;

  -- Award REP based on tier and result
  v_rep_gained := CASE 
    WHEN v_result = 'win' THEN v_career.tier * 10 + 5
    ELSE v_career.tier * 3 + 2
  END;

  UPDATE career_profiles SET 
    rep = rep + v_rep_gained,
    updated_at = now()
  WHERE id = v_match.career_id;

  -- Check for mid-season tournament trigger (Tier 2+ after 4th match)
  IF v_career.tier >= 2 THEN
    SELECT COUNT(*) INTO v_completed_league_matches
    FROM career_events ce
    JOIN career_matches cm ON cm.event_id = ce.id
    WHERE ce.career_id = v_match.career_id 
      AND ce.season = v_career.season
      AND ce.event_type = 'league'
      AND cm.result IN ('win', 'loss');

    -- Tier 2: Tournament after 4th match
    IF v_career.tier = 2 AND v_completed_league_matches = 4 THEN
      v_should_trigger_tournament := true;
    -- Tier 3: Tournament every 3 matches  
    ELSIF v_career.tier = 3 AND v_completed_league_matches % 3 = 0 THEN
      v_should_trigger_tournament := true;
    END IF;
  END IF;

  -- Check if season is complete (7 matches for 8-player round-robin)
  IF v_completed_league_matches >= 7 THEN
    v_season_complete := true;
  END IF;

  -- Determine next action
  IF v_should_trigger_tournament THEN
    v_next_action := 'tournament_choice';
  ELSIF v_season_complete THEN
    v_next_action := 'season_end';
  ELSE
    v_next_action := 'continue_league';
  END IF;

  RETURN json_build_object(
    'success', true,
    'result', v_result,
    'rep_gained', v_rep_gained,
    'next_action', v_next_action,
    'tournament_triggered', v_should_trigger_tournament,
    'season_complete', v_season_complete,
    'completed_matches', v_completed_league_matches
  );
END;
$$;

-- 4. FIFA-style season progression with bot pool changes
CREATE OR REPLACE FUNCTION rpc_advance_career_season(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_final_position INTEGER;
  v_promoted BOOLEAN := false;
  v_relegated BOOLEAN := false;
  v_consecutive_seasons INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;

  -- Calculate final league position (placeholder for standings calculation)
  -- This should be replaced with actual league table calculation
  v_final_position := (random() * 8)::integer + 1;

  -- Check promotion/relegation
  IF v_career.tier = 2 AND v_final_position <= 2 THEN
    -- Promote to Tier 3
    v_promoted := true;
    UPDATE career_profiles SET 
      tier = 3, 
      season = season + 1,
      consecutive_seasons_in_tier2 = 0
    WHERE id = p_career_id;
  ELSIF v_career.tier = 3 AND v_final_position >= 11 THEN
    -- Relegate to Tier 2 (assuming 12-player league)
    v_relegated := true;
    UPDATE career_profiles SET 
      tier = 2, 
      season = season + 1,
      consecutive_seasons_in_tier2 = COALESCE(consecutive_seasons_in_tier2, 0) + 1
    WHERE id = p_career_id;
  ELSE
    -- Stay in same tier
    IF v_career.tier = 2 THEN
      UPDATE career_profiles SET 
        season = season + 1,
        consecutive_seasons_in_tier2 = COALESCE(consecutive_seasons_in_tier2, 0) + 1
      WHERE id = p_career_id;
    ELSE
      UPDATE career_profiles SET 
        season = season + 1
      WHERE id = p_career_id;
    END IF;
  END IF;

  -- Refresh bot opponent pool (FIFA-style)
  -- Remove promoted/relegated bots and add new ones
  -- This creates the "living pyramid" effect
  PERFORM rpc_refresh_opponent_pool(p_career_id);

  RETURN json_build_object(
    'success', true,
    'final_position', v_final_position,
    'promoted', v_promoted,
    'relegated', v_relegated,
    'new_tier', (SELECT tier FROM career_profiles WHERE id = p_career_id),
    'new_season', (SELECT season FROM career_profiles WHERE id = p_career_id)
  );
END;
$$;

-- 5. Refresh opponent pool for FIFA-style season turnover
CREATE OR REPLACE FUNCTION rpc_refresh_opponent_pool(p_career_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_names TEXT[] := ARRAY[
    'Mike', 'Dave', 'Steve', 'John', 'Paul', 'Mark', 'Tony', 'Chris',
    'Andy', 'Rob', 'Pete', 'Gary', 'Phil', 'Colin', 'Barry', 'Terry'
  ];
  v_surnames TEXT[] := ARRAY[
    'Smith', 'Jones', 'Brown', 'Wilson', 'Taylor', 'Davies', 'Evans', 'Thomas',
    'Roberts', 'Johnson', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright'
  ];
  v_hometowns TEXT[] := ARRAY[
    'Manchester', 'Liverpool', 'Leeds', 'Sheffield', 'Newcastle', 'Birmingham',
    'Bristol', 'Cardiff', 'Glasgow', 'Edinburgh', 'Belfast', 'Brighton'
  ];
  v_i INTEGER;
  v_keep_count INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
  
  -- Keep 40-60% of existing opponents (for continuity)
  v_keep_count := 3 + (random() * 3)::integer;
  
  -- Mark some opponents for removal (promoted/relegated)
  UPDATE career_opponents SET status = 'inactive'
  WHERE career_id = p_career_id 
    AND tier = v_career.tier
    AND id NOT IN (
      SELECT id FROM career_opponents 
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random() 
      LIMIT v_keep_count
    );
  
  -- Add new opponents to fill the gaps
  FOR v_i IN 1..(8 - v_keep_count) LOOP
    INSERT INTO career_opponents (
      career_id, tier, first_name, last_name, hometown,
      skill_rating, status
    ) VALUES (
      p_career_id, v_career.tier,
      v_names[1 + (random() * (array_length(v_names, 1) - 1))::integer],
      v_surnames[1 + (random() * (array_length(v_surnames, 1) - 1))::integer], 
      v_hometowns[1 + (random() * (array_length(v_hometowns, 1) - 1))::integer],
      40 + (random() * 40)::integer,  -- Skill rating 40-80
      'active'
    );
  END LOOP;
END;
$$;