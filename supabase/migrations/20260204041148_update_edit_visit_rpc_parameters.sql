/*
  # Update Edit Visit RPC Parameters

  1. Changes
    - Replace rpc_edit_quick_match_visit to accept room_id, visit_number, new_score
    - Find the correct event internally based on current user and visit sequence
    - Validate that edit doesn't create illegal negative remaining
    - Allow exact 0 (checkout/leg win)
    - Handle leg wins properly with visit history reset

  2. Logic
    - Find the event for current user in current leg by visit sequence number
    - Validate new score won't make remaining < 0 unless it's exactly 0
    - Recalculate all subsequent visits
    - Handle leg win if remaining = 0
*/

-- Drop old function
DROP FUNCTION IF EXISTS rpc_edit_quick_match_visit(UUID, INTEGER);

-- Create new function with correct parameters
CREATE OR REPLACE FUNCTION rpc_edit_quick_match_visit(
  p_room_id UUID,
  p_visit_number INTEGER,
  p_new_score INTEGER
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_event RECORD;
  v_starting_score INTEGER;
  v_previous_remaining INTEGER;
  v_new_remaining INTEGER;
  v_current_leg INTEGER;
  v_player_id UUID;
  v_subsequent_event RECORD;
  v_temp_remaining INTEGER;
  v_leg_won BOOLEAN := FALSE;
  v_match_won BOOLEAN := FALSE;
  v_player1_legs INTEGER := 0;
  v_player2_legs INTEGER := 0;
BEGIN
  -- Validate score range
  IF p_new_score < 0 OR p_new_score > 180 THEN
    RETURN json_build_object('ok', false, 'error', 'Score must be between 0 and 180');
  END IF;

  v_player_id := auth.uid();

  -- Get room
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Room not found');
  END IF;

  -- Verify user is in this room
  IF v_player_id != v_room.player1_id AND v_player_id != v_room.player2_id THEN
    RETURN json_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  v_current_leg := v_room.current_leg;
  v_starting_score := v_room.game_mode;

  -- Find the event for this visit number (user's Nth visit in current leg)
  SELECT * INTO v_event
  FROM (
    SELECT *, ROW_NUMBER() OVER (ORDER BY seq) as visit_num
    FROM match_events
    WHERE room_id = p_room_id
      AND player_id = v_player_id
      AND leg = v_current_leg
      AND event_type = 'visit'
  ) numbered_events
  WHERE visit_num = p_visit_number;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Visit not found');
  END IF;

  -- Find the previous remaining for this player in this leg
  SELECT remaining_after INTO v_previous_remaining
  FROM match_events
  WHERE room_id = p_room_id
    AND player_id = v_player_id
    AND leg = v_current_leg
    AND event_type = 'visit'
    AND seq < v_event.seq
  ORDER BY seq DESC
  LIMIT 1;

  -- If no previous event, use starting score
  IF v_previous_remaining IS NULL THEN
    v_previous_remaining := v_starting_score;
  END IF;

  -- Calculate new remaining
  v_new_remaining := v_previous_remaining - p_new_score;

  -- Reject if would go negative (unless exactly 0 which is a checkout)
  IF v_new_remaining < 0 THEN
    RETURN json_build_object('ok', false, 'error', 'This score would result in a bust (remaining < 0)');
  END IF;

  -- Update the edited event
  UPDATE match_events
  SET 
    score = p_new_score,
    remaining_after = v_new_remaining
  WHERE id = v_event.id;

  -- Recalculate all subsequent events in the same leg
  FOR v_subsequent_event IN
    SELECT *
    FROM match_events
    WHERE room_id = p_room_id
      AND leg = v_current_leg
      AND seq > v_event.seq
      AND event_type = 'visit'
    ORDER BY seq ASC
  LOOP
    -- Get the previous remaining for this subsequent event
    SELECT remaining_after INTO v_temp_remaining
    FROM match_events
    WHERE room_id = p_room_id
      AND player_id = v_subsequent_event.player_id
      AND leg = v_current_leg
      AND event_type = 'visit'
      AND seq < v_subsequent_event.seq
    ORDER BY seq DESC
    LIMIT 1;

    IF v_temp_remaining IS NULL THEN
      v_temp_remaining := v_starting_score;
    END IF;

    -- Calculate new remaining for subsequent event
    v_temp_remaining := v_temp_remaining - v_subsequent_event.score;
    IF v_temp_remaining < 0 THEN
      v_temp_remaining := v_temp_remaining + v_subsequent_event.score;
    END IF;

    -- Update subsequent event
    UPDATE match_events
    SET remaining_after = v_temp_remaining
    WHERE id = v_subsequent_event.id;
  END LOOP;

  -- Update room state with latest remaining for both players in current leg
  -- Update player1 remaining
  SELECT remaining_after INTO v_temp_remaining
  FROM match_events
  WHERE room_id = p_room_id
    AND player_id = v_room.player1_id
    AND leg = v_current_leg
    AND event_type = 'visit'
  ORDER BY seq DESC
  LIMIT 1;

  IF v_temp_remaining IS NOT NULL THEN
    UPDATE match_rooms
    SET player1_remaining = v_temp_remaining
    WHERE id = p_room_id;
  END IF;

  -- Update player2 remaining
  SELECT remaining_after INTO v_temp_remaining
  FROM match_events
  WHERE room_id = p_room_id
    AND player_id = v_room.player2_id
    AND leg = v_current_leg
    AND event_type = 'visit'
  ORDER BY seq DESC
  LIMIT 1;

  IF v_temp_remaining IS NOT NULL THEN
    UPDATE match_rooms
    SET player2_remaining = v_temp_remaining
    WHERE id = p_room_id;
  END IF;

  -- Check if leg was won (someone has remaining = 0)
  IF v_new_remaining = 0 THEN
    v_leg_won := TRUE;
    
    -- Get current leg counts
    v_player1_legs := COALESCE((v_room.summary->>'player1_legs')::INTEGER, 0);
    v_player2_legs := COALESCE((v_room.summary->>'player2_legs')::INTEGER, 0);

    -- Update leg counts in room summary
    IF v_player_id = v_room.player1_id THEN
      v_player1_legs := v_player1_legs + 1;
      UPDATE match_rooms
      SET summary = jsonb_set(
        COALESCE(summary, '{}'::jsonb),
        '{player1_legs}',
        to_jsonb(v_player1_legs)
      )
      WHERE id = p_room_id;
      
      v_match_won := v_player1_legs >= v_room.legs_to_win;
    ELSE
      v_player2_legs := v_player2_legs + 1;
      UPDATE match_rooms
      SET summary = jsonb_set(
        COALESCE(summary, '{}'::jsonb),
        '{player2_legs}',
        to_jsonb(v_player2_legs)
      )
      WHERE id = p_room_id;
      
      v_match_won := v_player2_legs >= v_room.legs_to_win;
    END IF;

    -- If match won, update room status
    IF v_match_won THEN
      UPDATE match_rooms
      SET 
        status = 'finished',
        winner_id = v_player_id
      WHERE id = p_room_id;
    ELSE
      -- Start new leg
      UPDATE match_rooms
      SET 
        current_leg = current_leg + 1,
        player1_remaining = game_mode,
        player2_remaining = game_mode
      WHERE id = p_room_id;
    END IF;
  END IF;

  -- Return result
  RETURN json_build_object(
    'ok', true,
    'new_remaining', v_new_remaining,
    'leg_won', v_leg_won,
    'match_won', v_match_won
  );
END;
$$;
