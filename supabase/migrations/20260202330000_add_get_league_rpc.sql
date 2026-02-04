/*
  # Add RPC Function to Get League (Bypasses RLS)

  This function allows users to fetch league data even if RLS blocks direct access.
  It checks if the user is the owner or a member before returning the league.
*/

CREATE OR REPLACE FUNCTION get_league(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_league record;
  v_is_member boolean;
  v_is_owner boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Get league data
  SELECT * INTO v_league
  FROM leagues
  WHERE id = p_league_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'League not found');
  END IF;

  -- Check if user is owner
  v_is_owner := (v_league.owner_id = v_user_id);

  -- Check if user is a member
  SELECT EXISTS(
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_user_id
  ) INTO v_is_member;

  -- Only return league if user is owner or member
  IF NOT (v_is_owner OR v_is_member) THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  -- Return league data as JSON
  RETURN jsonb_build_object(
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
    'playoff_type', v_league.playoff_type,
    'owner_id', v_league.owner_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_league(uuid) TO authenticated;
