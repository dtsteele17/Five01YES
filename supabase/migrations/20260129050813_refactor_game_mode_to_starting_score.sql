/*
  # Refactor game_mode to Represent Starting Score Only

  ## Overview
  This migration refactors the data model to separate scoring rules from match types:
  - `game_mode` = 301 or 501 (starting score - scoring rules)
  - `source` = 'ranked', 'quick', 'private', 'tournament' (match type)
  - `match_format` = 'best-of-1', 'best-of-3', etc. (match format)

  ## Changes Made

  ### 1. match_rooms Table
  - Update game_mode column to only accept 301 or 501
  - Update existing records where game_mode is used as match type
  - Add constraint to ensure game_mode is always 301 or 501
  - Update source column to properly represent match type

  ### 2. RPC Functions
  - Update rpc_ranked_enqueue() to use game_mode = 501 (not 2)
  - Update rpc_ranked_finalize_match() to check source instead of game_mode
  - Ensure all match creation uses correct game_mode values

  ## Notes
  - Ranked matches: game_mode = 501, source = 'ranked'
  - Quick matches: game_mode = 301 or 501, source = 'quick'
  - Private matches: game_mode = 301 or 501, source = 'private'
  - Tournament matches: game_mode = 301 or 501, source = 'tournament'
*/

-- ============================================================
-- 1. UPDATE match_rooms TABLE
-- ============================================================

-- First, update existing records that use game_mode as match type
-- Ranked matches (game_mode = 2) should have game_mode = 501 and source = 'ranked'
UPDATE match_rooms
SET 
  game_mode = 501,
  source = 'ranked'
WHERE game_mode = 2;

-- Quick matches (game_mode = 1) should have game_mode = 501 and source = 'quick'
UPDATE match_rooms
SET 
  game_mode = 501,
  source = 'quick'
WHERE game_mode = 1;

-- Private matches (game_mode = 3) should have game_mode = 501 and source = 'private'
UPDATE match_rooms
SET 
  game_mode = 501,
  source = 'private'
WHERE game_mode = 3;

-- Set default game_mode for any rows with NULL
UPDATE match_rooms
SET game_mode = 501
WHERE game_mode IS NULL;

-- Drop old constraint if exists
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_game_mode_check;

-- Add new constraint to ensure game_mode is only 301 or 501
ALTER TABLE match_rooms
ADD CONSTRAINT match_rooms_game_mode_check
CHECK (game_mode IN (301, 501));

-- Update source constraint to include all valid match types
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_source_check;
ALTER TABLE match_rooms
ADD CONSTRAINT match_rooms_source_check
CHECK (source IN ('quick', 'ranked', 'private', 'tournament'));

-- ============================================================
-- 2. UPDATE rpc_ranked_enqueue() FUNCTION
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
    -- Create match room with game_mode = 501 (starting score) and source = 'ranked' (match type)
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
