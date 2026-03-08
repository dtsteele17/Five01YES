-- ============================================================
-- FIX: Tournament flow after accepting invite
--
-- 1. When accepting tournament, set sequence_no to sort BEFORE
--    remaining league matchdays (use 4.5 effectively)
-- 2. Career home next_event query: prioritize open/tournament 
--    events over league events when both are pending
-- 3. Handle pending_invite blocking: return invite info so 
--    frontend can force accept/decline
-- ============================================================

-- Fix accept function to set proper sequence_no
CREATE OR REPLACE FUNCTION rpc_career_respond_tournament_invite(
  p_career_id UUID,
  p_event_id UUID,
  p_accept BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_next_league_seq INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_event FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id AND status = 'pending_invite';
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Tournament invite not found');
  END IF;

  IF p_accept THEN
    -- Find the next pending league event's sequence_no
    -- Set tournament sequence to be just before it
    SELECT MIN(sequence_no) INTO v_next_league_seq
    FROM career_events
    WHERE career_id = p_career_id 
      AND season = v_career.season
      AND event_type = 'league'
      AND status = 'pending';

    -- Set tournament to sort just before next league match
    UPDATE career_events SET 
      status = 'pending',
      sequence_no = COALESCE(v_next_league_seq, 5) - 1
    WHERE id = p_event_id;

    RETURN json_build_object(
      'success', true,
      'accepted', true,
      'event_id', p_event_id,
      'event_name', v_event.event_name,
      'message', 'Tournament accepted! Good luck in ' || v_event.event_name || '!'
    );
  ELSE
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object(
      'success', true,
      'accepted', false,
      'message', 'Tournament declined. Back to league action.'
    );
  END IF;
END;
$$;

-- Update career home to return pending_invite info
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
  v_pending_invite JSON := NULL;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  IF v_career.tier >= 2 THEN
    PERFORM rpc_fix_tier2_career_structure(p_career_id);
  END IF;

  -- Auto-skip stale events
  UPDATE career_events 
  SET status = 'skipped'
  WHERE career_id = p_career_id 
    AND status IN ('pending', 'active')
    AND (
      (event_type = 'trial_tournament' AND v_career.tier >= 2)
      OR (season < v_career.season)
    );

  -- Check for pending tournament invite
  SELECT json_build_object(
    'event_id', ce.id,
    'event_name', ce.event_name,
    'bracket_size', ce.bracket_size
  ) INTO v_pending_invite
  FROM career_events ce
  WHERE ce.career_id = p_career_id
    AND ce.season = v_career.season
    AND ce.status = 'pending_invite'
  LIMIT 1;

  -- Check season complete
  IF v_career.tier >= 2 THEN
    SELECT 
      CASE WHEN COUNT(*) = 0 THEN TRUE ELSE FALSE END INTO v_season_complete
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
      AND ce.season = v_career.season;
  END IF;

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
        'id', v_career.id, 'tier', v_career.tier, 'season', v_career.season,
        'week', v_career.week, 'final_position', v_player_position
      ),
      'pending_invite', v_pending_invite
    );
  END IF;

  -- Get next event — prioritize tournament/open over league
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
    AND ce.season = v_career.season
  ORDER BY 
    CASE WHEN ce.status = 'active' THEN 0 ELSE 1 END,
    CASE WHEN ce.event_type IN ('open', 'qualifier', 'major', 'season_finals') THEN 0 ELSE 1 END,
    ce.sequence_no ASC
  LIMIT 1;

  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.result = 'pending'
    LIMIT 1;
    
    IF v_next_match.id IS NOT NULL THEN
      SELECT co.* INTO v_opponent
      FROM career_opponents co WHERE co.id = v_next_match.opponent_id;
      
      IF v_opponent.id IS NOT NULL THEN
        v_opponent_name := TRIM(
          COALESCE(v_opponent.first_name, '') || 
          CASE WHEN v_opponent.nickname IS NOT NULL THEN ' ''' || v_opponent.nickname || ''' ' ELSE ' ' END ||
          COALESCE(v_opponent.last_name, '')
        );
      END IF;
    END IF;
  END IF;

  -- Standings
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

  -- Milestones
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones 
    WHERE career_id = p_career_id
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
    ORDER BY created_at DESC LIMIT 5
  ) m;

  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
  ) a;

  -- Sponsors
  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  RETURN json_build_object(
    'season_complete', false,
    'career', json_build_object(
      'id', v_career.id, 'tier', v_career.tier, 'season', v_career.season,
      'week', v_career.week, 'day', v_career.day, 'rep', v_career.rep,
      'form', v_career.form, 'difficulty', v_career.difficulty,
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
    'awards', v_awards,
    'pending_invite', v_pending_invite
  );
END;
$$;
