-- ============================================================
-- CRITICAL FIX: rpc_fix_tier2_career_structure keeps recreating events
-- because it checks for event_type = 'tournament' but pub tournaments
-- are event_type = 'open'. This causes infinite tournament creation.
-- ============================================================

-- First, clean up all the duplicate tournaments that were created
-- Keep only the LATEST open event per career/season, skip the rest
UPDATE career_events ce
SET status = 'skipped'
WHERE ce.event_type = 'open'
  AND ce.status IN ('pending', 'pending_invite')
  AND ce.bracket_size = 16
  AND ce.id NOT IN (
    SELECT DISTINCT ON (career_id, season) id
    FROM career_events
    WHERE event_type = 'open' 
      AND status IN ('pending', 'pending_invite')
      AND bracket_size = 16
    ORDER BY career_id, season, created_at DESC
  );

-- Now fix the function to NOT recreate events when they already exist
-- The key change: check for 'open' events too, and don't delete+recreate
CREATE OR REPLACE FUNCTION rpc_fix_tier2_career_structure(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current_sequence INT;
  v_league_event career_events;
  v_season_events INT;
  v_league_matches_played INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  IF v_career.tier < 2 THEN
    RETURN json_build_object('error', 'Career is not Tier 2+');
  END IF;
  
  -- Ensure league standings exist
  PERFORM rpc_ensure_tier2_league_setup(p_career_id);
  
  -- Count current events for this season (including pending_invite and skipped open events)
  SELECT COUNT(*) INTO v_season_events
  FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active', 'completed');
  
  -- Get current sequence number
  SELECT COALESCE(MAX(sequence_no), 0) INTO v_current_sequence
  FROM career_events 
  WHERE career_id = p_career_id;
  
  -- Only create events if NO league events exist for this season
  IF v_season_events = 0 THEN
    -- Create 7 league events
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
        'pending',
        v_career.day + (i - 1) * 7
      );
    END LOOP;
    
    UPDATE career_profiles SET week = 1 WHERE id = p_career_id;
  END IF;
  
  -- Ensure the first pending league event has a match
  SELECT ce.* INTO v_league_event
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'pending'
    AND ce.event_type = 'league'
    AND ce.season = v_career.season
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_league_event.id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM career_matches WHERE event_id = v_league_event.id) THEN
      DECLARE
        v_opponent career_opponents;
        v_league_matches_count INT;
      BEGIN
        -- Count how many league matches have been played
        SELECT COUNT(*) INTO v_league_matches_count
        FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE ce.career_id = p_career_id 
          AND ce.season = v_career.season
          AND ce.event_type = 'league'
          AND cm.result IN ('win', 'loss');
        
        -- Pick the next opponent (rotate through league opponents)
        SELECT co.* INTO v_opponent
        FROM career_opponents co
        WHERE co.career_id = p_career_id 
          AND co.tier = v_career.tier
          AND co.id NOT IN (
            SELECT cm.opponent_id FROM career_matches cm
            JOIN career_events ce ON ce.id = cm.event_id
            WHERE ce.career_id = p_career_id AND ce.season = v_career.season AND ce.event_type = 'league'
          )
        ORDER BY co.created_at ASC
        LIMIT 1;
        
        IF v_opponent.id IS NOT NULL THEN
          INSERT INTO career_matches (
            career_id, event_id, opponent_id, format_legs, result
          ) VALUES (
            p_career_id, v_league_event.id, v_opponent.id, v_league_event.format_legs, 'pending'
          );
        END IF;
      END;
    END IF;
  END IF;
  
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_fix_tier2_career_structure(UUID) TO authenticated;
