-- Fix: Don't show "Season Complete" when there are pending end-of-season tournaments
-- Include pending_invite and tournament_choice events in next_event query

CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked_fixed_v3(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_next_event career_events;
  v_next_match career_matches;
  v_next_opponent career_opponents;
  v_standings JSON;
  v_recent_milestones JSON;
  v_awards JSON;
  v_sponsor JSON;
  v_player_position INT;
  v_pending_invite JSON := NULL;
BEGIN
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Auto-skip ALL trial tournaments if player is Tier 2+ (regardless of season)
  IF v_career.tier >= 2 THEN
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id 
      AND status IN ('pending', 'active')
      AND event_type = 'trial_tournament';
  END IF;

  -- Get league table position
  SELECT ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC)
  INTO v_player_position
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE;

  -- Get next event — only active/pending events (NOT pending_invite — those stay in emails)
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
    AND ce.season = v_career.season
  ORDER BY 
    CASE WHEN ce.status = 'active' THEN 0 ELSE 1 END,
    CASE WHEN ce.event_type IN ('open', 'qualifier', 'major', 'season_finals', 'tournament_choice') THEN 0 ELSE 1 END,
    ce.sequence_no ASC
  LIMIT 1;
  
  -- If no active/pending events, check for pending_invite (end-of-season tournament)
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending_invite'
      AND ce.season = v_career.season
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
  END IF;

  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.career_id = p_career_id
    LIMIT 1;
    
    IF v_next_match.opponent_id IS NOT NULL THEN
      SELECT * INTO v_next_opponent FROM career_opponents WHERE id = v_next_match.opponent_id;
    END IF;
  END IF;

  -- Standings
  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT 
        ls.opponent_id, 
        CASE WHEN ls.is_player THEN 'You' 
          ELSE COALESCE(co.first_name || ' ' || co.last_name, 'Unknown') END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average, ls.is_player
      FROM career_league_standings ls
      LEFT JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  -- Recent milestones
  SELECT json_agg(row_to_json(m)) INTO v_recent_milestones
  FROM (
    SELECT milestone_type, title, description, day, season, tier, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
    ORDER BY created_at DESC LIMIT 10
  ) m;

  -- Awards (tournament wins etc.)
  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT title, description, milestone_type, day, created_at
    FROM career_milestones
    WHERE career_id = p_career_id 
      AND milestone_type IN ('tournament_win', 'first_tournament_win', 'league_champion', 'league_runner_up', 'promotion')
    ORDER BY created_at DESC LIMIT 10
  ) a;

  -- Sponsors
  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.id as contract_id, c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  -- Check for pending tournament invites (for end-of-season popup)
  SELECT json_build_object(
    'event_id', ce.id,
    'event_name', ce.event_name,
    'bracket_size', ce.bracket_size
  ) INTO v_pending_invite
  FROM career_events ce
  WHERE ce.career_id = p_career_id
    AND ce.season = v_career.season
    AND ce.status = 'pending_invite'
    AND ce.event_type = 'open'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  RETURN json_build_object(
    'season_complete', false,
    'career', json_build_object(
      'id', v_career.id, 'tier', v_career.tier, 'season', v_career.season,
      'week', v_career.week, 'day', v_career.day, 'rep', v_career.rep,
      'player_position', v_player_position
    ),
    'next_event', CASE WHEN v_next_event.id IS NOT NULL THEN json_build_object(
      'id', v_next_event.id,
      'event_type', v_next_event.event_type,
      'event_name', v_next_event.event_name,
      'format_legs', v_next_event.format_legs,
      'bracket_size', v_next_event.bracket_size,
      'status', v_next_event.status,
      'day', v_next_event.day,
      'league_opponent_name', CASE WHEN v_next_opponent.id IS NOT NULL 
        THEN v_next_opponent.first_name || COALESCE(' ''' || v_next_opponent.nickname || ''' ', ' ') || v_next_opponent.last_name 
        ELSE NULL END,
      'match_id', v_next_match.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_recent_milestones,
    'awards', v_awards,
    'pending_invite', v_pending_invite
  );
END;
$$;
