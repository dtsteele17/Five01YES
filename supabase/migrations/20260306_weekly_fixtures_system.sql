-- ============================================================
-- Weekly Fixtures System for Pub Leagues
-- Creates fixtures page flow: Career → Fixtures → Game → Fixtures → Career
-- ============================================================

-- 1. Create RPC to get current week fixtures and simulate other matches
CREATE OR REPLACE FUNCTION rpc_get_week_fixtures(
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
  v_player_match career_matches;
  v_fixtures JSON[];
  v_opponent career_opponents;
  fixture_record RECORD;
  result JSON;
BEGIN
  -- Load and validate career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RAISE EXCEPTION 'Career not found';
  END IF;

  -- Get the current league event (should be active or pending)
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.event_type = 'league'
    AND ce.status IN ('active', 'pending')
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  IF v_next_event.id IS NULL THEN
    RAISE EXCEPTION 'No active league event found';
  END IF;

  -- Get the player's match for this event  
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.event_id = v_next_event.id
  LIMIT 1;

  -- Get player's opponent name
  IF v_player_match.opponent_id IS NOT NULL THEN
    SELECT co.* INTO v_opponent
    FROM career_opponents co
    WHERE co.id = v_player_match.opponent_id;
  END IF;

  -- Build fixtures array
  v_fixtures := ARRAY[]::JSON[];

  -- Add player's match
  v_fixtures := v_fixtures || json_build_object(
    'id', v_player_match.id::TEXT,
    'home_team', 'You',
    'away_team', COALESCE(v_opponent.first_name || ' ', '') ||
                 CASE WHEN v_opponent.nickname IS NOT NULL 
                      THEN '''' || v_opponent.nickname || ''' ' 
                      ELSE '' END ||
                 COALESCE(v_opponent.last_name, ''),
    'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won ELSE NULL END,
    'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won ELSE NULL END,
    'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
    'is_player_match', true,
    'event_id', v_next_event.id::TEXT,
    'match_id', v_player_match.id::TEXT
  );

  -- Generate simulated fixtures for other league players
  -- Get all other opponents in this tier/season
  FOR fixture_record IN
    SELECT 
      co1.first_name || ' ' || co1.last_name as home_name,
      co2.first_name || ' ' || co2.last_name as away_name,
      co1.skill_rating as home_skill,
      co2.skill_rating as away_skill
    FROM career_league_standings ls1
    JOIN career_opponents co1 ON co1.id = ls1.opponent_id
    JOIN career_league_standings ls2 ON ls2.career_id = ls1.career_id 
      AND ls2.season = ls1.season 
      AND ls2.tier = ls1.tier
      AND ls2.opponent_id != ls1.opponent_id
    JOIN career_opponents co2 ON co2.id = ls2.opponent_id
    WHERE ls1.career_id = p_career_id 
      AND ls1.season = v_career.season 
      AND ls1.tier = v_career.tier
      AND ls1.is_player = FALSE
      AND ls2.is_player = FALSE
    ORDER BY co1.first_name, co2.first_name
    LIMIT 3 -- Generate 3 other matches for the week
  LOOP
    -- Simulate match result based on skill ratings
    DECLARE
      home_wins BOOLEAN;
      home_score INT;
      away_score INT;
      format_legs INT := v_next_event.format_legs;
      legs_to_win INT := (format_legs + 1) / 2;
    BEGIN
      -- Determine winner based on skill difference (with some randomness)
      home_wins := (fixture_record.home_skill + (random() - 0.5) * 20) > 
                   (fixture_record.away_skill + (random() - 0.5) * 20);
      
      IF home_wins THEN
        home_score := legs_to_win;
        away_score := floor(random() * legs_to_win)::INT;
      ELSE
        away_score := legs_to_win;
        home_score := floor(random() * legs_to_win)::INT;
      END IF;

      -- Add simulated fixture
      v_fixtures := v_fixtures || json_build_object(
        'id', gen_random_uuid()::TEXT,
        'home_team', fixture_record.home_name,
        'away_team', fixture_record.away_name,
        'home_score', home_score,
        'away_score', away_score,
        'status', 'completed',
        'is_player_match', false
      );
    END;
  END LOOP;

  -- Build final result
  result := json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_next_event.event_name,
    'fixtures', json_build_array(v_fixtures)
  );

  RETURN result;
END;
$$;

-- 2. Update career home RPC to not include match details (fixtures page handles this)
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_fixtures_flow(
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

  -- Get recent milestones (exclude wrong-tier ones)
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones 
    WHERE career_id = p_career_id
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
    ORDER BY created_at DESC 
    LIMIT 5
  ) m;

  -- Get awards (exclude wrong-tier tournaments)
  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
  ) a;

  -- Get active sponsor
  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  -- Get league standings if tier >= 2
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
      'use_fixtures_flow', v_career.tier >= 2 AND v_next_event.event_type = 'league'
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- Log this addition
DO $$
BEGIN
  RAISE NOTICE 'Added weekly fixtures system: Career → Fixtures → Game → Fixtures → Career flow for Tier 2+ league matches';
END $$;