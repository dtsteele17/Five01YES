-- ============================================================
-- Fix Opponent Consistency Between Fixtures and Game  
-- Ensure shown opponent = played opponent ALWAYS
-- ============================================================

-- 1. Update fixtures RPC to create authoritative match records
CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_with_match_lock(
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
  v_opponent career_opponents;
  v_fixtures JSON[] := '{}';
  fixture_obj JSON;
  week_number INT;
  league_players TEXT[] := '{}';
  opponent_position INT;
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

  -- Handle tournaments differently (they have their own opponent logic)
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status IN ('active', 'pending')
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
    
    IF v_next_event.id IS NULL THEN
      RAISE EXCEPTION 'No active event found for career %', p_career_id;
    END IF;
  END IF;

  -- Get existing match for this event (this is the AUTHORITATIVE match)
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.event_id = v_next_event.id
    AND cm.result = 'pending'
  LIMIT 1;

  -- If no match exists, create one with deterministic opponent selection
  IF v_player_match.id IS NULL THEN
    IF v_next_event.event_type = 'league' THEN
      -- For league: Use deterministic opponent based on week
      week_number := v_next_event.sequence_no;
      
      -- Get all league players in consistent order
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

      -- Calculate opponent position using round-robin
      opponent_position := CASE 
        WHEN week_number = 1 THEN 2 
        ELSE ((week_number - 1) % (array_length(league_players, 1) - 1)) + 2 
      END;

      -- Get the actual opponent record
      SELECT co.* INTO v_opponent
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND (co.first_name || ' ' || co.last_name) = league_players[opponent_position];
    ELSE
      -- For tournaments: Get first available opponent
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.career_id = p_career_id AND co.tier = v_career.tier
      ORDER BY co.first_name, co.last_name
      LIMIT 1;
    END IF;

    -- Generate opponents if none found
    IF v_opponent.id IS NULL THEN
      PERFORM rpc_generate_career_opponents(
        p_career_id, 
        v_career.tier::SMALLINT, 
        10, 
        v_career.career_seed + v_career.season * 100
      );
      
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.career_id = p_career_id AND co.tier = v_career.tier
      ORDER BY co.first_name, co.last_name
      LIMIT 1;
    END IF;

    -- Create the AUTHORITATIVE match record
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_next_event.id, v_opponent.id, v_next_event.format_legs, 'pending'
    ) RETURNING * INTO v_player_match;
  ELSE
    -- Get the opponent for existing match
    SELECT co.* INTO v_opponent
    FROM career_opponents co
    WHERE co.id = v_player_match.opponent_id;
  END IF;

  -- Build the authoritative opponent name
  DECLARE
    v_opponent_name TEXT;
  BEGIN
    v_opponent_name := COALESCE(v_opponent.first_name || ' ', '') ||
                      CASE WHEN v_opponent.nickname IS NOT NULL 
                           THEN '''' || v_opponent.nickname || ''' ' 
                           ELSE '' END ||
                      COALESCE(v_opponent.last_name, '');
  END;

  -- Add player's match to fixtures (only show if pending)
  IF v_player_match.result = 'pending' THEN
    fixture_obj := json_build_object(
      'id', v_player_match.id::TEXT,
      'home_team', 'You',
      'away_team', v_opponent_name,
      'home_score', NULL,
      'away_score', NULL,
      'status', 'pending',
      'is_player_match', true,
      'event_id', v_next_event.id::TEXT,
      'match_id', v_player_match.id::TEXT,
      'opponent_id', v_opponent.id::TEXT,
      'opponent_name', v_opponent_name
    );
    v_fixtures := v_fixtures || fixture_obj;
  END IF;

  -- Return result with locked-in opponent
  RETURN json_build_object(
    'week', COALESCE(week_number, v_career.week),
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_next_event.event_name,
    'fixtures', array_to_json(v_fixtures),
    'locked_opponent', json_build_object(
      'id', v_opponent.id,
      'name', v_opponent_name,
      'match_id', v_player_match.id
    )
  );
END;
$$;

-- 2. Update play event RPC to NEVER change opponents
CREATE OR REPLACE FUNCTION rpc_career_play_next_event_locked(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_existing_match career_matches;
  v_opponent career_opponents;
  v_match_id UUID;
  v_best_of INT;
BEGIN
  -- Load + validate career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next active/pending event
  SELECT ce.* INTO v_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
  ORDER BY 
    CASE WHEN ce.status = 'active' THEN 1 ELSE 2 END,
    ce.sequence_no ASC
  LIMIT 1;

  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No events available');
  END IF;

  -- Get the EXISTING match - NEVER create a new one
  SELECT cm.* INTO v_existing_match
  FROM career_matches cm
  WHERE cm.event_id = v_event.id AND cm.result = 'pending'
  LIMIT 1;

  IF v_existing_match.id IS NULL THEN
    RETURN json_build_object('error', 'No match found - please visit fixtures page first to create match');
  END IF;

  -- Use the EXACT opponent from the existing match
  v_match_id := v_existing_match.id;
  
  SELECT co.* INTO v_opponent 
  FROM career_opponents co
  WHERE co.id = v_existing_match.opponent_id;
  
  v_best_of := v_existing_match.format_legs;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  RETURN json_build_object(
    'success', true,
    'match_id', v_match_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name,
      'type', v_event.event_type,
      'format_legs', v_best_of,
      'sequence_no', v_event.sequence_no,
      'tier', v_career.tier,
      'day', v_event.day
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', COALESCE(v_opponent.first_name || ' ', '') ||
              CASE WHEN v_opponent.nickname IS NOT NULL 
                   THEN '''' || v_opponent.nickname || ''' ' 
                   ELSE '' END ||
              COALESCE(v_opponent.last_name, ''),
      'skill_rating', v_opponent.skill_rating,
      'hometown', v_opponent.hometown
    ),
    'message', 'Ready to play!'
  );
