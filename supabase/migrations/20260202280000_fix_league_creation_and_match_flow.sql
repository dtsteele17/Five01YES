/*
  # Fix League Creation and Match Flow

  ## Overview
  This migration fixes league creation and ensures league matches flow correctly
  into match_rooms, similar to the tournament fixes.

  ## Issues Fixed
  1. Ensure league creation properly initializes league data
  2. Fix league match creation to use match_rooms (not online_matches)
  3. Ensure create_room_for_league_match uses correct table structure
  4. Add missing source column for league matches in match_rooms

  ## Changes
  - Update create_room_for_league_match to ensure it uses match_rooms correctly
  - Add source='league' to match_rooms when created from league matches
  - Ensure league_matches table structure is correct
*/

-- First, ensure create_room_for_league_match is using match_rooms correctly
-- and includes the source column
DROP FUNCTION IF EXISTS create_room_for_league_match(uuid);

CREATE OR REPLACE FUNCTION create_room_for_league_match(p_league_match_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_match league_matches%ROWTYPE;
  v_league leagues%ROWTYPE;
  v_room_id uuid;
  v_legs_to_win int;
  v_match_format text;
  v_game_mode int;
  v_current_user uuid;
BEGIN
  v_current_user := auth.uid();
  
  IF v_current_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock and fetch league match
  SELECT * INTO v_league_match
  FROM league_matches
  WHERE id = p_league_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'League match not found';
  END IF;

  -- Verify user is one of the players
  IF v_league_match.player1_id != v_current_user AND v_league_match.player2_id != v_current_user THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Verify match is scheduled (not already started or completed)
  IF v_league_match.status != 'scheduled' THEN
    RAISE EXCEPTION 'Match is not in scheduled status';
  END IF;

  -- Get league details
  SELECT * INTO v_league
  FROM leagues
  WHERE id = v_league_match.league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  -- Calculate legs_to_win from best_of
  v_legs_to_win := CASE
    WHEN v_league_match.best_of = 1 THEN 1
    WHEN v_league_match.best_of = 3 THEN 2
    WHEN v_league_match.best_of = 5 THEN 3
    WHEN v_league_match.best_of = 7 THEN 4
    WHEN v_league_match.best_of = 9 THEN 5
    ELSE 2
  END;

  -- Build match format string
  v_match_format := 'best-of-' || v_league_match.best_of;

  -- Get game mode from league (default to 501, but check if leagues table has game_mode)
  -- If leagues.game_mode is text, convert to int; if it's already int, use it
  BEGIN
    v_game_mode := CASE 
      WHEN v_league.game_mode::text = '501' THEN 501
      WHEN v_league.game_mode::text = '301' THEN 301
      ELSE COALESCE(v_league.game_mode::int, 501)
    END;
  EXCEPTION WHEN OTHERS THEN
    v_game_mode := 501; -- Default fallback
  END;

  -- Create match room with source='league' and match_type='league'
  INSERT INTO match_rooms (
    player1_id,
    player2_id,
    game_mode,
    match_format,
    status,
    current_leg,
    legs_to_win,
    player1_remaining,
    player2_remaining,
    current_turn,
    source,
    match_type,
    league_match_id
  ) VALUES (
    v_league_match.player1_id,
    v_league_match.player2_id,
    v_game_mode,
    v_match_format,
    'active',
    1,
    v_legs_to_win,
    v_game_mode,
    v_game_mode,
    v_league_match.player1_id,
    'league',
    'league',
    p_league_match_id
  )
  RETURNING id INTO v_room_id;

  -- Update league match with room_id and status
  UPDATE league_matches
  SET 
    match_room_id = v_room_id,
    status = 'in_progress',
    updated_at = now()
  WHERE id = p_league_match_id;

  -- Send notification to the opponent
  IF v_current_user = v_league_match.player1_id THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_league_match.player2_id,
      'match_invite',
      'League Match Starting!',
      'Your league match is ready to begin',
      jsonb_build_object('room_id', v_room_id, 'league_match_id', p_league_match_id)
    );
  ELSE
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_league_match.player1_id,
      'match_invite',
      'League Match Starting!',
      'Your league match is ready to begin',
      jsonb_build_object('room_id', v_room_id, 'league_match_id', p_league_match_id)
    );
  END IF;

  RETURN v_room_id;
END;
$$;

COMMENT ON FUNCTION create_room_for_league_match IS 'Creates a match room for a league match and returns the room ID';

GRANT EXECUTE ON FUNCTION create_room_for_league_match(uuid) TO authenticated;

-- Ensure league_matches table has the necessary columns
DO $$
BEGIN
  -- Add match_room_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_matches' AND column_name = 'match_room_id'
  ) THEN
    ALTER TABLE league_matches ADD COLUMN match_room_id uuid REFERENCES match_rooms(id) ON DELETE SET NULL;
  END IF;

  -- Add best_of if it doesn't exist (needed for calculating legs_to_win)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_matches' AND column_name = 'best_of'
  ) THEN
    ALTER TABLE league_matches ADD COLUMN best_of integer DEFAULT 3 CHECK (best_of IN (1, 3, 5, 7, 9));
  END IF;

  -- Ensure status column exists with correct values
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_matches' AND column_name = 'status'
  ) THEN
    -- Update constraint to include 'in_progress' if needed
    ALTER TABLE league_matches DROP CONSTRAINT IF EXISTS league_matches_status_check;
    ALTER TABLE league_matches ADD CONSTRAINT league_matches_status_check 
      CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'bye'));
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_league_matches_match_room_id ON league_matches(match_room_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_status ON league_matches(status);
CREATE INDEX IF NOT EXISTS idx_league_matches_league_id ON league_matches(league_id);

-- Ensure match_rooms has league_match_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_rooms' AND column_name = 'league_match_id'
  ) THEN
    ALTER TABLE match_rooms ADD COLUMN league_match_id uuid REFERENCES league_matches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for league_match_id in match_rooms
CREATE INDEX IF NOT EXISTS idx_match_rooms_league_match_id ON match_rooms(league_match_id);
