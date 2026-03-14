DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSON);
DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION rpc_pro_tour_award_ai_points(
  p_career_id UUID,
  p_event_id UUID,
  p_results JSON
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_name TEXT;
  v_placement TEXT;
  v_points INTEGER;
  v_updated INTEGER := 0;
  v_base_points JSONB;
  v_event_subtype TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  v_event_subtype := COALESCE(v_event.event_subtype, 'players_championship');

  v_base_points := CASE v_event_subtype
    WHEN 'players_championship' THEN '{"W":100,"RU":70,"SF":50,"QF":35,"L16":20,"L32":10,"L64":5}'::jsonb
    WHEN 'pro_major' THEN '{"W":200,"RU":140,"SF":100,"QF":70,"L16":40,"L32":20,"L64":10}'::jsonb
    WHEN 'world_series' THEN '{"W":250,"RU":175,"SF":125,"QF":85,"L16":50,"L32":25,"L64":12}'::jsonb
    ELSE '{"W":100,"RU":70,"SF":50,"QF":35,"L16":20,"L32":10,"L64":5}'::jsonb
  END;

  FOR v_name, v_placement IN SELECT key, value#>>'{}' FROM json_each(p_results)
  LOOP
    v_points := COALESCE((v_base_points->>v_placement)::integer, 5);

    UPDATE career_pro_rankings
    SET ranking_points = ranking_points + v_points,
        prev_points = ranking_points,
        points_change = v_points
    WHERE career_id = p_career_id
      AND player_name = v_name
      AND is_player = FALSE;

    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS new_pos
    FROM career_pro_rankings
    WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r
  SET ranking_position = ranked.new_pos
  FROM ranked
  WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'updated', v_updated);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_award_ai_points(UUID, UUID, JSON) TO authenticated;
