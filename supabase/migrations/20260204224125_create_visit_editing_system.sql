/*
  # Create Visit Editing System for Quick Matches

  ## Summary
  Implements a complete visit history editing and deletion system with proper validation,
  RLS policies, and automatic recalculation of subsequent visits.

  ## Security (RLS Policies)
  1. **UPDATE Policy**: Players can only edit their own visits in active matches
  2. **DELETE Policy**: Players can only delete their own visits in active matches
  3. **Validation Trigger**: Ensures checkout visits must finish on a double

  ## RPC Functions
  1. **rpc_edit_visit_with_darts**: Edit a visit with full dart details and recalculate
  2. **rpc_delete_visit**: Delete a visit and recalculate all subsequent visits

  ## Validation Rules
  - Cannot edit/delete other players' visits
  - Cannot edit/delete if match is not active
  - Checkout must finish on double (multiplier = 2)
  - Invalid checkout is marked as bust and score reverted
*/

-- ============================================================================
-- RLS POLICIES FOR VISIT EDITING
-- ============================================================================

-- UPDATE policy: Players can only edit their own visits in active matches
CREATE POLICY "Players can update own visits in active matches"
  ON quick_match_visits FOR UPDATE
  TO authenticated
  USING (
    player_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = quick_match_visits.room_id
      AND match_rooms.status = 'active'
    )
  )
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = quick_match_visits.room_id
      AND match_rooms.status = 'active'
    )
  );

-- DELETE policy: Players can only delete their own visits in active matches
CREATE POLICY "Players can delete own visits in active matches"
  ON quick_match_visits FOR DELETE
  TO authenticated
  USING (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = quick_match_visits.room_id
      AND match_rooms.status = 'active'
    )
  );

-- ============================================================================
-- VALIDATION TRIGGER FOR CHECKOUT DOUBLE-OUT
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_visit_checkout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_room RECORD;
  v_last_dart JSONB;
  v_is_double BOOLEAN := FALSE;
BEGIN
  -- Only validate on checkout (remaining_after = 0 and not bust)
  IF NEW.remaining_after = 0 AND NOT NEW.is_bust THEN
    -- Get room to check double_out rule
    SELECT * INTO v_room FROM match_rooms WHERE id = NEW.room_id;
    
    -- If double-out is enabled, validate last dart
    IF v_room.double_out THEN
      -- Check if darts array has at least one dart
      IF jsonb_array_length(NEW.darts) > 0 THEN
        -- Get last dart
        v_last_dart := NEW.darts -> (jsonb_array_length(NEW.darts) - 1);
        
        -- Check if last dart multiplier is 'D' (double) or 'DB' (double bull)
        v_is_double := (v_last_dart->>'mult' IN ('D', 'DB'));
        
        -- If not double, mark as bust
        IF NOT v_is_double THEN
          NEW.is_bust := TRUE;
          NEW.bust_reason := 'double_out_required';
          NEW.is_checkout := FALSE;
          NEW.remaining_after := NEW.remaining_before;
        END IF;
      ELSE
        -- No darts provided but claiming checkout - mark as bust
        NEW.is_bust := TRUE;
        NEW.bust_reason := 'double_out_required';
        NEW.is_checkout := FALSE;
        NEW.remaining_after := NEW.remaining_before;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS validate_checkout_trigger ON quick_match_visits;
CREATE TRIGGER validate_checkout_trigger
  BEFORE INSERT OR UPDATE ON quick_match_visits
  FOR EACH ROW
  EXECUTE FUNCTION validate_visit_checkout();

