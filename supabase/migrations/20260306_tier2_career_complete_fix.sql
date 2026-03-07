-- ============================================================
-- COMPLETE TIER 2 CAREER FIX
-- Fix all Tier 2+ career issues: Continue button, opponent display, league structure
-- ============================================================

-- 1. Function to completely reset and fix a Tier 2 career structure
CREATE OR REPLACE FUNCTION rpc_fix_tier2_career_structure(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current_sequence INT;
  v_league_event career_events;
  v_tournament_event career_events;
  v_season_events INT;
  v_league_matches_played INT;
  v_result JSON;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  IF v_career.tier < 2 THEN
    RETURN json_build_object('error', 'Career is not Tier 2+');
  END IF;
  
  -- Ensure league standings exist (8 players total)
  PERFORM rpc_ensure_tier2_league_setup(p_career_id);
  
  -- Count current events for this season
  SELECT COUNT(*) INTO v_season_events
  FROM career_events 
  WHERE career_id = p_career_id AND season = v_career.season;
  
  -- Get current sequence number
  SELECT COALESCE(MAX(sequence_no), 0) INTO v_current_sequence
  FROM career_events 
  WHERE career_id = p_career_id;
  
  -- Count completed league matches this season
  SELECT COUNT(*) INTO v_league_matches_played
  FROM career_events ce
  JOIN career_matches cm ON cm.event_id = ce.id
  WHERE ce.career_id = p_career_id 
    AND ce.season = v_career.season
    AND ce.event_type = 'league'
    AND cm.result IN ('win', 'loss');
  
  RAISE NOTICE 'Career % - Season %, Sequence %, League matches played: %', 
    p_career_id, v_career.season, v_current_sequence, v_league_matches_played;
  
  -- Tier 2 structure: 4 league → tournament → 3 more league
  -- If we need to create league events
  IF v_season_events = 0 OR (
    v_league_matches_played >= 4 AND 
    NOT EXISTS(SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'tournament')
  ) THEN
    
    -- Create complete season structure
    DELETE FROM career_events WHERE career_id = p_career_id AND season = v_career.season AND status = 'pending';
    
    -- Create 7 league events (week-based for Tier 2)
    FOR i IN 1..7 LOOP
      INSERT INTO career_events (
        career_id, event_type, event_name, format_legs, season, sequence_no, status, day
      ) VALUES (
        p_career_id,
        'league',
        'Weekend League Night — Matchday ' || i,
        CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END,
        v_career.season,
        v_current_sequence + i,
        CASE WHEN i = 1 THEN 'pending' ELSE 'pending' END,
        v_career.day + (i - 1) * 7  -- Weekly schedule
      );
    END LOOP;
    
    -- Insert tournament after 4th league match
    INSERT INTO career_events (
      career_id, event_type, event_name, format_legs, bracket_size, season, sequence_no, status, day
    ) VALUES (
      p_career_id,
      'open',
      'County Championship',
      CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END,
      16,
      v_career.season,
      v_current_sequence + 8, -- After 7 league events
      'pending',
      v_career.day + 28 -- 4 weeks later
    );
    
    UPDATE career_profiles 
    SET week = 1
    WHERE id = p_career_id;
    
    RAISE NOTICE 'Created complete season structure for career %', p_career_id;
  END IF;
  
  -- Ensure the first pending event has a match created
  SELECT ce.* INTO v_league_event
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'pending'
    AND ce.event_type = 'league'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_league_event.id IS NOT NULL THEN
    -- Ensure match exists for this event
    IF NOT EXISTS(SELECT 1 FROM career_matches WHERE event_id = v_league_event.id) THEN
      DECLARE
        v_opponent_id UUID;
        v_week_number INT;
        v_league_opponents UUID[];
      BEGIN
        v_week_number := (v_league_event.sequence_no % 7) + 1; -- Week 1-7
        
        -- Get opponents in deterministic order
        SELECT array_agg(ls.opponent_id ORDER BY co.first_name, co.last_name) INTO v_league_opponents
        FROM career_league_standings ls
        JOIN career_opponents co ON co.id = ls.opponent_id
        WHERE ls.career_id = p_career_id 
          AND ls.season = v_career.season 
          AND ls.tier = v_career.tier
          AND ls.is_player = FALSE;
        
        -- Round-robin opponent selection
        v_opponent_id := v_league_opponents[((v_week_number - 1) % array_length(v_league_opponents, 1)) + 1];
        
        INSERT INTO career_matches (
          career_id, event_id, opponent_id, format_legs, result
        ) VALUES (
          p_career_id, v_league_event.id, v_opponent_id, v_league_event.format_legs, 'pending'
        );
        
        RAISE NOTICE 'Created match for league event % with opponent %', v_league_event.id, v_opponent_id;
      END;
    END IF;
  END IF;
  
  -- Return status
  SELECT json_build_object(
    'success', true,
    'career_id', p_career_id,
    'tier', v_career.tier,
    'season', v_career.season,
    'events_created', (
      SELECT COUNT(*) FROM career_events 
      WHERE career_id = p_career_id AND season = v_career.season
    ),
    'next_event', (
      SELECT json_build_object(
        'id', ce.id,
        'type', ce.event_type,
        'name', ce.event_name,
        'sequence', ce.sequence_no,
        'has_match', EXISTS(SELECT 1 FROM career_matches WHERE event_id = ce.id)
      )
      FROM career_events ce
      WHERE ce.career_id = p_career_id AND ce.status = 'pending'
      ORDER BY ce.sequence_no ASC
      LIMIT 1
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 2. Update the career home to show opponent name clearly
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

  -- Get next event
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
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
      
      -- Build opponent name with nickname
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

-- 3. Apply the fix to all active Tier 2+ careers
DO $$
DECLARE
    career_record RECORD;
    fix_result JSON;
BEGIN
    FOR career_record IN 
        SELECT id, tier FROM career_profiles 
        WHERE status = 'active' AND tier >= 2
    LOOP
        SELECT rpc_fix_tier2_career_structure(career_record.id) INTO fix_result;
        
        RAISE NOTICE 'Fixed Tier % career %: %', 
          career_record.tier, career_record.id, fix_result->>'success';
    END LOOP;
END $$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'COMPLETE TIER 2 CAREER FIX APPLIED - Continue buttons should work now!';
END $$;