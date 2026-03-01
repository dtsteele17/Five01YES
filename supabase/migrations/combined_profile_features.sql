-- ============================================================================
-- COMBINED PROFILE FEATURES MIGRATION
-- ============================================================================
--
-- This migration adds all the missing columns and functions needed for:
-- 1. Profile editing with bio and display name change tracking
-- 2. AFK forfeit functionality 
-- 3. Public profile search
--
-- Run this entire block in your Supabase SQL Editor
-- ============================================================================

-- Add bio column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    ALTER TABLE profiles ADD COLUMN bio text;
  END IF;
END $$;

-- Add location column if it doesn't exist  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'location'
  ) THEN
    ALTER TABLE profiles ADD COLUMN location text;
  END IF;
END $$;

-- Add last_display_name_change column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_display_name_change'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_display_name_change timestamptz;
  END IF;
END $$;

-- ============================================================================
-- AFK FORFEIT RPC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_forfeit_afk_opponent(match_room_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room_data record;
  current_user_id uuid;
  opponent_user_id uuid;
  result json;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get room data
  SELECT * INTO room_data FROM match_rooms WHERE id = match_room_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Determine opponent
  IF room_data.player1_id = current_user_id THEN
    opponent_user_id := room_data.player2_id;
  ELSIF room_data.player2_id = current_user_id THEN
    opponent_user_id := room_data.player1_id;
  ELSE
    RETURN json_build_object('success', false, 'error', 'Not a player in this match');
  END IF;

  -- Check if match is active
  IF room_data.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not active');
  END IF;

  -- Update match room - forfeit opponent
  UPDATE match_rooms 
  SET 
    status = 'finished',
    winner_id = current_user_id,
    updated_at = now()
  WHERE id = match_room_id;

  -- Update or create match history for current user (winner)
  INSERT INTO match_history (
    id, room_id, user_id, opponent_id, game_mode, match_format, 
    result, legs_won, legs_lost, created_at, played_at
  ) VALUES (
    gen_random_uuid(), match_room_id, current_user_id, opponent_user_id,
    room_data.starting_score, 'quick', 'win', 
    COALESCE(room_data.player1_legs, 0) + 1, COALESCE(room_data.player2_legs, 0),
    now(), now()
  ) ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = 'win',
    legs_won = COALESCE(match_history.legs_won, 0) + 1,
    updated_at = now();

  -- Update or create match history for opponent (loser)  
  INSERT INTO match_history (
    id, room_id, user_id, opponent_id, game_mode, match_format,
    result, legs_won, legs_lost, created_at, played_at
  ) VALUES (
    gen_random_uuid(), match_room_id, opponent_user_id, current_user_id,
    room_data.starting_score, 'quick', 'loss',
    COALESCE(room_data.player2_legs, 0), COALESCE(room_data.player1_legs, 0) + 1,
    now(), now()
  ) ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = 'loss', 
    legs_lost = COALESCE(match_history.legs_lost, 0) + 1,
    updated_at = now();

  RETURN json_build_object('success', true, 'winner_id', current_user_id);
END;
$$;

-- ============================================================================
-- USER SEARCH RPC FUNCTION  
-- ============================================================================

CREATE OR REPLACE FUNCTION rpc_search_users(search_term text, limit_count integer DEFAULT 10)
RETURNS TABLE(
  user_id uuid,
  username text, 
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.user_id,
    p.username,
    p.display_name, 
    p.avatar_url
  FROM profiles p
  WHERE 
    (p.username ILIKE '%' || search_term || '%' OR 
     p.display_name ILIKE '%' || search_term || '%')
    AND p.username IS NOT NULL
    AND p.display_name IS NOT NULL
  ORDER BY 
    CASE 
      WHEN p.username ILIKE search_term || '%' THEN 1
      WHEN p.display_name ILIKE search_term || '%' THEN 2  
      WHEN p.username ILIKE '%' || search_term || '%' THEN 3
      ELSE 4
    END,
    p.username
  LIMIT limit_count;
END;
$$;

-- ============================================================================
-- PUBLIC PROFILES READ POLICY
-- ============================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON profiles;

-- Create new policy for public profile access
CREATE POLICY "Public profiles are viewable by authenticated users"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify all columns exist
DO $$
DECLARE
  missing_columns text[] := '{}';
BEGIN
  -- Check for bio column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'bio'
  ) THEN
    missing_columns := array_append(missing_columns, 'bio');
  END IF;
  
  -- Check for location column  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'location'
  ) THEN
    missing_columns := array_append(missing_columns, 'location');
  END IF;
  
  -- Check for last_display_name_change column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'last_display_name_change'
  ) THEN
    missing_columns := array_append(missing_columns, 'last_display_name_change');
  END IF;
  
  -- Report results
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE NOTICE 'WARNING: Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'SUCCESS: All profile columns exist';
  END IF;
  
  -- Check functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_forfeit_afk_opponent') THEN
    RAISE NOTICE 'SUCCESS: rpc_forfeit_afk_opponent function created';
  ELSE
    RAISE NOTICE 'ERROR: rpc_forfeit_afk_opponent function missing';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_search_users') THEN
    RAISE NOTICE 'SUCCESS: rpc_search_users function created';  
  ELSE
    RAISE NOTICE 'ERROR: rpc_search_users function missing';
  END IF;
END $$;