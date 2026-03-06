-- ============================================================
-- Ensure Opponent Consistency Between Career Home and Fixtures
-- ============================================================

-- Update career home RPC to use the SAME opponent from existing matches
CREATE OR REPLACE FUNCTION rpc_get_career_home(
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

  -- For ALL events (not just league), get the ACTUAL match and opponent
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

-- Update play_next_event to use EXISTING matches only (no new creation)
CREATE OR REPLACE FUNCTION rpc_career_play_next_event(
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

  -- Check if match already exists for this event
  SELECT cm.* INTO v_existing_match
  FROM career_matches cm
  WHERE cm.event_id = v_event.id AND cm.result = 'pending'
  LIMIT 1;

  IF v_existing_match.id IS NOT NULL THEN
    -- Use existing match - ensures opponent consistency
    v_match_id := v_existing_match.id;
    
    SELECT co.* INTO v_opponent 
    FROM career_opponents co
    WHERE co.id = v_existing_match.opponent_id;
    
    v_best_of := v_existing_match.format_legs;
  ELSE
    -- No existing match found - this should not happen if fixtures system is working
    RETURN json_build_object('error', 'No match found for event - please visit fixtures page first');
  END IF;

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

-- Log this consistency fix
DO $$
BEGIN
  RAISE NOTICE 'Ensured opponent consistency: Career home and fixtures now show same opponent';
END $$;