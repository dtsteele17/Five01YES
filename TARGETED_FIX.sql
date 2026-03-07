-- TARGETED FIX: The function exists but failing on real data
-- This handles missing columns and data issues

-- 1. Add missing columns if they don't exist
DO $$
BEGIN
  -- Add match_room_id to career_matches if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'career_matches' AND column_name = 'match_room_id') THEN
    ALTER TABLE career_matches ADD COLUMN match_room_id TEXT;
  END IF;
END $$;

-- 2. Create a more robust version of the function
CREATE OR REPLACE FUNCTION rpc_play_weekend_event(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_opponent career_opponents;
  v_match_id UUID;
  v_existing_match career_matches;
  v_room_id TEXT;
BEGIN
  -- Debug: Log the career ID
  RAISE NOTICE 'Looking for career: %', p_career_id;

  -- Get career with more detailed check
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND status = 'active';
  
  IF v_career.id IS NULL THEN
    -- Check if career exists at all
    IF EXISTS(SELECT 1 FROM career_profiles WHERE id = p_career_id) THEN
      RETURN json_build_object('error', 'Career is not active');
    ELSE
      RETURN json_build_object('error', 'Career not found');
    END IF;
  END IF;

  -- Get current league event with fallback
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  -- If no pending league events, try to get any league event
  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM career_events 
    WHERE career_id = p_career_id 
      AND event_type = 'league'
    ORDER BY sequence_no ASC 
    LIMIT 1;
    
    IF v_event.id IS NULL THEN
      RETURN json_build_object('error', 'No league events found for this career');
    END IF;
  END IF;

  -- Check for existing match
  SELECT * INTO v_existing_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  -- Generate room ID
  v_room_id := 'career_' || p_career_id || '_' || extract(epoch from now())::bigint;

  -- If match exists, update it
  IF v_existing_match.id IS NOT NULL THEN
    -- Get opponent
    SELECT * INTO v_opponent FROM career_opponents 
    WHERE id = v_existing_match.opponent_id;
    
    -- If no opponent, pick a random one
    IF v_opponent.id IS NULL THEN
      SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id 
      ORDER BY random() LIMIT 1;
      
      -- Update match with new opponent
      UPDATE career_matches SET 
        opponent_id = v_opponent.id,
        match_room_id = v_room_id
      WHERE id = v_existing_match.id;
    ELSE
      -- Just update room ID
      UPDATE career_matches SET 
        match_room_id = v_room_id
      WHERE id = v_existing_match.id;
    END IF;
    
    v_match_id := v_existing_match.id;
  ELSE
    -- Create new match
    -- First get an opponent
    SELECT * INTO v_opponent FROM career_opponents
    WHERE career_id = p_career_id 
    ORDER BY random() LIMIT 1;

    IF v_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available for this career');
    END IF;

    -- Create new match
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result, match_room_id
    ) VALUES (
      p_career_id, v_event.id, v_opponent.id, 
      COALESCE(v_event.format_legs, 3), 'pending', v_room_id
    ) RETURNING id INTO v_match_id;
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  -- Return success with all required data
  RETURN json_build_object(
    'success', true,
    'match_id', v_match_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', COALESCE(v_event.event_name, 'League Match'),
      'format_legs', COALESCE(v_event.format_legs, 3)
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', COALESCE(v_opponent.first_name || ' ' || v_opponent.last_name, 'Unknown Opponent')
    ),
    'existing', v_existing_match.id IS NOT NULL
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return detailed error for debugging
    RETURN json_build_object(
      'error', 'Database error: ' || SQLERRM,
      'detail', 'Error in rpc_play_weekend_event'
    );
END;
$$;