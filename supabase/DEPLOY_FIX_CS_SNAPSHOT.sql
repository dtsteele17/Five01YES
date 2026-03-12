DROP FUNCTION IF EXISTS rpc_champions_series_snapshot_top8(UUID);
CREATE OR REPLACE FUNCTION rpc_champions_series_snapshot_top8(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_count INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT COUNT(*) INTO v_count FROM career_champions_series
  WHERE career_id = p_career_id AND season = v_career.season;

  IF v_count >= 8 THEN
    RETURN json_build_object('already_snapshotted', true, 'count', v_count);
  END IF;

  DELETE FROM career_champions_series WHERE career_id = p_career_id AND season = v_career.season;

  INSERT INTO career_champions_series (career_id, season, player_name, is_player, ranking_at_qualification, points, legs_for, legs_against)
  SELECT p_career_id, v_career.season, player_name, is_player, ranking_position, 0, 0, 0
  FROM career_pro_rankings
  WHERE career_id = p_career_id
  ORDER BY ranking_points DESC
  LIMIT 8;

  RETURN json_build_object('success', true, 'season', v_career.season);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_snapshot_top8(UUID) TO authenticated;
