DROP FUNCTION IF EXISTS rpc_champions_series_update_ai(UUID, JSON);
DROP FUNCTION IF EXISTS rpc_champions_series_update_ai(UUID, JSONB);

CREATE OR REPLACE FUNCTION rpc_champions_series_update_ai(
  p_career_id UUID,
  p_results JSON
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_name TEXT;
  v_data JSON;
  v_points INT;
  v_updated INT := 0;
  v_points_map JSONB := '{"W":5,"RU":3,"SF":2,"QF":1}'::jsonb;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  FOR v_name, v_data IN SELECT key, value FROM json_each(p_results)
  LOOP
    v_points := COALESCE((v_points_map->>((v_data->>'placement')::text))::int, 0);

    UPDATE career_champions_series SET
      points = points + v_points,
      legs_for = legs_for + COALESCE((v_data->>'legsFor')::int, 0),
      legs_against = legs_against + COALESCE((v_data->>'legsAgainst')::int, 0)
    WHERE career_id = p_career_id
      AND season = v_career.season
      AND player_name = v_name
      AND is_player = FALSE;

    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'updated', v_updated);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_update_ai(UUID, JSON) TO authenticated;
