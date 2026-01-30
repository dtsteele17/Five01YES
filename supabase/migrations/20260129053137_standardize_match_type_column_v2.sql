/*
  # Standardize match_type Column v2

  ## Overview
  This migration standardizes the use of match_type column for determining match types:
  - `match_type` = 'ranked', 'quick', 'private', 'tournament' (match type)
  - `match_format` = 'best-of-1', 'best-of-3', etc. (match format only)
  - `game_mode` = 301 or 501 (starting score only)

  ## Changes Made

  ### 1. match_rooms Table
  - Drop existing constraints first
  - Sync match_type with source values
  - Add new constraints
  
  ### 2. Update RPC Functions
  - Update rpc_ranked_enqueue() to set match_type correctly

  ## Notes
  - match_type is now the canonical field for match type
  - source column is maintained for backward compatibility
*/

-- ============================================================
-- 1. DROP EXISTING CONSTRAINTS FIRST
-- ============================================================

ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_match_type_check;
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_match_format_check;
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_source_check;

-- ============================================================
-- 2. SYNC match_type WITH source VALUES
-- ============================================================

-- Update match_type to match source values where they differ
UPDATE match_rooms
SET match_type = source
WHERE source IS NOT NULL AND (match_type != source OR match_type IS NULL);

-- Set default for any NULL match_type
UPDATE match_rooms
SET match_type = 'quick'
WHERE match_type IS NULL;

-- Also ensure source is set where match_type exists
UPDATE match_rooms
SET source = match_type
WHERE source IS NULL AND match_type IS NOT NULL;

-- ============================================================
-- 3. ADD CONSTRAINTS
-- ============================================================

-- Make match_type NOT NULL
ALTER TABLE match_rooms
ALTER COLUMN match_type SET NOT NULL;

-- Add constraint to ensure match_type has valid values
ALTER TABLE match_rooms
ADD CONSTRAINT match_rooms_match_type_check
CHECK (match_type IN ('quick', 'ranked', 'private', 'tournament'));

-- Keep source constraint for backward compatibility
ALTER TABLE match_rooms
ADD CONSTRAINT match_rooms_source_check
CHECK (source IN ('quick', 'ranked', 'private', 'tournament'));

-- Ensure match_format only contains format values, never match types
ALTER TABLE match_rooms
ADD CONSTRAINT match_rooms_match_format_check
CHECK (match_format IN ('best-of-1', 'best-of-3', 'best-of-5', 'best-of-7', 'best-of-9'));

-- ============================================================
-- 4. UPDATE rpc_ranked_enqueue() TO USE match_type
-- ============================================================

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
    -- Create match room with match_type = 'ranked'
    INSERT INTO match_rooms (
      player1_id,
      player2_id,
      game_mode,
      match_format,
      match_type,
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
      'ranked',
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
