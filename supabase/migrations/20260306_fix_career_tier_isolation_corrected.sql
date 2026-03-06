-- ============================================================
-- Fix Career Tier Isolation - Corrected Version
-- Fixes Local Circuit Cup appearing in Pub Leagues (without week column)
-- ============================================================

-- 1. CLEAN UP MIXED TIER EVENTS FOR EXISTING CAREERS
-- Remove any events that don't match the career's current tier
DELETE FROM career_events 
WHERE id IN (
  SELECT ce.id 
  FROM career_events ce
  JOIN career_profiles cp ON cp.id = ce.career_id
  LEFT JOIN career_schedule_templates cst ON cst.id = ce.template_id
  WHERE cst.tier IS NOT NULL AND cp.tier != cst.tier
);

-- 2. SPECIFIC FIX: Remove Local Circuit Cup events for Tier 2+ players
DELETE FROM career_events 
WHERE event_name = 'Local Circuit Cup' 
AND career_id IN (
  SELECT id FROM career_profiles WHERE tier >= 2
);

-- 3. UPDATE RPC: Ensure event progression respects tier boundaries
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
  v_opponent career_opponents;
  v_match_id UUID;
  v_bot_avg INT;
  v_best_of INT;
  v_difficulty_mult REAL;
BEGIN
  -- Load + validate career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next pending event (ONLY from correct tier)
  SELECT ce.* INTO v_event 
  FROM career_events ce
  LEFT JOIN career_schedule_templates cst ON cst.id = ce.template_id
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'pending'
    AND (cst.tier = v_career.tier OR cst.tier IS NULL)  -- ENSURE TIER MATCH or allow templateless
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  -- If no properly tiered event found, create next event from template
  IF v_event.id IS NULL THEN
    -- Get next template for current tier
    WITH next_template AS (
      SELECT * FROM career_schedule_templates
      WHERE tier = v_career.tier
        AND sequence_no > COALESCE((
          SELECT MAX(sequence_no) 
          FROM career_events ce2
          LEFT JOIN career_schedule_templates cst2 ON cst2.id = ce2.template_id
          WHERE ce2.career_id = p_career_id 
            AND (cst2.tier = v_career.tier OR cst2.tier IS NULL)
        ), 0)
      ORDER BY sequence_no ASC
      LIMIT 1
    )
    INSERT INTO career_events (
      career_id, template_id, season, sequence_no, event_type, 
      event_name, format_legs, bracket_size, status, day
    )
    SELECT 
      p_career_id, nt.id, v_career.season, nt.sequence_no, nt.event_type,
      nt.event_name, nt.format_legs, nt.bracket_size, 'pending',
      CASE WHEN nt.day_based THEN (nt.metadata->>'day')::INT ELSE NULL END
    FROM next_template nt
    RETURNING * INTO v_event;
  END IF;

  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No more events available for this tier');
  END IF;

  -- For league events: Use EXACT SAME logic as rpc_get_career_home
  IF v_event.event_type = 'league' THEN
    -- Find opponents not yet played in current season, ordered by name for consistency
    WITH unplayed_opponents AS (
      SELECT ls.opponent_id, co.first_name, co.last_name, co.nickname
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND ls.opponent_id NOT IN (
          SELECT DISTINCT cm.opponent_id 
          FROM career_matches cm
          JOIN career_events ce ON ce.id = cm.event_id
          WHERE cm.career_id = p_career_id 
            AND ce.event_type = 'league' 
            AND ce.season = v_career.season
            AND cm.result IS NOT NULL
        )
    )
    SELECT co.* INTO v_opponent 
    FROM unplayed_opponents uo
    JOIN career_opponents co ON co.id = uo.opponent_id
    ORDER BY co.first_name, co.last_name  -- DETERMINISTIC ordering, not random!
    LIMIT 1;
    
    -- Fallback: any opponent if all played, also deterministic
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent 
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY co.first_name, co.last_name
      LIMIT 1;
    END IF;
  ELSE
    -- Non-league: random opponent from the same tier
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  -- Generate opponents if none found (same tier only)
  IF v_opponent.id IS NULL THEN
    PERFORM rpc_generate_career_opponents(
      p_career_id, 
      v_career.tier::SMALLINT, 
      10, 
      v_career.career_seed + v_career.season * 100
    );
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  -- Calculate difficulty-adjusted bot average
  v_difficulty_mult := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.7
    WHEN 'amateur' THEN 0.8
    WHEN 'semi_pro' THEN 0.9
    WHEN 'pro' THEN 1.0
    WHEN 'world_class' THEN 1.1
    WHEN 'nightmare' THEN 1.2
    ELSE 1.0
  END;

  v_bot_avg := ROUND((v_opponent.skill_rating * v_difficulty_mult)::NUMERIC, 0);
  v_best_of := v_event.format_legs;

  -- Create match
  INSERT INTO career_matches (
    career_id, event_id, opponent_id, bot_avg_target, best_of, status
  ) VALUES (
    p_career_id, v_event.id, v_opponent.id, v_bot_avg, v_best_of, 'pending'
  ) RETURNING id INTO v_match_id;

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
    'bot_avg_target', v_bot_avg,
    'message', 'Ready to play!'
  );
