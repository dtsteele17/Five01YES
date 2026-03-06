-- ============================================================
-- EMERGENCY FIX: Restore Career Match Functionality
-- Fix Continue button and opponent consistency issues
-- ============================================================

-- 1. FIRST: Properly clean Local Circuit Cup from Tier 2+ (this didn't work before)
DELETE FROM career_milestones 
WHERE career_id IN (SELECT id FROM career_profiles WHERE tier >= 2)
  AND (title ILIKE '%Local Circuit Cup%' OR milestone_type = 'tournament_win' AND description ILIKE '%Local Circuit Cup%');

DELETE FROM career_events 
WHERE career_id IN (SELECT id FROM career_profiles WHERE tier >= 2)
  AND (event_name ILIKE '%Local Circuit Cup%' OR event_name = 'Local Circuit Cup');

-- 2. Fix active matches that may have been broken
-- Ensure every active event has a proper match
DO $$
DECLARE
    event_record RECORD;
    career_record RECORD; 
    opponent_record RECORD;
    match_record RECORD;
    v_bot_avg INT;
    v_difficulty_mult REAL;
BEGIN
    -- Find active events without matches
    FOR event_record IN 
        SELECT ce.*, cp.tier, cp.difficulty, cp.career_seed, cp.season
        FROM career_events ce
        JOIN career_profiles cp ON cp.id = ce.career_id
        WHERE ce.status = 'active'
          AND cp.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM career_matches cm 
              WHERE cm.event_id = ce.id AND cm.status = 'pending'
          )
    LOOP
        -- Get the career
        SELECT * INTO career_record FROM career_profiles WHERE id = event_record.career_id;
        
        -- For league events, find the specific opponent (Chris Jones in this case)
        IF event_record.event_type = 'league' THEN
            -- Find opponent not yet played this season, deterministically
            SELECT co.* INTO opponent_record
            FROM career_league_standings ls
            JOIN career_opponents co ON co.id = ls.opponent_id
            WHERE ls.career_id = event_record.career_id 
              AND ls.season = career_record.season 
              AND ls.tier = career_record.tier
              AND ls.is_player = FALSE
              AND ls.opponent_id NOT IN (
                  SELECT DISTINCT cm.opponent_id 
                  FROM career_matches cm
                  JOIN career_events ce ON ce.id = cm.event_id
                  WHERE cm.career_id = event_record.career_id 
                    AND ce.event_type = 'league' 
                    AND ce.season = career_record.season
                    AND cm.result IS NOT NULL
              )
            ORDER BY co.first_name, co.last_name
            LIMIT 1;
        ELSE
            -- Non-league: any opponent from same tier
            SELECT * INTO opponent_record FROM career_opponents
            WHERE career_id = event_record.career_id AND tier = career_record.tier
            ORDER BY random() LIMIT 1;
        END IF;
        
        -- Generate opponents if none found
        IF opponent_record.id IS NULL THEN
            PERFORM rpc_generate_career_opponents(
                event_record.career_id, 
                career_record.tier::SMALLINT, 
                10, 
                career_record.career_seed + career_record.season * 100
            );
            
            SELECT * INTO opponent_record FROM career_opponents
            WHERE career_id = event_record.career_id AND tier = career_record.tier
            ORDER BY random() LIMIT 1;
        END IF;
        
        -- Calculate bot average
        v_difficulty_mult := CASE career_record.difficulty
            WHEN 'rookie' THEN 0.7
            WHEN 'amateur' THEN 0.8
            WHEN 'semi_pro' THEN 0.9
            WHEN 'pro' THEN 1.0
            WHEN 'world_class' THEN 1.1
            WHEN 'nightmare' THEN 1.2
            ELSE 1.0
        END;
        
        v_bot_avg := ROUND((opponent_record.skill_rating * v_difficulty_mult)::NUMERIC, 0);
        
        -- Create the missing match
        INSERT INTO career_matches (
            career_id, event_id, opponent_id, bot_avg_target, best_of, status
        ) VALUES (
            event_record.career_id, 
            event_record.id, 
            opponent_record.id, 
            v_bot_avg, 
            event_record.format_legs, 
            'pending'
        );
        
        RAISE NOTICE 'Created missing match for event % vs %', event_record.event_name, (opponent_record.first_name || ' ' || opponent_record.last_name);
    END LOOP;
END $$;

-- 3. Update the home RPC to ensure opponent consistency 
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

  -- Get the ACTUAL match and opponent for this event
  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.status = 'pending'
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

-- 4. Ensure play_next_event uses the SAME opponent from existing match
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
  WHERE cm.event_id = v_event.id AND cm.status = 'pending'
  LIMIT 1;

  IF v_existing_match.id IS NOT NULL THEN
    -- Use existing match - this ensures opponent consistency
    v_match_id := v_existing_match.id;
    
    SELECT co.* INTO v_opponent 
    FROM career_opponents co
    WHERE co.id = v_existing_match.opponent_id;
    
    v_bot_avg := v_existing_match.bot_avg_target;
    v_best_of := v_existing_match.best_of;
  ELSE
    RETURN json_build_object('error', 'No match found for event - database inconsistency');
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
    'bot_avg_target', v_bot_avg,
    'message', 'Ready to play!'
  );
END;
$$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Emergency fix applied: Restored career match functionality and opponent consistency';
END $$;