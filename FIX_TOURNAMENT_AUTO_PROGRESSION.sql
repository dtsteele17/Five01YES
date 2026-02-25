-- =======================================================
-- FIX TOURNAMENT AUTO-PROGRESSION - DARTCOUNTER.NET STYLE
-- =======================================================

-- This SQL file fixes the critical issue where tournaments scheduled for 7pm
-- were not automatically moving to "Live Now" or being cancelled at 7:16pm

-- DROP existing functions to ensure clean slate
DROP FUNCTION IF EXISTS process_tournament_status_transitions();
DROP FUNCTION IF EXISTS check_tournament_status(UUID);

-- Create comprehensive tournament status transition function
CREATE OR REPLACE FUNCTION process_tournament_status_transitions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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
    WHERE tournament_id = v_tournament.id
    AND status_type = 'confirmed';
    
    IF v_participant_count >= 2 THEN
      -- SUFFICIENT PARTICIPANTS - START TOURNAMENT
      
      -- Generate bracket if not already generated
      IF v_tournament.bracket_generated_at IS NULL THEN
        -- Generate bracket using existing function
        PERFORM generate_tournament_bracket(v_tournament.id);
      END IF;
      
      -- Start tournament
      UPDATE tournaments 
      SET status = 'in_progress',
          started_at = NOW()
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
      -- INSUFFICIENT PARTICIPANTS - CANCEL TOURNAMENT
      UPDATE tournaments 
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = 'Insufficient participants (minimum 2 required)'
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'cancelled',
        'reason', 'Insufficient participants',
        'participant_count', v_participant_count,
        'seconds_past_start', v_tournament.seconds_past_start
      );
      
      v_cancelled_count := v_cancelled_count + 1;
    END IF;
    
    v_results := v_results || v_tournament_result;
  END LOOP;
  
  -- Also check tournaments that are 5+ minutes past start and still in checkin
  FOR v_tournament IN
    SELECT t.*,
           EXTRACT(EPOCH FROM (NOW() - t.start_at)) as seconds_past_start
    FROM tournaments t 
    WHERE t.status = 'checkin'
    AND t.start_at <= NOW() - INTERVAL '5 minutes'
  LOOP
    
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id
    AND status_type = 'confirmed';
    
    IF v_participant_count >= 2 THEN
      -- Force start late tournament
      IF v_tournament.bracket_generated_at IS NULL THEN
        PERFORM generate_tournament_bracket(v_tournament.id);
      END IF;
      
      UPDATE tournaments 
      SET status = 'in_progress',
          started_at = NOW()
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'force_started',
        'participant_count', v_participant_count,
        'seconds_past_start', v_tournament.seconds_past_start,
        'note', 'Started late due to extended checkin'
      );
      
      v_started_count := v_started_count + 1;
    ELSE
      -- Cancel late tournament
      UPDATE tournaments 
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = 'Insufficient participants after extended checkin'
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'cancelled_late',
        'reason', 'Insufficient participants after extended checkin',
        'participant_count', v_participant_count,
        'seconds_past_start', v_tournament.seconds_past_start
      );
      
      v_cancelled_count := v_cancelled_count + 1;
    END IF;
    
    v_results := v_results || v_tournament_result;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'processed_at', NOW(),
    'tournaments_started', v_started_count,
    'tournaments_cancelled', v_cancelled_count,
    'total_processed', v_started_count + v_cancelled_count,
    'details', v_results
  );
END;
$$;

-- Create individual tournament status check function (for frontend use)
CREATE OR REPLACE FUNCTION check_tournament_status(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_current_time TIMESTAMP WITH TIME ZONE;
  v_action TEXT := 'no_change_needed';
BEGIN
  v_current_time := NOW();
  
  SELECT * INTO v_tournament 
  FROM tournaments 
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Tournament not found',
      'tournament_id', p_tournament_id
    );
  END IF;
  
  -- Only process if tournament should be starting or has started
  IF v_tournament.status IN ('registration', 'scheduled', 'checkin') 
     AND v_tournament.start_at <= v_current_time THEN
    
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = p_tournament_id
    AND status_type = 'confirmed';
    
    IF v_participant_count >= 2 THEN
      -- Start tournament
      IF v_tournament.bracket_generated_at IS NULL THEN
        PERFORM generate_tournament_bracket(p_tournament_id);
      END IF;
      
      UPDATE tournaments 
      SET status = 'in_progress',
          started_at = v_current_time
      WHERE id = p_tournament_id;
      
      v_action := 'started';
    ELSE
      -- Cancel tournament
      UPDATE tournaments 
      SET status = 'cancelled',
          cancelled_at = v_current_time,
          cancellation_reason = 'Insufficient participants'
      WHERE id = p_tournament_id;
      
      v_action := 'cancelled';
    END IF;
  END IF;
  
  -- Return updated tournament status
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'status', v_tournament.status,
    'action', v_action,
    'participant_count', COALESCE(v_participant_count, 0),
    'start_at', v_tournament.start_at,
    'current_time', v_current_time
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO authenticated;
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO service_role;
GRANT EXECUTE ON FUNCTION check_tournament_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_tournament_status(UUID) TO service_role;

-- Create a pg_cron job to run tournament status transitions every 2 minutes
-- NOTE: This requires the pg_cron extension and superuser privileges
-- Run this manually in Supabase SQL editor if you have the permissions:

/*
SELECT cron.schedule(
  'tournament-status-transitions',
  '*/2 * * * *',  -- Every 2 minutes
  'SELECT process_tournament_status_transitions();'
);
*/

-- Alternative: Create a simple RPC function that can be called by cron job or manually
CREATE OR REPLACE FUNCTION run_tournament_cron()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN process_tournament_status_transitions();
END;
$$;

GRANT EXECUTE ON FUNCTION run_tournament_cron() TO authenticated;
GRANT EXECUTE ON FUNCTION run_tournament_cron() TO service_role;

-- Test the function immediately (uncomment to run)
-- SELECT process_tournament_status_transitions();