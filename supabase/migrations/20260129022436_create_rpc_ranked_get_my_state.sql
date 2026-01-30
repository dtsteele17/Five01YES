/*
  # Create RPC to get user's ranked state

  1. RPC Function
    - `rpc_ranked_get_my_state()` - Get active season and user's ranked player state

  2. Returns
    - season_id, season_name, rp, mmr, games_played, wins, losses, division_name, etc.
*/

-- Function: Get user's ranked state for active season
CREATE OR REPLACE FUNCTION rpc_ranked_get_my_state()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_season_id uuid;
  v_season_name text;
  v_player_state record;
  v_division_name text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get active season
  SELECT id, name INTO v_season_id, v_season_name
  FROM ranked_seasons
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no active season, return null
  IF v_season_id IS NULL THEN
    RETURN json_build_object(
      'season', NULL,
      'player_state', NULL
    );
  END IF;

  -- Get player state for this season
  SELECT * INTO v_player_state
  FROM ranked_player_state
  WHERE season_id = v_season_id
    AND player_id = v_user_id;

  -- If no player state exists, create one with defaults
  IF v_player_state IS NULL THEN
    INSERT INTO ranked_player_state (
      season_id,
      player_id,
      mmr,
      rp,
      games_played,
      wins,
      losses,
      provisional_games_remaining
    ) VALUES (
      v_season_id,
      v_user_id,
      1200,
      1200,
      0,
      0,
      0,
      10
    )
    RETURNING * INTO v_player_state;
  END IF;

  -- Get division name based on RP
  SELECT division_name INTO v_division_name
  FROM ranked_tiers
  WHERE v_player_state.rp >= rp_min AND v_player_state.rp <= rp_max
  LIMIT 1;

  -- Return combined data
  RETURN json_build_object(
    'season', json_build_object(
      'id', v_season_id,
      'name', v_season_name
    ),
    'player_state', json_build_object(
      'season_id', v_player_state.season_id,
      'player_id', v_player_state.player_id,
      'rp', v_player_state.rp,
      'mmr', v_player_state.mmr,
      'games_played', v_player_state.games_played,
      'wins', v_player_state.wins,
      'losses', v_player_state.losses,
      'provisional_games_remaining', v_player_state.provisional_games_remaining,
      'division_name', COALESCE(v_division_name, 'Unranked')
    )
  );
END;
$$;
