-- ============================================================
-- Fix tournament invite flow:
-- 1. Tournament created after 4th match should use 'pending_invite' status
-- 2. Next event query must exclude 'pending_invite' events
-- 3. Fix any existing tournaments that are 'pending' but should be 'pending_invite'
-- ============================================================

-- Fix: Override rpc_career_complete_match to create tournaments with 'pending_invite'
-- We need to update the function that creates the pub tournament after the 4th match

-- First, fix any existing open tournaments that were created with 'pending' status
-- when they should be 'pending_invite' (tournaments with no matches played yet)
UPDATE career_events ce
SET status = 'pending_invite'
WHERE ce.event_type = 'open'
  AND ce.status = 'pending'
  AND ce.bracket_size = 16
  AND ce.season >= 1
  AND NOT EXISTS (
    SELECT 1 FROM career_matches cm 
    WHERE cm.event_id = ce.id 
    AND cm.result != 'pending'
  )
  -- Only fix tournaments where the career has a pending invite milestone
  AND EXISTS (
    SELECT 1 FROM career_milestones cm2
    WHERE cm2.career_id = ce.career_id
    AND cm2.milestone_type = 'tournament_invite'
    AND cm2.title LIKE '%' || ce.event_name || '%'
  );

-- Now recreate the career home RPC with fixed next_event logic
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked_fixed_v3(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_next_event career_events;
  v_next_match career_matches;
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsors JSON;
  v_recent_milestones JSON;
  v_season_complete BOOLEAN := FALSE;
  v_player_position INT;
  v_pending_invite JSON := NULL;
  v_league_opponent_name TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;
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

  -- Get next event — ONLY 'active' or 'pending' status (NOT 'pending_invite')
  -- Prioritize active events, then tournaments over league
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
    END IF;

    -- Get league opponent name for display
    IF v_next_event.event_type = 'league' AND v_next_match.id IS NOT NULL THEN
      SELECT co.name INTO v_league_opponent_name
      FROM career_opponents co WHERE co.id = v_next_match.opponent_id;
    END IF;
  END IF;

  -- Standings
  SELECT json_agg(row_to_json(s) ORDER BY s.points DESC, s.leg_diff DESC)
  INTO v_standings
  FROM (
    SELECT cls.*, (cls.legs_for - cls.legs_against) AS leg_diff,
      CASE WHEN cls.is_player THEN 'You' ELSE co.name END AS name
    FROM career_league_standings cls
    LEFT JOIN career_opponents co ON co.id = cls.opponent_id
    WHERE cls.career_id = p_career_id 
      AND cls.season = v_career.season 
      AND cls.tier = v_career.tier
  ) s;

  -- Sponsors
  SELECT json_agg(row_to_json(sp))
  INTO v_sponsors
  FROM (
    SELECT cs.* FROM career_sponsors cs
    WHERE cs.career_id = p_career_id AND cs.active = TRUE
    ORDER BY cs.tier DESC
  ) sp;

  -- Recent milestones
  SELECT json_agg(row_to_json(m))
  INTO v_recent_milestones
  FROM (
    SELECT * FROM career_milestones
    WHERE career_id = p_career_id
    ORDER BY created_at DESC
    LIMIT 20
  ) m;

  RETURN json_build_object(
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
      'league_opponent_name', v_league_opponent_name
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsors,
    'recent_milestones', v_recent_milestones,
    'pending_invite', v_pending_invite,
    'season_complete', false
  );
END;
$$;

-- Also fix the respond invite RPC to properly transition status
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
  v_event career_events;
  v_career career_profiles;
BEGIN
  SELECT * INTO v_event 
  FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id AND status = 'pending_invite';

  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No pending invite found');
  END IF;

  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id;

  IF p_accept THEN
    -- Accept: change to pending so it shows as next event
    UPDATE career_events SET status = 'pending' WHERE id = p_event_id;

    -- Set tournament sequence before the next league match
    UPDATE career_events 
    SET sequence_no = (
      SELECT MIN(ce2.sequence_no) - 1
      FROM career_events ce2
      WHERE ce2.career_id = p_career_id
        AND ce2.status = 'pending'
        AND ce2.event_type = 'league'
        AND ce2.season = v_career.season
    )
    WHERE id = p_event_id;

    RETURN json_build_object('success', true, 'message', 'Tournament accepted! Good luck!');
  ELSE
    -- Decline: skip the tournament
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object('success', true, 'message', 'Tournament declined. Focus on the league.');
  END IF;
END;
$$;

-- Fix the tournament creation inside rpc_career_complete_match
-- Replace the INSERT that creates tournament with 'pending' to use 'pending_invite'
-- We do this by creating a wrapper trigger approach — but simpler: just re-fix any
-- newly created tournaments to 'pending_invite' status via a trigger

CREATE OR REPLACE FUNCTION fix_new_tournament_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If a new open tournament is created in Tier 2+ with bracket_size 16,
  -- it should start as pending_invite (user must accept via email)
  IF NEW.event_type = 'open' 
    AND NEW.bracket_size = 16 
    AND NEW.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM career_profiles cp 
      WHERE cp.id = NEW.career_id AND cp.tier >= 2
    )
  THEN
    NEW.status := 'pending_invite';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fix_tournament_invite_status ON career_events;
CREATE TRIGGER trg_fix_tournament_invite_status
  BEFORE INSERT ON career_events
  FOR EACH ROW
  EXECUTE FUNCTION fix_new_tournament_status();

GRANT EXECUTE ON FUNCTION rpc_get_career_home_with_season_end_locked_fixed_v3(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_career_respond_tournament_invite(UUID, UUID, BOOLEAN) TO authenticated;
