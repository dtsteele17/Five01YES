-- SIMPLE FIX: Create only the essential function to fix the 400 error
-- This version handles missing columns gracefully

-- First, add missing columns if they don't exist
DO $$
BEGIN
  -- Add match_room_id to career_matches if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'career_matches' AND column_name = 'match_room_id') THEN
    ALTER TABLE career_matches ADD COLUMN match_room_id TEXT;
  END IF;
  
  -- Add metadata to career_events if missing  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'career_events' AND column_name = 'metadata') THEN
    ALTER TABLE career_events ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- Simple version of the weekend event function
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
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
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

  -- Check for existing match
  SELECT * INTO v_existing_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  -- If match exists and has room, return existing
  IF v_existing_match.id IS NOT NULL AND v_existing_match.match_room_id IS NOT NULL THEN
    SELECT co.* INTO v_opponent FROM career_opponents co 
    WHERE co.id = v_existing_match.opponent_id;
    
    RETURN json_build_object(
      'success', true,
      'match_id', v_existing_match.id,
      'event', json_build_object(
        'id', v_event.id,
        'name', v_event.event_name,
        'format_legs', v_event.format_legs
      ),
      'opponent', json_build_object(
        'id', v_opponent.id,
        'name', v_opponent.first_name || ' ' || v_opponent.last_name
      ),
      'existing', true
    );
  END IF;

  -- Pick random opponent from tier
  SELECT * INTO v_opponent FROM career_opponents
  WHERE career_id = p_career_id AND tier = v_career.tier
  ORDER BY random() LIMIT 1;

  IF v_opponent.id IS NULL THEN
    RETURN json_build_object('error', 'No opponents available');
  END IF;

  -- Create or update match
  IF v_existing_match.id IS NOT NULL THEN
    -- Update existing match
    UPDATE career_matches SET 
      opponent_id = v_opponent.id,
      match_room_id = 'career_' || p_career_id || '_' || extract(epoch from now())::bigint,
      result = 'pending'
    WHERE id = v_existing_match.id
    RETURNING id INTO v_match_id;
  ELSE
    -- Create new match
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result, match_room_id
    ) VALUES (
      p_career_id, v_event.id, v_opponent.id, v_event.format_legs, 'pending',
      'career_' || p_career_id || '_' || extract(epoch from now())::bigint
    ) RETURNING id INTO v_match_id;
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  RETURN json_build_object(
    'success', true,
    'match_id', v_match_id,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name,
      'format_legs', v_event.format_legs
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', v_opponent.first_name || ' ' || v_opponent.last_name
    ),
    'existing', false
  );
END;
$$;