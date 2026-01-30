/*
  # Create Ranked Matchmaking RPC Functions

  1. RPC Functions
    - `rpc_ranked_enqueue()` - Add user to ranked queue and attempt to find match
    - `rpc_ranked_poll(queue_id)` - Check if match was found
    - `rpc_ranked_cancel(queue_id)` - Cancel queue entry

  2. Notes
    - Uses existing ranked_queue, ranked_seasons, ranked_player_state tables
    - Matches players based on MMR/RP within a range
    - Creates match_room when match is found
*/

-- Function: Enqueue user for ranked match and attempt to find opponent
CREATE OR REPLACE FUNCTION rpc_ranked_enqueue()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_season_id uuid;
  v_player_rp integer;
  v_queue_id uuid;
  v_opponent_queue_id uuid;
  v_opponent_id uuid;
  v_room_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get active season
  SELECT id INTO v_season_id
  FROM ranked_seasons
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no active season, create one
  IF v_season_id IS NULL THEN
    INSERT INTO ranked_seasons (name, starts_at, ends_at, is_active)
    VALUES (
      'Season 1',
      now(),
      now() + interval '90 days',
      true
    )
    RETURNING id INTO v_season_id;
  END IF;

  -- Get or create player state for this season
  SELECT rp INTO v_player_rp
  FROM ranked_player_state
  WHERE season_id = v_season_id
    AND player_id = v_user_id;

  IF v_player_rp IS NULL THEN
    -- Create new player state with default RP
    INSERT INTO ranked_player_state (
      season_id,
      player_id,
      mmr,
      rp
    ) VALUES (
      v_season_id,
      v_user_id,
      1200,
      1200
    );
    v_player_rp := 1200;
  END IF;

  -- Check if user is already in queue
  SELECT id INTO v_queue_id
  FROM ranked_queue
  WHERE player_id = v_user_id 
    AND season_id = v_season_id
    AND status = 'searching';

  IF v_queue_id IS NOT NULL THEN
    -- User already in queue, return existing entry
    RETURN json_build_object(
      'queue_id', v_queue_id,
      'status', 'searching',
      'message', 'Already in queue'
    );
  END IF;

  -- Clean up old entries for this user (older than 5 minutes)
  DELETE FROM ranked_queue
  WHERE player_id = v_user_id
    AND season_id = v_season_id
    AND status IN ('matched', 'cancelled')
    AND created_at < now() - interval '5 minutes';

  -- Try to find an opponent (within ±300 RP)
  SELECT id, player_id INTO v_opponent_queue_id, v_opponent_id
  FROM ranked_queue
  WHERE status = 'searching'
    AND season_id = v_season_id
    AND player_id != v_user_id
    AND ABS(search_rp - v_player_rp) <= 300
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- If opponent found, create match
  IF v_opponent_id IS NOT NULL THEN
    -- Create match room
    INSERT INTO match_rooms (
      player1_id,
      player2_id,
      game_mode,
      match_format,
      status,
      legs_to_win,
      player1_remaining,
      player2_remaining,
      current_turn,
      source
    ) VALUES (
      v_user_id,
      v_opponent_id,
      501,
      'best-of-5',
      'waiting',
      3,
      501,
      501,
      v_user_id,
      'ranked'
    )
    RETURNING id INTO v_room_id;

    -- Create queue entry for current user (marked as matched)
    INSERT INTO ranked_queue (
      season_id,
      player_id,
      search_rp,
      status,
      match_room_id,
      matched_at
    ) VALUES (
      v_season_id,
      v_user_id,
      v_player_rp,
      'matched',
      v_room_id,
      now()
    )
    RETURNING id INTO v_queue_id;

    -- Update opponent's queue entry
    UPDATE ranked_queue
    SET status = 'matched',
        match_room_id = v_room_id,
        matched_at = now()
    WHERE id = v_opponent_queue_id;

    -- Create ranked match record
    INSERT INTO ranked_matches (
      season_id,
      ranked_room_id,
      player1_id,
      player2_id,
      p1_start_rp,
      p2_start_rp,
      status
    )
    SELECT
      v_season_id,
      v_room_id,
      v_user_id,
      v_opponent_id,
      v_player_rp,
      search_rp,
      'active'
    FROM ranked_queue
    WHERE id = v_opponent_queue_id;

    RETURN json_build_object(
      'queue_id', v_queue_id,
      'status', 'matched',
      'match_room_id', v_room_id,
      'message', 'Match found!'
    );
  ELSE
    -- No opponent found, add to queue
    INSERT INTO ranked_queue (
      season_id,
      player_id,
      search_rp,
      status
    ) VALUES (
      v_season_id,
      v_user_id,
      v_player_rp,
      'searching'
    )
    RETURNING id INTO v_queue_id;

    RETURN json_build_object(
      'queue_id', v_queue_id,
      'status', 'searching',
      'message', 'Searching for opponent...'
    );
  END IF;
END;
$$;

-- Function: Poll for match result
CREATE OR REPLACE FUNCTION rpc_ranked_poll(p_queue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_match_room_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get queue entry
  SELECT status, match_room_id
  INTO v_status, v_match_room_id
  FROM ranked_queue
  WHERE id = p_queue_id
    AND player_id = v_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'status', 'not_found',
      'message', 'Queue entry not found'
    );
  END IF;

  RETURN json_build_object(
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

-- Function: Cancel ranked queue
CREATE OR REPLACE FUNCTION rpc_ranked_cancel(p_queue_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Update queue entry to cancelled
  UPDATE ranked_queue
  SET status = 'cancelled'
  WHERE id = p_queue_id
    AND player_id = v_user_id
    AND status = 'searching';

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Queue entry not found or already processed'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Cancelled successfully'
  );
END;
$$;
