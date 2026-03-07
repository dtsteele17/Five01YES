-- ============================================================
-- Fix Tier 2 Career Home Display and Continue Button  
-- Ensure opponent names show and Continue button works properly
-- ============================================================

-- 1. Update career home to ALWAYS show opponent for Tier 2+ league matches
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked_fixed_v2(
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

  -- Check if season is complete (no pending events)
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

  -- Get next event using EXACT SAME LOGIC as play event (active first, then pending)
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status IN ('active', 'pending')
  ORDER BY 
    CASE WHEN ce.status = 'active' THEN 1 ELSE 2 END,
    ce.sequence_no ASC
  LIMIT 1;

  -- For Tier 2+ league events, ensure match exists and get opponent
  IF v_next_event.id IS NOT NULL AND v_career.tier >= 2 AND v_next_event.event_type = 'league' THEN
    -- Get existing match
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.result = 'pending'
    LIMIT 1;
    
    -- If no match exists, create one for league
    IF v_next_match.id IS NULL THEN
      DECLARE
        v_week_number INT;
        v_league_opponents UUID[];
        v_selected_opponent_id UUID;
      BEGIN
        v_week_number := v_next_event.sequence_no;
        
        -- Get league opponents in deterministic order
        SELECT array_agg(ls.opponent_id ORDER BY co.first_name, co.last_name) INTO v_league_opponents
        FROM career_league_standings ls
        JOIN career_opponents co ON co.id = ls.opponent_id
        WHERE ls.career_id = p_career_id 
          AND ls.season = v_career.season 
          AND ls.tier = v_career.tier
          AND ls.is_player = FALSE;

        -- Select opponent using round-robin logic
        IF array_length(v_league_opponents, 1) > 0 THEN
          v_selected_opponent_id := v_league_opponents[((v_week_number - 1) % array_length(v_league_opponents, 1)) + 1];
          
          -- Create match
          INSERT INTO career_matches (
            career_id, event_id, opponent_id, format_legs, result
          ) VALUES (
            p_career_id, v_next_event.id, v_selected_opponent_id, 
            CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, 'pending'
          ) RETURNING * INTO v_next_match;
        END IF;
      END;
    END IF;
    
    -- Get opponent details
    IF v_next_match.id IS NOT NULL THEN
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.id = v_next_match.opponent_id;
      
      -- Build opponent name
      v_opponent_name := COALESCE(v_opponent.first_name || ' ', '') ||
                        CASE WHEN v_opponent.nickname IS NOT NULL 
                             THEN '''' || v_opponent.nickname || ''' ' 
                             ELSE '' END ||
                        COALESCE(v_opponent.last_name, '');
    END IF;
  ELSE
    -- For non-league events, use existing match logic
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
  END IF;

  -- Get other data (milestones, awards, etc.)
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

-- 2. Create function to ensure league standings exist for tier 2+ careers
CREATE OR REPLACE FUNCTION rpc_ensure_tier2_league_setup(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_standings_count INT;
  v_generated_opponents INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL OR v_career.tier < 2 THEN
    RETURN json_build_object('error', 'Career not found or not tier 2+');
  END IF;
  
  -- Check if league standings exist
  SELECT COUNT(*) INTO v_standings_count
  FROM career_league_standings
  WHERE career_id = p_career_id 
    AND season = v_career.season 
    AND tier = v_career.tier;
    
  IF v_standings_count < 8 THEN
    -- Generate opponents for this tier if not exists
    SELECT COUNT(*) INTO v_generated_opponents
    FROM career_opponents 
    WHERE career_id = p_career_id AND tier = v_career.tier;
    
    IF v_generated_opponents < 7 THEN
      PERFORM rpc_generate_career_opponents(
        p_career_id, 
        v_career.tier::SMALLINT, 
        10, 
        v_career.career_seed + v_career.season * 100
      );
    END IF;
    
    -- Create league standings (8 total: 1 player + 7 opponents)
    INSERT INTO career_league_standings (
      career_id, season, tier, is_player,
      played, won, lost, legs_for, legs_against, points, average
    ) VALUES (
      p_career_id, v_career.season, v_career.tier, TRUE,
      0, 0, 0, 0, 0, 0, 0.0
    ) ON CONFLICT (career_id, season, tier, is_player) WHERE is_player = TRUE DO NOTHING;
    
    -- Add opponents to standings
    INSERT INTO career_league_standings (
      career_id, season, tier, is_player, opponent_id,
      played, won, lost, legs_for, legs_against, points, average
    )
    SELECT 
      p_career_id, v_career.season, v_career.tier, FALSE, co.id,
      0, 0, 0, 0, 0, 0, 0.0
    FROM career_opponents co
    WHERE co.career_id = p_career_id 
      AND co.tier = v_career.tier
      AND co.id NOT IN (
        SELECT opponent_id FROM career_league_standings 
        WHERE career_id = p_career_id 
          AND season = v_career.season 
          AND tier = v_career.tier 
          AND opponent_id IS NOT NULL
      )
    LIMIT 7
    ON CONFLICT (career_id, season, tier, opponent_id) DO NOTHING;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'standings_created', v_standings_count < 8,
    'total_standings', (
      SELECT COUNT(*) FROM career_league_standings 
      WHERE career_id = p_career_id 
        AND season = v_career.season 
        AND tier = v_career.tier
    )
  );
END;
$$;

-- 3. Auto-fix any tier 2+ careers that are missing league setup
DO $$
DECLARE
    career_record RECORD;
    setup_result JSON;
BEGIN
    FOR career_record IN 
        SELECT id FROM career_profiles 
        WHERE status = 'active' AND tier >= 2
    LOOP
        SELECT rpc_ensure_tier2_league_setup(career_record.id) INTO setup_result;
        
        IF (setup_result->>'standings_created')::boolean THEN
            RAISE NOTICE 'Fixed league setup for career %', career_record.id;
        END IF;
    END LOOP;
END $$;

-- Log this critical fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed Tier 2 career home display and opponent selection';
END $$;