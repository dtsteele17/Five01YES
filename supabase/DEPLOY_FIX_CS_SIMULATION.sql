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
  v_points INT[] := ARRAY[5,3,2,1,0,0,0,0];
  v_idx INT := 1;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  IF v_career.tier < 5 THEN RETURN json_build_object('skip', true); END IF;

  IF NOT EXISTS (SELECT 1 FROM career_champions_series WHERE career_id = p_career_id AND season = v_career.season LIMIT 1) THEN
    RETURN json_build_object('skip', true, 'reason', 'No champions series this season');
  END IF;

  SELECT COUNT(*) INTO v_completed_nights
  FROM career_events WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'champions_series_night' AND status = 'completed';

  IF v_completed_nights >= 8 THEN
    RETURN json_build_object('skip', true, 'reason', 'All nights complete');
  END IF;

  FOR v_cs IN
    SELECT id, player_name, is_player FROM career_champions_series
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

  UPDATE career_events SET status = 'completed'
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'champions_series_night' AND status = 'pending'
    AND sequence_no = 501 + v_completed_nights;

  RETURN json_build_object('success', true, 'night', v_completed_nights + 1);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_simulate_night(UUID) TO authenticated;
