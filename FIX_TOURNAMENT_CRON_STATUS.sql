-- =======================================================
-- FIX TOURNAMENT CRON AND STATUS FLOW
-- =======================================================

-- Create function to handle tournament status transitions
CREATE OR REPLACE FUNCTION update_tournament_status_flow()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_updated INTEGER := 0;
  v_cancelled INTEGER := 0;
BEGIN
  -- Process tournaments that should transition from registration to ready
  FOR v_tournament IN 
    SELECT * FROM tournaments 
    WHERE status = 'registration' 
    AND start_at <= NOW()
  LOOP
    -- Count participants
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id;
    
    IF v_participant_count >= 2 THEN
      -- Enough participants - move to ready and generate bracket
      UPDATE tournaments 
      SET status = 'ready',
          bracket_generated_at = NOW()
      WHERE id = v_tournament.id;
      
      -- Generate bracket
      PERFORM generate_tournament_bracket(v_tournament.id);
      
      v_updated := v_updated + 1;
    ELSE
      -- Not enough participants - cancel tournament
      UPDATE tournaments 
      SET status = 'cancelled'
      WHERE id = v_tournament.id;
      
      v_cancelled := v_cancelled + 1;
    END IF;
  END LOOP;

  -- Move tournaments from ready to in_progress when first match starts
  UPDATE tournaments 
  SET status = 'in_progress',
      started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END
  WHERE status = 'ready'
  AND EXISTS(
    SELECT 1 FROM tournament_matches 
    WHERE tournament_id = tournaments.id 
    AND status IN ('in_progress', 'starting')
  );

  RETURN json_build_object(
    'success', true,
    'updated_to_ready', v_updated,
    'cancelled', v_cancelled,
    'message', 'Tournament status flow updated'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_tournament_status_flow() TO authenticated;

-- Simple query to test tournament statuses
SELECT 'Tournament status flow functions created successfully!' as status;