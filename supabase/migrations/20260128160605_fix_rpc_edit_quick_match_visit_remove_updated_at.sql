/*
  # Fix RPC function to remove updated_at column reference
  
  1. Changes
    - Remove updated_at = NOW() from match_events UPDATE statements
    - match_events table only has created_at column, not updated_at
  
  2. No functional changes
    - Only removes the column that doesn't exist
    - All other logic remains the same
*/

-- Drop and recreate the function without updated_at references
DROP FUNCTION IF EXISTS rpc_edit_quick_match_visit(UUID, INTEGER);

CREATE OR REPLACE FUNCTION rpc_edit_quick_match_visit(
  p_event_id UUID,
  p_new_score INTEGER
)
RETURNS TABLE (
  event_id UUID,
  new_score INTEGER,
  new_remaining INTEGER,
  leg_won BOOLEAN,
  match_won BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event RECORD;
  v_room RECORD;
  v_starting_score INTEGER;
  v_previous_remaining INTEGER;
  v_new_remaining INTEGER;
  v_current_leg INTEGER;
  v_player_id UUID;
  v_room_id UUID;
  v_subsequent_event RECORD;
  v_temp_remaining INTEGER;
  v_leg_won BOOLEAN := FALSE;
  v_match_won BOOLEAN := FALSE;
BEGIN
  -- Validate score range
  IF p_new_score < 0 OR p_new_score > 180 THEN
    RAISE EXCEPTION 'Score must be between 0 and 180';
  END IF;

  -- Get the event to edit
  SELECT * INTO v_event
  FROM match_events
  WHERE id = p_event_id AND event_type = 'visit';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit event not found';
  END IF;

  v_room_id := v_event.room_id;
  v_player_id := v_event.player_id;
  v_current_leg := v_event.leg;

  -- Get room and starting score
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = v_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  v_starting_score := v_room.game_mode;

  -- Find the previous remaining for this player in this leg
  SELECT remaining_after INTO v_previous_remaining
  FROM match_events
  WHERE room_id = v_room_id
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

  -- Prevent going negative (bust)
  IF v_new_remaining < 0 THEN
    v_new_remaining := v_previous_remaining;
  END IF;

  -- Update the edited event (removed updated_at)
  UPDATE match_events
  SET 
    score = p_new_score,
    remaining_after = v_new_remaining
  WHERE id = p_event_id;

  -- Recalculate all subsequent events in the same leg
  FOR v_subsequent_event IN
    SELECT *
    FROM match_events
    WHERE room_id = v_room_id
      AND leg = v_current_leg
      AND seq > v_event.seq
      AND event_type = 'visit'
    ORDER BY seq ASC
  LOOP
    -- Get the previous remaining for this subsequent event
    SELECT remaining_after INTO v_temp_remaining
    FROM match_events
    WHERE room_id = v_room_id
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
      v_temp_remaining := v_temp_remaining + v_subsequent_event.score; -- Revert to pre-throw (bust)
    END IF;

    -- Update subsequent event (removed updated_at)
    UPDATE match_events
    SET 
      remaining_after = v_temp_remaining
    WHERE id = v_subsequent_event.id;
  END LOOP;

  -- Update room state with latest remaining for both players in current leg
  IF v_current_leg = v_room.current_leg THEN
    -- Update player1 remaining
    SELECT remaining_after INTO v_temp_remaining
    FROM match_events
    WHERE room_id = v_room_id
      AND player_id = v_room.player1_id
      AND leg = v_current_leg
      AND event_type = 'visit'
    ORDER BY seq DESC
    LIMIT 1;

    IF v_temp_remaining IS NOT NULL THEN
      UPDATE match_rooms
      SET player1_remaining = v_temp_remaining
      WHERE id = v_room_id;
    END IF;

    -- Update player2 remaining
    SELECT remaining_after INTO v_temp_remaining
    FROM match_events
    WHERE room_id = v_room_id
      AND player_id = v_room.player2_id
      AND leg = v_current_leg
      AND event_type = 'visit'
    ORDER BY seq DESC
    LIMIT 1;

    IF v_temp_remaining IS NOT NULL THEN
      UPDATE match_rooms
      SET player2_remaining = v_temp_remaining
      WHERE id = v_room_id;
    END IF;

    -- Check if leg was won (someone has remaining = 0)
    IF v_new_remaining = 0 THEN
      v_leg_won := TRUE;
      
      -- Update leg counts in room summary
      IF v_player_id = v_room.player1_id THEN
        UPDATE match_rooms
        SET summary = jsonb_set(
          COALESCE(summary, '{}'::jsonb),
          '{player1_legs}',
          to_jsonb(COALESCE((summary->>'player1_legs')::INTEGER, 0) + 1)
        )
        WHERE id = v_room_id
        RETURNING (summary->>'player1_legs')::INTEGER >= legs_to_win INTO v_match_won;
      ELSE
        UPDATE match_rooms
        SET summary = jsonb_set(
          COALESCE(summary, '{}'::jsonb),
          '{player2_legs}',
          to_jsonb(COALESCE((summary->>'player2_legs')::INTEGER, 0) + 1)
        )
        WHERE id = v_room_id
        RETURNING (summary->>'player2_legs')::INTEGER >= legs_to_win INTO v_match_won;
      END IF;

      -- If match won, update room status
      IF v_match_won THEN
        UPDATE match_rooms
        SET 
          status = 'finished',
          winner_id = v_player_id
        WHERE id = v_room_id;
      ELSE
        -- Start new leg
        UPDATE match_rooms
        SET 
          current_leg = current_leg + 1,
          player1_remaining = game_mode,
          player2_remaining = game_mode
        WHERE id = v_room_id;
      END IF;
    END IF;
  END IF;

  -- Return result
  RETURN QUERY SELECT 
    p_event_id,
    p_new_score,
    v_new_remaining,
    v_leg_won,
    v_match_won;
END;
$$;
