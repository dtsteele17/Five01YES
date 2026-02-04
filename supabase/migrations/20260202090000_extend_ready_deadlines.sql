/*
  # Extend Tournament Ready Deadlines

  When players arrive late, ready_deadline may already be in the past, causing
  the UI to skip the match and leaving ready_count stuck at 1/2. This updates
  process_ready_deadlines() to reopen the ready window.
*/

DROP FUNCTION IF EXISTS process_ready_deadlines();
CREATE FUNCTION process_ready_deadlines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ready_marked integer := 0;
BEGIN
  -- Move matches into 'ready' state and ensure a fresh ready window
  UPDATE public.tournament_matches
  SET
    status = 'ready',
    ready_open_at = now(),
    ready_deadline = now() + interval '3 minutes',
    updated_at = now()
  WHERE status IN ('ready_check', 'ready')
    AND (ready_deadline IS NULL OR ready_deadline <= now());

  GET DIAGNOSTICS v_ready_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'ready_marked', v_ready_marked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_ready_deadlines() TO authenticated;
