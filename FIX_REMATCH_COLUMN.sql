-- ============================================================================
-- FIX REMAATCH - Add missing rematch_of column to match_rooms
-- ============================================================================

-- 1. Add rematch_of column to match_rooms if it doesn't exist
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'rematch_of'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN rematch_of UUID REFERENCES match_rooms(id);
    RAISE NOTICE 'Added rematch_of column to match_rooms';
  ELSE
    RAISE NOTICE 'rematch_of column already exists';
  END IF;
END $$;

-- 2. Also add rematch_room_id if it doesn't exist (for linking)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'rematch_room_id'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN rematch_room_id UUID REFERENCES match_rooms(id);
    RAISE NOTICE 'Added rematch_room_id column to match_rooms';
  ELSE
    RAISE NOTICE 'rematch_room_id column already exists';
  END IF;
END $$;

-- 3. Verify columns exist
-- ============================================================================
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'match_rooms'
  AND column_name IN ('rematch_of', 'rematch_room_id')
ORDER BY column_name;

-- 4. Update the trigger function to handle missing columns gracefully
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_create_rematch_room()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_room_id UUID;
  v_has_rematch_of BOOLEAN;
  v_has_rematch_room_id BOOLEAN;
BEGIN
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'rematch_of'
  ) INTO v_has_rematch_of;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_rooms' AND column_name = 'rematch_room_id'
  ) INTO v_has_rematch_room_id;

  -- Only create room if both ready, no room yet, and status is 'ready'
  IF NEW.both_ready AND NEW.new_room_id IS NULL AND NEW.status = 'ready' THEN
    
    -- Mark as creating first
    NEW.status := 'creating';
    
    -- Create the new match room with dynamic column handling
    IF v_has_rematch_of AND v_has_rematch_room_id THEN
      -- Both columns exist
      INSERT INTO match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        match_type,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn,
        double_out,
        source,
        player1_ready,
        player2_ready,
        pregame_status,
        rematch_of
      ) VALUES (
        NEW.player1_id,
        NEW.player2_id,
        NEW.game_mode,
        NEW.match_format,
        NEW.match_type,
        'active',
        1,
        NEW.legs_to_win,
        NEW.game_mode,
        NEW.game_mode,
        NEW.player1_id,
        NEW.double_out,
        COALESCE(NEW.source, 'rematch'),
        TRUE,
        TRUE,
        'ready',
        NEW.original_room_id
      )
      RETURNING id INTO v_new_room_id;
      
      -- Update original room with rematch link
      UPDATE match_rooms 
      SET rematch_room_id = v_new_room_id
      WHERE id = NEW.original_room_id;
      
    ELSIF v_has_rematch_of THEN
      -- Only rematch_of exists
      INSERT INTO match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        match_type,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn,
        double_out,
        source,
        player1_ready,
        player2_ready,
        pregame_status,
        rematch_of
      ) VALUES (
        NEW.player1_id,
        NEW.player2_id,
        NEW.game_mode,
        NEW.match_format,
        NEW.match_type,
        'active',
        1,
        NEW.legs_to_win,
        NEW.game_mode,
        NEW.game_mode,
        NEW.player1_id,
        NEW.double_out,
        COALESCE(NEW.source, 'rematch'),
        TRUE,
        TRUE,
        'ready',
        NEW.original_room_id
      )
      RETURNING id INTO v_new_room_id;
      
    ELSE
      -- Neither column exists (basic insert)
      INSERT INTO match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        match_type,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn,
        double_out,
        source,
        player1_ready,
        player2_ready,
        pregame_status
      ) VALUES (
        NEW.player1_id,
        NEW.player2_id,
        NEW.game_mode,
        NEW.match_format,
        NEW.match_type,
        'active',
        1,
        NEW.legs_to_win,
        NEW.game_mode,
        NEW.game_mode,
        NEW.player1_id,
        NEW.double_out,
        COALESCE(NEW.source, 'rematch'),
        TRUE,
        TRUE,
        'ready'
      )
      RETURNING id INTO v_new_room_id;
    END IF;

    -- Update the request with new room info
    NEW.new_room_id := v_new_room_id;
    NEW.status := 'created';
    NEW.updated_at := NOW();
    
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Verify trigger is correct
-- ============================================================================
SELECT 
  'Trigger updated' as status,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_create_rematch_room'
  ) as trigger_exists;

SELECT 'Rematch column fix complete!' as status;
