-- FINAL FIX: Make rpc_play_weekend_event return the exact format the frontend expects
-- This should make the "Play Your Match" button work and launch the dartbot game

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
  -- Get career 
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND status = 'active';
  
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get current league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  -- Fallback to any league event if none pending
  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM career_events 
    WHERE career_id = p_career_id 
      AND event_type = 'league'
    ORDER BY sequence_no ASC 
    LIMIT 1;
  END IF;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league events found');
  END IF;

  -- Check for existing match
  SELECT * INTO v_existing_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  IF v_existing_match.id IS NOT NULL THEN
    -- Get existing opponent
    SELECT * INTO v_opponent FROM career_opponents 
    WHERE id = v_existing_match.opponent_id;
    v_match_id := v_existing_match.id;
  ELSE
    -- Get random opponent
    SELECT * INTO v_opponent FROM career_opponents
    WHERE career_id = p_career_id 
    ORDER BY random() LIMIT 1;

    IF v_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    -- Create new match
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_event.id, v_opponent.id, 
      COALESCE(v_event.format_legs, 3), 'pending'
    ) RETURNING id INTO v_match_id;
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  -- Return in the EXACT format the frontend expects
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
    )
  );
  
END;
$$;