-- ============================================================================
-- RPC: EDIT VISIT WITH DARTS
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_edit_visit_with_darts(
  p_visit_id UUID,
  p_darts JSONB,
  p_score INTEGER,
  p_darts_thrown INTEGER DEFAULT 3,
  p_darts_at_double INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_visit RECORD;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_new_remaining INTEGER;
  v_is_bust BOOLEAN := FALSE;
  v_bust_reason TEXT := NULL;
  v_is_checkout BOOLEAN := FALSE;
  v_last_dart JSONB;
  v_subsequent_visit RECORD;
  v_current_remaining INTEGER;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the visit
  SELECT * INTO v_visit FROM quick_match_visits WHERE id = p_visit_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify ownership
  IF v_visit.player_id != v_user_id THEN
    RAISE EXCEPTION 'Not your visit';
  END IF;

  -- Get room
  SELECT * INTO v_room FROM match_rooms WHERE id = v_visit.room_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if room is active
  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  -- Calculate new remaining
  v_new_remaining := v_visit.remaining_before - p_score;

  -- Check for bust conditions
  IF v_new_remaining < 0 THEN
    v_is_bust := TRUE;
    v_bust_reason := 'below_zero';
    v_new_remaining := v_visit.remaining_before;
  ELSIF v_new_remaining = 1 THEN
    v_is_bust := TRUE;
    v_bust_reason := 'left_on_one';
    v_new_remaining := v_visit.remaining_before;
  ELSIF v_new_remaining = 0 THEN
    -- Potential checkout - validate double-out if required
    IF v_room.double_out AND v_visit.remaining_before <= 50 THEN
      -- Check last dart
      IF jsonb_array_length(p_darts) > 0 THEN
        v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);
        
        IF (v_last_dart->>'mult' IN ('D', 'DB')) THEN
          v_is_checkout := TRUE;
        ELSE
          v_is_bust := TRUE;
          v_bust_reason := 'double_out_required';
          v_new_remaining := v_visit.remaining_before;
        END IF;
      ELSE
        v_is_bust := TRUE;
        v_bust_reason := 'double_out_required';
        v_new_remaining := v_visit.remaining_before;
      END IF;
    ELSE
      v_is_checkout := TRUE;
    END IF;
  END IF;

  -- Update the visit
  UPDATE quick_match_visits
  SET 
    darts = p_darts,
    score = p_score,
    remaining_after = v_new_remaining,
    is_bust = v_is_bust,
    bust_reason = v_bust_reason,
    is_checkout = v_is_checkout,
    darts_thrown = p_darts_thrown,
    darts_at_double = p_darts_at_double,
    updated_at = now()
  WHERE id = p_visit_id;

  -- Recalculate all subsequent visits in this leg for this player
  v_current_remaining := v_new_remaining;
  
  FOR v_subsequent_visit IN
    SELECT * FROM quick_match_visits
    WHERE room_id = v_visit.room_id
    AND leg = v_visit.leg
    AND player_id = v_user_id
    AND turn_no > v_visit.turn_no
    ORDER BY turn_no
  LOOP
    -- Update remaining_before for this visit
    UPDATE quick_match_visits
    SET remaining_before = v_current_remaining
    WHERE id = v_subsequent_visit.id;
    
    -- Recalculate remaining_after based on new remaining_before
    v_current_remaining := v_current_remaining - v_subsequent_visit.score;
    
    -- Check for bust conditions
    IF v_current_remaining < 0 THEN
      v_current_remaining := GREATEST(0, v_current_remaining + v_subsequent_visit.score);
      UPDATE quick_match_visits
      SET 
        remaining_after = v_current_remaining,
        is_bust = TRUE,
        bust_reason = 'below_zero',
        is_checkout = FALSE
      WHERE id = v_subsequent_visit.id;
    ELSIF v_current_remaining = 1 THEN
      v_current_remaining := v_current_remaining + v_subsequent_visit.score;
      UPDATE quick_match_visits
      SET 
        remaining_after = v_current_remaining,
        is_bust = TRUE,
        bust_reason = 'left_on_one',
        is_checkout = FALSE
      WHERE id = v_subsequent_visit.id;
    ELSE
      UPDATE quick_match_visits
      SET remaining_after = v_current_remaining
      WHERE id = v_subsequent_visit.id;
    END IF;
  END LOOP;

  -- Update current remaining in room if this player's latest visit
  v_is_player1 := (v_room.player1_id = v_user_id);
  
  -- Get the latest visit for this player in this leg
  SELECT remaining_after INTO v_current_remaining
  FROM quick_match_visits
  WHERE room_id = v_visit.room_id
  AND leg = v_visit.leg
  AND player_id = v_user_id
  ORDER BY turn_no DESC
  LIMIT 1;
  
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_remaining = v_current_remaining WHERE id = v_visit.room_id;
  ELSE
    UPDATE match_rooms SET player2_remaining = v_current_remaining WHERE id = v_visit.room_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'visit_id', p_visit_id,
    'new_remaining', v_new_remaining,
    'is_bust', v_is_bust,
    'is_checkout', v_is_checkout
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_edit_visit_with_darts TO authenticated;