END;
$$;

-- 4. UPDATE HOME RPC: Add tier validation
CREATE OR REPLACE FUNCTION rpc_get_career_home_tier_safe(
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

  -- Get next event: prioritize active, then pending (ONLY from correct tier)
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  LEFT JOIN career_schedule_templates cst ON cst.id = ce.template_id
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'active'
    AND (cst.tier = v_career.tier OR cst.tier IS NULL) -- Allow events without template
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    LEFT JOIN career_schedule_templates cst ON cst.id = ce.template_id
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
      AND (cst.tier = v_career.tier OR cst.tier IS NULL) -- Allow events without template
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
  END IF;

  -- For league events: find DETERMINISTIC next opponent (not random!)
  IF v_next_event.id IS NOT NULL AND v_next_event.event_type = 'league' THEN
    -- Find opponents not yet played in current season, ordered by name for consistency
    WITH unplayed_opponents AS (
      SELECT ls.opponent_id, co.first_name, co.last_name, co.nickname
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND ls.opponent_id NOT IN (
          SELECT DISTINCT cm.opponent_id 
          FROM career_matches cm
          JOIN career_events ce ON ce.id = cm.event_id
          WHERE cm.career_id = p_career_id 
            AND ce.event_type = 'league' 
            AND ce.season = v_career.season
            AND cm.result IS NOT NULL
        )
    )
    SELECT co.* INTO v_opponent 
    FROM unplayed_opponents uo
    JOIN career_opponents co ON co.id = uo.opponent_id
    ORDER BY co.first_name, co.last_name  -- DETERMINISTIC ordering, not random!
    LIMIT 1;
    
    -- Fallback: any opponent if all played, also deterministic
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent 
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY co.first_name, co.last_name
      LIMIT 1;
    END IF;
  END IF;

  -- Get recent milestones
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones WHERE career_id = p_career_id
    ORDER BY created_at DESC LIMIT 5
  ) m;

  -- Get all tournament/league wins for awards tile
  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
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

-- 5. ENSURE PROPER EVENT CREATION FOR EXISTING CAREERS
-- Update any careers that might be stuck to have proper tier events
DO $$
DECLARE
  career_record RECORD;
  next_sequence INTEGER;
  template_record RECORD;
BEGIN
  FOR career_record IN 
    SELECT id, tier, season, week, day
    FROM career_profiles 
    WHERE status = 'active'
  LOOP
    -- Check if career has any pending events for their current tier
    IF NOT EXISTS (
      SELECT 1 FROM career_events ce
      LEFT JOIN career_schedule_templates cst ON cst.id = ce.template_id
      WHERE ce.career_id = career_record.id 
        AND ce.status = 'pending'
        AND (cst.tier = career_record.tier OR cst.tier IS NULL)
    ) THEN
      -- Find next sequence number for this career
      SELECT COALESCE(MAX(sequence_no), 0) + 1 INTO next_sequence
      FROM career_events
      WHERE career_id = career_record.id;
      
      -- Get first available template for current tier
      SELECT * INTO template_record
      FROM career_schedule_templates
      WHERE tier = career_record.tier
      ORDER BY sequence_no ASC
      LIMIT 1;
      
      -- Create first event if template exists
      IF template_record.id IS NOT NULL THEN
        INSERT INTO career_events (
          career_id, template_id, season, sequence_no, event_type,
          event_name, format_legs, bracket_size, status, day
        ) VALUES (
          career_record.id, template_record.id, career_record.season, 
          template_record.sequence_no, template_record.event_type,
          template_record.event_name, template_record.format_legs, 
          template_record.bracket_size, 'pending',
          CASE WHEN template_record.day_based THEN (template_record.metadata->>'day')::INT ELSE NULL END
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed career tier isolation (corrected): Removed wrong-tier events, ensured proper tier boundaries without week column';
END $$;