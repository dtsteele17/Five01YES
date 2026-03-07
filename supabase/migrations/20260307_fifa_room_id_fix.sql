-- ============================================================
-- FIFA-STYLE CAREER MODE - ROOM ID TYPE FIX
-- Fix the UUID vs TEXT issue in career room IDs
-- ============================================================

-- Fix the FIFA career continue function to use proper UUIDs
CREATE OR REPLACE FUNCTION rpc_career_continue_fifa_style(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_room_id TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Ensure league standings exist for FIFA-style leagues
  IF v_career.tier >= 2 AND NOT EXISTS (
    SELECT 1 FROM career_league_standings 
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
  ) THEN
    IF v_career.tier = 2 THEN
      PERFORM rpc_fifa_initialize_tier2_league(p_career_id, v_career.season);
    ELSIF v_career.tier = 3 THEN
      PERFORM rpc_fifa_initialize_tier3_league(p_career_id, v_career.season);
    END IF;
  END IF;

  -- Get current league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event available');
  END IF;

  -- Get existing match or use FIFA fixtures to create one
  SELECT * INTO v_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  IF v_match.id IS NULL THEN
    -- Generate FIFA-style fixtures to create the match
    PERFORM rpc_fifa_get_week_fixtures(p_career_id);
    
    -- Try to get the match again
    SELECT * INTO v_match FROM career_matches 
    WHERE career_id = p_career_id AND event_id = v_event.id;
    
    IF v_match.id IS NULL THEN
      RETURN json_build_object('error', 'Could not create league match');
    END IF;
  END IF;

  -- Check if match already has a room ID (idempotency)
  IF v_match.match_room_id IS NOT NULL THEN
    v_room_id := v_match.match_room_id::TEXT;
  ELSE
    -- Create new UUID room ID
    v_room_id := gen_random_uuid()::TEXT;
    
    -- Update match with room ID (cast text to UUID)
    UPDATE career_matches SET match_room_id = v_room_id::UUID WHERE id = v_match.id;
  END IF;

  -- Get opponent details
  SELECT * INTO v_opponent FROM career_opponents WHERE id = v_match.opponent_id;
  
  IF v_opponent.id IS NULL THEN
    RETURN json_build_object('error', 'Opponent not found');
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  RETURN json_build_object(
    'success', true,
    'match_id', v_match.id,
    'room_id', v_room_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name || ' (League Match)',
      'format_legs', CASE WHEN v_career.tier = 3 THEN 5 ELSE 3 END,
      'tier', v_career.tier,
      'season', v_career.season
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', v_opponent.first_name || ' ' || v_opponent.last_name,
      'skill_rating', v_opponent.skill_rating
    ),
    'bot_config', json_build_object(
      'difficulty', CASE 
        WHEN v_opponent.skill_rating <= 40 THEN 'beginner'
        WHEN v_opponent.skill_rating <= 55 THEN 'casual'
        WHEN v_opponent.skill_rating <= 70 THEN 'intermediate'
        ELSE 'advanced'
      END,
      'average', LEAST(90, GREATEST(30, v_opponent.skill_rating + (random() * 10 - 5)))
    ),
    'career_context', json_build_object(
      'tier_name', CASE 
        WHEN v_career.tier = 2 THEN 'Pub League'
        WHEN v_career.tier = 3 THEN 'County League'
        ELSE 'League'
      END,
      'match_type', 'league'
    )
  );
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🔧 FIFA Career Room ID Fix completed!';
  RAISE NOTICE '✅ Fixed UUID vs TEXT type mismatch in match_room_id';
  RAISE NOTICE '✅ Career continue should now work without type errors';
END $$;