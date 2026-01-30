/*
  # Create RPC function to finalize ranked matches

  1. RPC Function
    - `rpc_ranked_finalize_match(matchRoomId, winner_id, legs_p1, legs_p2)` - Finalize ranked match and update RP

  2. Functionality
    - Update match_rooms with winner_id and status
    - Update ranked_matches with winner and leg counts
    - Calculate RP changes based on outcome
    - Update ranked_player_state for both players
    - Create ranked_rating_history entries
    - Return new RP and division info for both players

  3. RP Calculation
    - Base RP change: ±20
    - Multiplier based on score difference (3-0 = 1.5x, 3-1 = 1.2x, 3-2 = 1.0x)
    - Loser always loses RP, winner always gains RP
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS rpc_ranked_finalize_match(uuid, uuid, integer, integer);

-- Function: Finalize ranked match and update rankings
CREATE OR REPLACE FUNCTION rpc_ranked_finalize_match(
  p_match_room_id uuid,
  p_winner_id uuid,
  p_legs_p1 integer,
  p_legs_p2 integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_season_id uuid;
  v_player1_id uuid;
  v_player2_id uuid;
  v_p1_rp integer;
  v_p2_rp integer;
  v_p1_delta integer;
  v_p2_delta integer;
  v_base_rp integer := 20;
  v_multiplier numeric := 1.0;
  v_p1_new_rp integer;
  v_p2_new_rp integer;
  v_p1_division text;
  v_p2_division text;
  v_ranked_match_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get match room details
  SELECT player1_id, player2_id
  INTO v_player1_id, v_player2_id
  FROM match_rooms
  WHERE id = p_match_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match room not found';
  END IF;

  -- Verify user is a participant
  IF v_user_id != v_player1_id AND v_user_id != v_player2_id THEN
    RAISE EXCEPTION 'Not authorized to finalize this match';
  END IF;

  -- Update match room status
  UPDATE match_rooms
  SET status = 'completed',
      winner_id = p_winner_id,
      updated_at = now()
  WHERE id = p_match_room_id;

  -- Get active season
  SELECT id INTO v_season_id
  FROM ranked_seasons
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No active season found';
  END IF;

  -- Get ranked match record
  SELECT id INTO v_ranked_match_id
  FROM ranked_matches
  WHERE ranked_room_id = p_match_room_id
    AND season_id = v_season_id;

  IF v_ranked_match_id IS NULL THEN
    RAISE EXCEPTION 'Ranked match record not found';
  END IF;

  -- Get current RP for both players
  SELECT rp INTO v_p1_rp
  FROM ranked_player_state
  WHERE season_id = v_season_id
    AND player_id = v_player1_id;

  SELECT rp INTO v_p2_rp
  FROM ranked_player_state
  WHERE season_id = v_season_id
    AND player_id = v_player2_id;

  -- Calculate multiplier based on score difference
  IF ABS(p_legs_p1 - p_legs_p2) = 3 THEN
    v_multiplier := 1.5; -- 3-0 sweep
  ELSIF ABS(p_legs_p1 - p_legs_p2) = 2 THEN
    v_multiplier := 1.2; -- 3-1
  ELSE
    v_multiplier := 1.0; -- 3-2 close match
  END IF;

  -- Calculate RP changes
  IF p_winner_id = v_player1_id THEN
    v_p1_delta := ROUND(v_base_rp * v_multiplier)::integer;
    v_p2_delta := -ROUND(v_base_rp * v_multiplier)::integer;
  ELSE
    v_p1_delta := -ROUND(v_base_rp * v_multiplier)::integer;
    v_p2_delta := ROUND(v_base_rp * v_multiplier)::integer;
  END IF;

  -- Apply RP changes (with floor of 0)
  v_p1_new_rp := GREATEST(0, v_p1_rp + v_p1_delta);
  v_p2_new_rp := GREATEST(0, v_p2_rp + v_p2_delta);

  -- Update ranked match record
  UPDATE ranked_matches
  SET winner_id = p_winner_id,
      legs_p1 = p_legs_p1,
      legs_p2 = p_legs_p2,
      p1_delta = v_p1_delta,
      p2_delta = v_p2_delta,
      status = 'completed',
      completed_at = now()
  WHERE id = v_ranked_match_id;

  -- Update player states
  UPDATE ranked_player_state
  SET rp = v_p1_new_rp,
      games_played = games_played + 1,
      wins = wins + CASE WHEN p_winner_id = v_player1_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN p_winner_id != v_player1_id THEN 1 ELSE 0 END,
      provisional_games_remaining = GREATEST(0, provisional_games_remaining - 1),
      updated_at = now()
  WHERE season_id = v_season_id
    AND player_id = v_player1_id;

  UPDATE ranked_player_state
  SET rp = v_p2_new_rp,
      games_played = games_played + 1,
      wins = wins + CASE WHEN p_winner_id = v_player2_id THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN p_winner_id != v_player2_id THEN 1 ELSE 0 END,
      provisional_games_remaining = GREATEST(0, provisional_games_remaining - 1),
      updated_at = now()
  WHERE season_id = v_season_id
    AND player_id = v_player2_id;

  -- Create rating history entries
  INSERT INTO ranked_rating_history (
    season_id,
    player_id,
    match_id,
    rp_before,
    rp_after,
    delta,
    reason
  ) VALUES (
    v_season_id,
    v_player1_id,
    v_ranked_match_id,
    v_p1_rp,
    v_p1_new_rp,
    v_p1_delta,
    'ranked_match'
  );

  INSERT INTO ranked_rating_history (
    season_id,
    player_id,
    match_id,
    rp_before,
    rp_after,
    delta,
    reason
  ) VALUES (
    v_season_id,
    v_player2_id,
    v_ranked_match_id,
    v_p2_rp,
    v_p2_new_rp,
    v_p2_delta,
    'ranked_match'
  );

  -- Get division names for new RP
  SELECT division_name INTO v_p1_division
  FROM ranked_tiers
  WHERE v_p1_new_rp >= rp_min AND v_p1_new_rp <= rp_max
  LIMIT 1;

  SELECT division_name INTO v_p2_division
  FROM ranked_tiers
  WHERE v_p2_new_rp >= rp_min AND v_p2_new_rp <= rp_max
  LIMIT 1;

  -- Return results
  RETURN json_build_object(
    'success', true,
    'winner_id', p_winner_id,
    'player1', json_build_object(
      'id', v_player1_id,
      'rp_before', v_p1_rp,
      'rp_after', v_p1_new_rp,
      'delta', v_p1_delta,
      'division', COALESCE(v_p1_division, 'Unranked'),
      'legs_won', p_legs_p1
    ),
    'player2', json_build_object(
      'id', v_player2_id,
      'rp_before', v_p2_rp,
      'rp_after', v_p2_new_rp,
      'delta', v_p2_delta,
      'division', COALESCE(v_p2_division, 'Unranked'),
      'legs_won', p_legs_p2
    )
  );
END;
$$;