-- ============================================================================
-- RPC: DELETE VISIT
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_delete_visit(
  p_visit_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_visit RECORD;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_subsequent_visit RECORD;
  v_current_remaining INTEGER;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the visit
  SELECT * INTO v_visit FROM quick_match_visits WHERE id = p_visit_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;

  -- Verify ownership
  IF v_visit.player_id != v_user_id THEN
    RAISE EXCEPTION 'Not your visit';
  END IF;

  -- Get room
  SELECT * INTO v_room FROM match_rooms WHERE id = v_visit.room_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if room is active
  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  -- Store remaining_before for recalculation
  v_current_remaining := v_visit.remaining_before;

  -- Delete the visit
  DELETE FROM quick_match_visits WHERE id = p_visit_id;

  -- Recalculate all subsequent visits in this leg for this player
  FOR v_subsequent_visit IN
    SELECT * FROM quick_match_visits
    WHERE room_id = v_visit.room_id
    AND leg = v_visit.leg
    AND player_id = v_user_id
    AND turn_no > v_visit.turn_no
    ORDER BY turn_no
  LOOP
    -- Update remaining_before for this visit
    UPDATE quick_match_visits
    SET remaining_before = v_current_remaining
    WHERE id = v_subsequent_visit.id;
    
    -- Recalculate remaining_after
    v_current_remaining := v_current_remaining - v_subsequent_visit.score;
    
    -- Check for bust conditions
    IF v_current_remaining < 0 THEN
      v_current_remaining := GREATEST(0, v_current_remaining + v_subsequent_visit.score);
      UPDATE quick_match_visits
      SET 
        remaining_after = v_current_remaining,
        is_bust = TRUE,
        bust_reason = 'below_zero',
        is_checkout = FALSE
      WHERE id = v_subsequent_visit.id;
    ELSIF v_current_remaining = 1 THEN
      v_current_remaining := v_current_remaining + v_subsequent_visit.score;
      UPDATE quick_match_visits
      SET 
        remaining_after = v_current_remaining,
        is_bust = TRUE,
        bust_reason = 'left_on_one',
        is_checkout = FALSE
      WHERE id = v_subsequent_visit.id;
    ELSE
      UPDATE quick_match_visits
      SET remaining_after = v_current_remaining
      WHERE id = v_subsequent_visit.id;
    END IF;
  END LOOP;

  -- Update current remaining in room
  v_is_player1 := (v_room.player1_id = v_user_id);
  
  -- Get the latest visit for this player in this leg (after deletion)
  SELECT COALESCE(remaining_after, v_room.game_mode) INTO v_current_remaining
  FROM quick_match_visits
  WHERE room_id = v_visit.room_id
  AND leg = v_visit.leg
  AND player_id = v_user_id
  ORDER BY turn_no DESC
  LIMIT 1;
  
  -- If no visits left, reset to starting score
  IF v_current_remaining IS NULL THEN
    v_current_remaining := v_room.game_mode;
  END IF;
  
  IF v_is_player1 THEN
    UPDATE match_rooms SET player1_remaining = v_current_remaining WHERE id = v_visit.room_id;
  ELSE
    UPDATE match_rooms SET player2_remaining = v_current_remaining WHERE id = v_visit.room_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'visit_id', p_visit_id,
    'deleted', TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_delete_visit TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION rpc_edit_visit_with_darts IS 'Edit a visit with full dart details and automatically recalculate all subsequent visits';
COMMENT ON FUNCTION rpc_delete_visit IS 'Delete a visit and recalculate all subsequent visits for that player in the leg';
COMMENT ON FUNCTION validate_visit_checkout IS 'Validates that checkout visits must finish on a double when double-out is enabled';
