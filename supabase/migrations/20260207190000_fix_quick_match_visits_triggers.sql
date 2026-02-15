-- Fix: Remove any triggers referencing starting_score column
-- The quick_match_visits table doesn't have starting_score, it uses remaining_before

-- Drop existing triggers on quick_match_visits
DROP TRIGGER IF EXISTS validate_checkout_trigger ON quick_match_visits;

-- Drop any other triggers that might reference starting_score
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'quick_match_visits'::regclass 
        AND NOT tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON quick_match_visits', trigger_record.tgname);
        RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
    END LOOP;
END $$;

-- Recreate the checkout validation trigger with correct column references
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
    -- Get room to check double-out rule
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
CREATE TRIGGER validate_checkout_trigger
  BEFORE INSERT OR UPDATE ON quick_match_visits
  FOR EACH ROW
  EXECUTE FUNCTION validate_visit_checkout();

COMMENT ON FUNCTION validate_visit_checkout IS 'Validates that checkout visits must finish on a double when double-out is enabled';
