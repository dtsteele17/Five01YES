-- ============================================================
-- Fix Event Type Consistency Between Career Home and Game
-- Ensure league shows as league, tournament shows as tournament
-- ============================================================

-- 1. Create RPC to debug current event selection logic
CREATE OR REPLACE FUNCTION rpc_debug_event_selection(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_all_events JSON[] := '{}';
  event_record RECORD;
  v_active_event career_events;
  v_pending_event career_events;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get all events to see the full picture
  FOR event_record IN
    SELECT ce.id, ce.sequence_no, ce.event_type, ce.event_name, ce.status,
           (SELECT COUNT(*) FROM career_matches cm WHERE cm.event_id = ce.id) as match_count,
           (SELECT COUNT(*) FROM career_matches cm WHERE cm.event_id = ce.id AND cm.result = 'pending') as pending_matches
    FROM career_events ce
    WHERE career_id = p_career_id
    ORDER BY sequence_no
  LOOP
    v_all_events := v_all_events || json_build_object(
      'id', event_record.id,
      'sequence', event_record.sequence_no,
      'type', event_record.event_type,
      'name', event_record.event_name,
      'status', event_record.status,
      'match_count', event_record.match_count,
      'pending_matches', event_record.pending_matches
    );
  END LOOP;

  -- Get what career home would select (active first)
  SELECT ce.* INTO v_active_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'active'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  -- Get what career home would select (pending fallback)
  SELECT ce.* INTO v_pending_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'pending'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  RETURN json_build_object(
    'career', json_build_object('tier', v_career.tier, 'season', v_career.season, 'week', v_career.week),
    'all_events', array_to_json(v_all_events),
    'selected_active', CASE WHEN v_active_event.id IS NOT NULL THEN json_build_object(
      'id', v_active_event.id,
      'type', v_active_event.event_type,
      'name', v_active_event.event_name,
      'status', v_active_event.status,
      'sequence', v_active_event.sequence_no
    ) ELSE NULL END,
    'selected_pending', CASE WHEN v_pending_event.id IS NOT NULL THEN json_build_object(
      'id', v_pending_event.id,
      'type', v_pending_event.event_type,
      'name', v_pending_event.event_name,
      'status', v_pending_event.status,
      'sequence', v_pending_event.sequence_no
    ) ELSE NULL END
  );
END;
$$;

-- 2. Fix career home to use EXACT same logic as game loading
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end_locked_fixed(
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
    -- Get player's final position
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

  -- Get the EXISTING match (never create, only read) - CONSISTENT WITH GAME
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

  -- Get all other data (same as original)
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

-- 3. Ensure game loading uses SAME event selection logic  
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

  -- Get next event using EXACT SAME LOGIC as career home
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

  -- Mark event as active (this is what makes it show up as the current event)
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

-- 4. Clean up any inconsistent event statuses that might be causing confusion
DO $$
DECLARE
    career_record RECORD;
    duplicate_active_count INT;
    event_record RECORD;
    completed_match_count INT;
    total_match_count INT;
BEGIN
    FOR career_record IN 
        SELECT id FROM career_profiles WHERE status = 'active'
    LOOP
        -- Check for multiple active events (should only be 0 or 1)
        SELECT COUNT(*) INTO duplicate_active_count
        FROM career_events
        WHERE career_id = career_record.id AND status = 'active';
        
        IF duplicate_active_count > 1 THEN
            RAISE NOTICE 'Fixing multiple active events for career %', career_record.id;
            
            -- Set all but the first (by sequence) to completed
            UPDATE career_events 
            SET status = 'completed'
            WHERE career_id = career_record.id 
              AND status = 'active'
              AND id NOT IN (
                  SELECT id FROM career_events
                  WHERE career_id = career_record.id AND status = 'active'
                  ORDER BY sequence_no ASC
                  LIMIT 1
              );
        END IF;
        
        -- Check for events that should be completed (all matches finished)
        FOR event_record IN
            SELECT ce.id, ce.event_type, ce.event_name, ce.status
            FROM career_events ce
            WHERE ce.career_id = career_record.id 
              AND ce.status IN ('active', 'pending')
        LOOP
            -- Count matches for this event
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN cm.result IN ('win', 'loss') THEN 1 END) as completed
            INTO total_match_count, completed_match_count
            FROM career_matches cm
            WHERE cm.event_id = event_record.id;
            
            -- If all matches are completed, mark event as completed
            IF total_match_count > 0 AND completed_match_count = total_match_count THEN
                RAISE NOTICE 'Marking completed event % as completed for career %', event_record.event_name, career_record.id;
                UPDATE career_events 
                SET status = 'completed' 
                WHERE id = event_record.id;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed event type consistency between career home and game loading';
END $$;