END;
$$;

-- 3. Ensure career home also uses the locked opponent
CREATE OR REPLACE FUNCTION rpc_get_career_home_locked(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_next_event career_events;
  v_next_match career_matches;
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsor JSON;
  v_milestones JSON;
  v_awards JSON;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next event: prioritize active, then pending
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'active'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
  END IF;

  -- Get the EXISTING match (never create, only read)
  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.result = 'pending'
    LIMIT 1;
    
    IF v_next_match.id IS NOT NULL THEN
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.id = v_next_match.opponent_id;
    END IF;
  END IF;

  -- Get other data (unchanged)
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones 
    WHERE career_id = p_career_id
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
    ORDER BY created_at DESC 
    LIMIT 5
  ) m;

  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
  ) a;

  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT
        ls.is_player,
        CASE WHEN ls.is_player THEN 'You' ELSE (SELECT o.first_name || ' ' || o.last_name FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average
      FROM career_league_standings ls
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  RETURN json_build_object(
    'career', json_build_object(
      'id', v_career.id,
      'tier', v_career.tier,
      'season', v_career.season,
      'week', v_career.week,
      'day', v_career.day,
      'rep', v_career.rep,
      'form', v_career.form,
      'difficulty', v_career.difficulty,
      'premier_league_active', v_career.premier_league_active
    ),
    'next_event', CASE WHEN v_next_event.id IS NOT NULL THEN json_build_object(
      'id', v_next_event.id,
      'event_type', v_next_event.event_type,
      'event_name', v_next_event.event_name,
      'format_legs', v_next_event.format_legs,
      'bracket_size', v_next_event.bracket_size,
      'sequence_no', v_next_event.sequence_no,
      'day', v_next_event.day,
      'tier', v_career.tier,
      'match_id', v_next_match.id,
      'league_opponent_name', CASE WHEN v_opponent.id IS NOT NULL THEN
        COALESCE(v_opponent.first_name || ' ', '') ||
        CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
        COALESCE(v_opponent.last_name, '')
      ELSE NULL END,
      'league_opponent_id', v_opponent.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- 4. Update career home with season end logic to also use locked opponents
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_next_event career_events;
  v_next_match career_matches;
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsor JSON;
  v_milestones JSON;
  v_awards JSON;
  v_season_complete BOOLEAN := FALSE;
  v_player_position INT;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Check if season is complete (all league matches played)
  IF v_career.tier >= 2 THEN
    SELECT 
      CASE WHEN COUNT(*) = 0 THEN TRUE ELSE FALSE END INTO v_season_complete
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
      AND ce.event_type = 'league'
      AND ce.season = v_career.season;
  END IF;

  -- If season complete, return season end data
  IF v_season_complete THEN
    -- Get player's final position
    SELECT 
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC) INTO v_player_position
    FROM career_league_standings
    WHERE career_id = p_career_id 
      AND season = v_career.season 
      AND tier = v_career.tier
      AND is_player = TRUE;

    RETURN json_build_object(
      'season_complete', true,
      'career', json_build_object(
        'id', v_career.id,
        'tier', v_career.tier,
        'season', v_career.season,
        'week', v_career.week,
        'final_position', v_player_position
      )
    );
  END IF;

  -- Get next event: prioritize active, then pending (same as locked version)
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'active'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
  END IF;

  -- Get the EXISTING match (never create, only read) - LOCKED LOGIC
  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.result = 'pending'
    LIMIT 1;
    
    IF v_next_match.id IS NOT NULL THEN
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.id = v_next_match.opponent_id;
    END IF;
  END IF;

  -- Get all other data (same as original)
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones 
    WHERE career_id = p_career_id
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
    ORDER BY created_at DESC 
    LIMIT 5
  ) m;

  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
  ) a;

  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT
        ls.is_player,
        CASE WHEN ls.is_player THEN 'You' ELSE (SELECT o.first_name || ' ' || o.last_name FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average
      FROM career_league_standings ls
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  RETURN json_build_object(
    'season_complete', false,
    'career', json_build_object(
      'id', v_career.id,
      'tier', v_career.tier,
      'season', v_career.season,
      'week', v_career.week,
      'day', v_career.day,
      'rep', v_career.rep,
      'form', v_career.form,
      'difficulty', v_career.difficulty,
      'premier_league_active', v_career.premier_league_active
    ),
    'next_event', CASE WHEN v_next_event.id IS NOT NULL THEN json_build_object(
      'id', v_next_event.id,
      'event_type', v_next_event.event_type,
      'event_name', v_next_event.event_name,
      'format_legs', v_next_event.format_legs,
      'bracket_size', v_next_event.bracket_size,
      'sequence_no', v_next_event.sequence_no,
      'day', v_next_event.day,
      'tier', v_career.tier,
      'match_id', v_next_match.id,
      'league_opponent_name', CASE WHEN v_opponent.id IS NOT NULL THEN
        COALESCE(v_opponent.first_name || ' ', '') ||
        CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
        COALESCE(v_opponent.last_name, '')
      ELSE NULL END,
      'league_opponent_id', v_opponent.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- Log this critical fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed opponent consistency: locked opponent selection prevents mismatches everywhere';
END $$;