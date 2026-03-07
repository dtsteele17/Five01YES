-- ============================================================
-- FIX: Stale Tier 1 events appearing for Tier 2+ careers
-- Problem: After promotion, old Tier 1 events remain as 'pending'/'active'
-- and get picked up by the next_event query before current tier events.
-- ============================================================

-- 1. Mark all Tier 1 events as 'skipped' for any career that has progressed past Tier 1
UPDATE career_events ce
SET status = 'skipped'
FROM career_profiles cp
WHERE ce.career_id = cp.id
  AND cp.tier >= 2
  AND ce.status IN ('pending', 'active')
  AND ce.event_type = 'trial_tournament';

-- 2. Also skip any events from previous seasons that are still pending
UPDATE career_events ce
SET status = 'skipped'
FROM career_profiles cp
WHERE ce.career_id = cp.id
  AND ce.season < cp.season
  AND ce.status IN ('pending', 'active');

-- 3. Fix the career home function to filter next_event by current tier's events
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked_fixed_v3(
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
  v_opponent_name TEXT;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- For Tier 2+ careers, ensure proper structure first
  IF v_career.tier >= 2 THEN
    PERFORM rpc_fix_tier2_career_structure(p_career_id);
  END IF;

  -- Auto-skip any stale events from previous tiers/seasons
  UPDATE career_events 
  SET status = 'skipped'
  WHERE career_id = p_career_id 
    AND status IN ('pending', 'active')
    AND (
      -- Tier 1 trial events when career is Tier 2+
      (event_type = 'trial_tournament' AND v_career.tier >= 2)
      -- Events from previous seasons
      OR (season < v_career.season)
    );

  -- Check if season is complete
  IF v_career.tier >= 2 THEN
    SELECT 
      CASE WHEN COUNT(*) = 0 THEN TRUE ELSE FALSE END INTO v_season_complete
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
      AND ce.season = v_career.season;
  END IF;

  -- If season complete, return season end data
  IF v_season_complete THEN
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

  -- Get next event — ONLY from current season
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
    AND ce.season = v_career.season
  ORDER BY 
    CASE WHEN ce.status = 'active' THEN 1 ELSE 2 END,
    ce.sequence_no ASC
  LIMIT 1;

  -- Get match and opponent for next event
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
      
      IF v_opponent.id IS NOT NULL THEN
        v_opponent_name := TRIM(
          COALESCE(v_opponent.first_name, '') || 
          CASE 
            WHEN v_opponent.nickname IS NOT NULL 
            THEN ' ''' || v_opponent.nickname || ''' ' 
            ELSE ' ' 
          END ||
          COALESCE(v_opponent.last_name, '')
        );
      END IF;
    END IF;
  END IF;

  -- Get other data
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
        (ls.legs_for - legs_against) AS legs_diff,
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
      'league_opponent_name', v_opponent_name,
      'league_opponent_id', v_opponent.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- Also fix the play_next_event function to filter by current season
CREATE OR REPLACE FUNCTION rpc_career_play_next_event_locked_fixed(
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

  -- Get next event — ONLY from current season
  SELECT ce.* INTO v_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
    AND ce.season = v_career.season
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
