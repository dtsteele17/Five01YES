/*
  # Debug League Access - Check What's Blocking

  This creates a simple function to debug why league access is failing
*/

-- Function to check league access for current user
CREATE OR REPLACE FUNCTION debug_league_access(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_league record;
  v_is_member boolean;
  v_is_owner boolean;
  v_member_count integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated', 'user_id', NULL);
  END IF;

  -- Get league data
  SELECT * INTO v_league
  FROM leagues
  WHERE id = p_league_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'League not found in database', 'league_id', p_league_id);
  END IF;

  -- Check if user is owner
  v_is_owner := (v_league.owner_id = v_user_id);

  -- Check if user is a member
  SELECT COUNT(*) INTO v_member_count
  FROM league_members
  WHERE league_id = p_league_id AND user_id = v_user_id;

  v_is_member := (v_member_count > 0);

  -- Return debug info
  RETURN jsonb_build_object(
    'league_exists', true,
    'league_id', p_league_id,
    'league_name', v_league.name,
    'user_id', v_user_id,
    'owner_id', v_league.owner_id,
    'is_owner', v_is_owner,
    'is_member', v_is_member,
    'member_count', v_member_count,
    'can_access', (v_is_owner OR v_is_member),
    'league_data', jsonb_build_object(
      'id', v_league.id,
      'name', v_league.name,
      'max_participants', v_league.max_participants,
      'access_type', v_league.access_type,
      'start_date', v_league.start_date,
      'match_days', v_league.match_days,
      'match_time', v_league.match_time,
      'games_per_day', v_league.games_per_day,
      'legs_per_game', v_league.legs_per_game,
      'camera_required', v_league.camera_required,
      'playoff_type', v_league.playoff_type
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION debug_league_access(uuid) TO authenticated;
