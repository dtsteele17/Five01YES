/*
  # Create RPC function for league creation

  ## Overview
  Creates a stored procedure that allows authenticated users to create a new league
  with all necessary settings in a single transaction.

  ## New Functions
  - `rpc_create_league` - Creates a league and automatically adds the creator as owner

  ## Parameters (JSON)
  - name (text) - League name
  - max_participants (integer) - Maximum number of participants
  - access_type (text) - 'open' or 'invite'
  - start_date (date) - League start date
  - match_days (integer[]) - Days of week (0=Sunday, 6=Saturday)
  - match_time (time) - Match time
  - games_per_day (integer) - Number of games per day
  - legs_per_game (integer) - Number of legs per game
  - camera_required (boolean) - Whether camera is required
  - playoff_type (text) - 'none', 'top2_final', 'top4', or 'top8'

  ## Returns
  - league_id (uuid) - The ID of the created league

  ## Security
  - Function is SECURITY DEFINER to allow RLS bypass for insertion
  - Only authenticated users can call this function
  - Creator is automatically added as league owner in league_members
*/

-- Create the RPC function to create a league
CREATE OR REPLACE FUNCTION rpc_create_league(
  p_name text,
  p_max_participants integer,
  p_access_type text,
  p_start_date date,
  p_match_days integer[],
  p_match_time time,
  p_games_per_day integer,
  p_legs_per_game integer,
  p_camera_required boolean,
  p_playoff_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_id uuid;
  v_user_id uuid;
BEGIN
  -- Get the authenticated user's ID
  v_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate access_type
  IF p_access_type NOT IN ('open', 'invite') THEN
    RAISE EXCEPTION 'Invalid access_type: must be open or invite';
  END IF;

  -- Validate playoff_type
  IF p_playoff_type NOT IN ('none', 'top2_final', 'top4', 'top8') THEN
    RAISE EXCEPTION 'Invalid playoff_type: must be none, top2_final, top4, or top8';
  END IF;

  -- Validate match_days (0-6 for Sunday-Saturday)
  IF array_length(p_match_days, 1) IS NULL OR array_length(p_match_days, 1) = 0 THEN
    RAISE EXCEPTION 'At least one match day must be selected';
  END IF;

  -- Create the league
  INSERT INTO leagues (
    owner_id,
    name,
    max_participants,
    access_type,
    start_date,
    match_days,
    match_time,
    games_per_day,
    legs_per_game,
    camera_required,
    playoff_type
  ) VALUES (
    v_user_id,
    p_name,
    p_max_participants,
    p_access_type,
    p_start_date,
    p_match_days,
    p_match_time,
    p_games_per_day,
    p_legs_per_game,
    p_camera_required,
    p_playoff_type
  )
  RETURNING id INTO v_league_id;

  -- Add creator as league owner in league_members
  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league_id, v_user_id, 'owner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN v_league_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION rpc_create_league(text, integer, text, date, integer[], time, integer, integer, boolean, text) TO authenticated;
