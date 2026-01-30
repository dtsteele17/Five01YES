/*
  # Fix rpc_ranked_poll Response Format

  ## Overview
  Update rpc_ranked_poll to return the expected response format:
  - Add `ok: true` field for success indicator
  - Include `queue_id` in response
  - Include `matched_at` timestamp
  - Ensure all fields match frontend expectations

  ## Changes Made
  - Drop and recreate rpc_ranked_poll with updated return format
  - Response format: { ok: true, queue_id: uuid, status: text, match_room_id: uuid|null, matched_at: timestamp|null }
*/

DROP FUNCTION IF EXISTS rpc_ranked_poll(uuid);

CREATE FUNCTION rpc_ranked_poll(p_queue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_match_room_id uuid;
  v_matched_at timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get queue entry
  SELECT status, match_room_id, matched_at
  INTO v_status, v_match_room_id, v_matched_at
  FROM ranked_queue
  WHERE id = p_queue_id
    AND player_id = v_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'ok', false,
      'status', 'not_found',
      'message', 'Queue entry not found'
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'queue_id', p_queue_id,
    'status', v_status,
    'match_room_id', v_match_room_id,
    'matched_at', v_matched_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_ranked_poll(uuid) TO authenticated;
