-- Fix: rpc_champions_series_night_complete should ONLY update the player's CS standings.
-- AI updates are handled client-side via rpc_champions_series_update_ai with actual bracket results.

DROP FUNCTION IF EXISTS rpc_champions_series_night_complete(UUID, UUID, TEXT, INT, INT);
CREATE OR REPLACE FUNCTION rpc_champions_series_night_complete(
  p_career_id UUID,
  p_event_id UUID,
  p_player_result TEXT,
  p_player_legs_for INT,
  p_player_legs_against INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_night_points INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  v_night_points := CASE p_player_result
    WHEN 'winner' THEN 5
    WHEN 'runner_up' THEN 3
    WHEN 'semi' THEN 2
    WHEN 'qf' THEN 1
    ELSE 0
  END;

  -- Update ONLY the player's CS standings
  UPDATE career_champions_series SET
    points = points + v_night_points,
    legs_for = legs_for + p_player_legs_for,
    legs_against = legs_against + p_player_legs_against
  WHERE career_id = p_career_id AND season = v_career.season AND is_player = TRUE;

  -- Mark event completed
  UPDATE career_events SET status = 'completed' WHERE id = p_event_id;

  RETURN json_build_object('success', true, 'points_earned', v_night_points, 'result', p_player_result);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_night_complete(UUID, UUID, TEXT, INT, INT) TO authenticated;

-- Also update the QF points to 1 in the AI update function
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

-- Also fix the simulate night function (for AI-only CS nights when player isn't in a CS match)
-- QF should give 1 point, not 0
DROP FUNCTION IF EXISTS rpc_champions_series_simulate_night(UUID);
CREATE OR REPLACE FUNCTION rpc_champions_series_simulate_night(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_completed_nights INT;
  v_cs RECORD;
  v_idx INT := 1;
  v_points INT[] := ARRAY[5,3,2,1,0,0,0,0];
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'not found'); END IF;

  SELECT COUNT(*) INTO v_completed_nights FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'champions_series_night' AND status = 'completed';

  FOR v_cs IN
    SELECT id FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season
    ORDER BY md5(id::text || v_completed_nights::text)
  LOOP
    IF v_idx <= array_length(v_points, 1) THEN
      UPDATE career_champions_series SET
        points = points + v_points[v_idx],
        legs_for = legs_for + 3 + (ascii(md5(id::text || v_completed_nights::text || v_idx::text)) % 8),
        legs_against = legs_against + 2 + (ascii(md5(id::text || v_completed_nights::text || 'a' || v_idx::text)) % 6)
      WHERE id = v_cs.id;
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'night', v_completed_nights + 1);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_simulate_night(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
