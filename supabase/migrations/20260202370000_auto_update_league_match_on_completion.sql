/*
  # Auto-Update League Match Status When Match Room Finishes
  
  When a match_rooms finishes (status='finished'), automatically update
  the corresponding league_matches.status to 'completed' so standings can be calculated.
  
  This ensures standings appear as soon as matches are completed.
*/

-- Create function to update league_match when match_room finishes
CREATE OR REPLACE FUNCTION auto_update_league_match_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When match_rooms status changes to 'finished', update league_matches
  IF NEW.status = 'finished' AND (OLD.status IS NULL OR OLD.status != 'finished') THEN
    -- Update league_matches if this room is linked to a league match
    IF NEW.league_match_id IS NOT NULL THEN
      UPDATE league_matches
      SET 
        status = 'completed',
        updated_at = now()
      WHERE id = NEW.league_match_id
        AND status != 'completed';  -- Only update if not already completed
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on match_rooms
DROP TRIGGER IF EXISTS trigger_auto_update_league_match_on_completion ON match_rooms;

CREATE TRIGGER trigger_auto_update_league_match_on_completion
AFTER UPDATE OF status ON match_rooms
FOR EACH ROW
WHEN (NEW.status = 'finished' AND (OLD.status IS NULL OR OLD.status != 'finished'))
EXECUTE FUNCTION auto_update_league_match_on_completion();

COMMENT ON FUNCTION auto_update_league_match_on_completion IS 'Automatically updates league_matches.status to completed when match_rooms finishes';

GRANT EXECUTE ON FUNCTION auto_update_league_match_on_completion() TO authenticated;
