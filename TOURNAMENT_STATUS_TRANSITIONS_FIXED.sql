-- =======================================================
-- TOURNAMENT STATUS TRANSITIONS - FIXED SQL SYNTAX
-- =======================================================

-- Create comprehensive function to handle all tournament status transitions
CREATE OR REPLACE FUNCTION process_tournament_status_transitions()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_results JSON[] := ARRAY[]::JSON[];
  v_tournament_result JSON;
  v_started_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
BEGIN
  
  -- Process tournaments that should transition from registration/scheduled/checkin to in_progress or cancelled
  FOR v_tournament IN 
    SELECT t.*, 
           EXTRACT(EPOCH FROM (NOW() - t.start_at)) as seconds_past_start
    FROM tournaments t 
    WHERE t.status IN ('registration', 'scheduled', 'checkin') 
    AND t.start_at <= NOW()
    ORDER BY t.start_at ASC
  LOOP
    
    -- Count current participants
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id;
    
    IF v_participant_count >= 2 THEN
      -- Enough participants - start tournament
      UPDATE tournaments 
      SET status = 'in_progress',
          started_at = NOW(),
          bracket_generated_at = CASE 
            WHEN bracket_generated_at IS NULL THEN NOW() 
            ELSE bracket_generated_at 
          END
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'started',
        'participant_count', v_participant_count,
        'seconds_past_start', v_tournament.seconds_past_start
      );
      
      v_started_count := v_started_count + 1;
      
    ELSE
      -- Not enough participants - cancel tournament
      UPDATE tournaments 
      SET status = 'cancelled'
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'cancelled',
        'participant_count', v_participant_count,
        'reason', 'insufficient_participants',
        'seconds_past_start', v_tournament.seconds_past_start
      );
      
      v_cancelled_count := v_cancelled_count + 1;
      
    END IF;
    
    v_results := v_results || v_tournament_result;
    
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'timestamp', NOW(),
    'tournaments_started', v_started_count,
    'tournaments_cancelled', v_cancelled_count,
    'total_processed', array_length(v_results, 1),
    'results', v_results
  );
  
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO authenticated;

-- =======================================================
-- INDIVIDUAL TOURNAMENT STATUS CHECK
-- =======================================================

-- Function to check status of a specific tournament
CREATE OR REPLACE FUNCTION check_tournament_status(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  
  -- Get tournament data
  SELECT *, 
         EXTRACT(EPOCH FROM (NOW() - start_at)) as seconds_past_start
  INTO v_tournament
  FROM tournaments 
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- If tournament hasn't reached start time or is already processed, return current status
  IF v_tournament.start_at > NOW() OR v_tournament.status NOT IN ('registration', 'scheduled', 'checkin') THEN
    RETURN json_build_object(
      'success', true,
      'tournament_id', v_tournament.id,
      'status', v_tournament.status,
      'action', 'no_change_needed',
      'start_at', v_tournament.start_at,
      'current_time', NOW()
    );
  END IF;
  
  -- Count participants
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  IF v_participant_count >= 2 THEN
    -- Start tournament
    UPDATE tournaments 
    SET status = 'in_progress',
        started_at = NOW(),
        bracket_generated_at = CASE 
          WHEN bracket_generated_at IS NULL THEN NOW() 
          ELSE bracket_generated_at 
        END
    WHERE id = p_tournament_id;
    
    v_result := json_build_object(
      'success', true,
      'tournament_id', p_tournament_id,
      'action', 'started',
      'new_status', 'in_progress',
      'participant_count', v_participant_count
    );
    
  ELSE
    -- Cancel tournament
    UPDATE tournaments 
    SET status = 'cancelled'
    WHERE id = p_tournament_id;
    
    v_result := json_build_object(
      'success', true,
      'tournament_id', p_tournament_id,
      'action', 'cancelled',
      'new_status', 'cancelled',
      'participant_count', v_participant_count,
      'reason', 'insufficient_participants'
    );
    
  END IF;
  
  RETURN v_result;
  
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_tournament_status(UUID) TO authenticated;

-- =======================================================
-- TEST THE FUNCTIONS
-- =======================================================

-- Test the general status transition function
SELECT process_tournament_status_transitions() as result;

-- Show success message
SELECT 'Tournament status transition functions created successfully!' as message;