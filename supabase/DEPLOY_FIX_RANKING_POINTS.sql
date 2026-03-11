ALTER TABLE career_events ADD COLUMN IF NOT EXISTS event_subtype TEXT;

UPDATE career_events ce SET event_subtype = t.event_subtype
FROM career_schedule_templates t
WHERE ce.template_id = t.id AND ce.event_subtype IS NULL AND t.event_subtype IS NOT NULL;

DROP FUNCTION IF EXISTS rpc_pro_tour_award_points(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION rpc_pro_tour_award_points(
  p_career_id UUID,
  p_event_id UUID,
  p_placement TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_metadata JSONB;
  v_rating_table JSONB;
  v_player_points NUMERIC;
  v_player_rank INT;
  v_expected TEXT;
  v_point_change NUMERIC;
  v_ai RECORD;
  v_ai_placement TEXT;
  v_ai_points NUMERIC;
  v_ai_expected TEXT;
  v_ai_base_change NUMERIC;
  v_placement_order TEXT[] := ARRAY['L128','L64','L32','L16','QF','SF','RU','W'];
  v_player_place_idx INT;
  v_expected_idx INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  IF v_event.template_id IS NOT NULL THEN
    SELECT (metadata)::jsonb INTO v_metadata FROM career_schedule_templates WHERE id = v_event.template_id;
  END IF;

  IF v_metadata IS NULL AND v_event.event_subtype IS NOT NULL THEN
    SELECT (metadata)::jsonb INTO v_metadata FROM career_schedule_templates
      WHERE tier = 5 AND event_subtype = v_event.event_subtype LIMIT 1;
  END IF;

  IF v_metadata IS NULL THEN
    SELECT (metadata)::jsonb INTO v_metadata FROM career_schedule_templates
      WHERE tier = 5 AND event_type = v_event.event_type LIMIT 1;
  END IF;

  IF v_metadata IS NULL THEN
    v_metadata := '{"rating_table":{"L128":2,"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'::jsonb;
  END IF;

  v_rating_table := v_metadata->'rating_table';
  v_player_points := COALESCE((v_rating_table->>p_placement)::numeric, 0);

  SELECT ranking_position, expected_round INTO v_player_rank, v_expected
  FROM career_pro_rankings WHERE career_id = p_career_id AND is_player = TRUE;

  v_player_place_idx := array_position(v_placement_order, p_placement);
  IF v_player_place_idx IS NULL THEN v_player_place_idx := 0; END IF;

  v_point_change := v_player_points;

  IF v_expected IS NOT NULL THEN
    v_expected_idx := array_position(v_placement_order, v_expected);
    IF v_expected_idx IS NOT NULL AND v_player_place_idx < v_expected_idx THEN
      DECLARE
        v_diff INT := v_expected_idx - v_player_place_idx;
        v_penalty NUMERIC;
      BEGIN
        v_penalty := v_diff * 8;
        v_point_change := v_point_change - v_penalty;
      END;
    END IF;
  END IF;

  UPDATE career_pro_rankings SET
    ranking_points = GREATEST(0, ranking_points + v_point_change),
    expected_round = CASE
      WHEN ranking_position <= 10 THEN 'L16'
      WHEN ranking_position <= 25 THEN 'L32'
      WHEN ranking_position <= 60 THEN 'L64'
      ELSE NULL
    END
  WHERE career_id = p_career_id AND is_player = TRUE;

  FOR v_ai IN
    SELECT id, ranking_position, expected_round AS exp_round
    FROM career_pro_rankings
    WHERE career_id = p_career_id AND is_player = FALSE
  LOOP
    DECLARE
      v_bracket_size INT;
      v_ai_placements_64 TEXT[] := ARRAY[
        'L64','L64','L64','L64','L64','L64','L64','L64','L64','L64',
        'L64','L64','L64','L64','L64',
        'L32','L32','L32','L32','L32','L32','L32',
        'L16','L16','L16','L16',
        'QF','QF','QF',
        'SF','SF',
        'RU'
      ];
      v_ai_placements_128 TEXT[] := ARRAY[
        'L128','L128','L128','L128','L128','L128','L128','L128','L128','L128',
        'L128','L128','L128','L128','L128','L128','L128','L128','L128','L128',
        'L64','L64','L64','L64','L64','L64','L64','L64','L64','L64',
        'L32','L32','L32','L32','L32','L32','L32',
        'L16','L16','L16','L16',
        'QF','QF','QF',
        'SF','SF',
        'RU'
      ];
      v_pool TEXT[];
      v_rand_idx INT;
      v_ai_place_idx INT;
      v_ai_exp_idx INT;
    BEGIN
      v_bracket_size := COALESCE(v_event.bracket_size, 64);
      IF v_bracket_size >= 128 THEN v_pool := v_ai_placements_128;
      ELSE v_pool := v_ai_placements_64; END IF;

      IF v_ai.ranking_position <= 10 THEN
        v_rand_idx := GREATEST(1, (array_length(v_pool, 1) * 0.4 + random() * array_length(v_pool, 1) * 0.6)::int);
      ELSIF v_ai.ranking_position <= 25 THEN
        v_rand_idx := GREATEST(1, (array_length(v_pool, 1) * 0.2 + random() * array_length(v_pool, 1) * 0.8)::int);
      ELSE
        v_rand_idx := GREATEST(1, (random() * array_length(v_pool, 1))::int);
      END IF;
      v_ai_placement := v_pool[v_rand_idx];

      v_ai_points := COALESCE((v_rating_table->>v_ai_placement)::numeric, 0);
      v_ai_base_change := v_ai_points;

      IF v_ai.exp_round IS NOT NULL THEN
        v_ai_place_idx := array_position(v_placement_order, v_ai_placement);
        v_ai_exp_idx := array_position(v_placement_order, v_ai.exp_round);
        IF v_ai_place_idx IS NOT NULL AND v_ai_exp_idx IS NOT NULL AND v_ai_place_idx < v_ai_exp_idx THEN
          v_ai_base_change := v_ai_base_change - ((v_ai_exp_idx - v_ai_place_idx) * 8);
        END IF;
      END IF;

      UPDATE career_pro_rankings SET
        ranking_points = GREATEST(0, ranking_points + v_ai_base_change),
        expected_round = CASE
          WHEN ranking_position <= 10 THEN 'L16'
          WHEN ranking_position <= 25 THEN 'L32'
          WHEN ranking_position <= 60 THEN 'L64'
          ELSE NULL
        END
      WHERE id = v_ai.id;
    END;
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
  VALUES (p_career_id,
    CASE WHEN p_placement = 'W' THEN 'tournament_win' ELSE 'tournament_result' END,
    v_event.event_name || ' - ' || CASE p_placement
      WHEN 'W' THEN 'Winner' WHEN 'RU' THEN 'Runner-Up' WHEN 'SF' THEN 'Semi-Finalist'
      WHEN 'QF' THEN 'Quarter-Finalist' WHEN 'L16' THEN 'Last 16'
      WHEN 'L32' THEN 'Last 32' WHEN 'L64' THEN 'Last 64' WHEN 'L128' THEN 'Last 128'
      ELSE p_placement END,
    'Points change: ' || v_point_change::text,
    v_career.tier, v_career.season, v_career.week, v_career.day);

  RETURN json_build_object(
    'success', true,
    'points_gained', v_player_points,
    'point_change', v_point_change,
    'placement', p_placement,
    'event_name', v_event.event_name,
    'new_rank', (SELECT ranking_position FROM career_pro_rankings WHERE career_id = p_career_id AND is_player = TRUE)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_award_points(UUID, UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_new_season(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_new_season(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_new_season SMALLINT;
  v_new_day SMALLINT;
  v_qualifies_champions BOOLEAN;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  v_new_season := v_career.season + 1;
  v_new_day := v_career.day + 5;

  SELECT (ranking_position <= 8) INTO v_qualifies_champions
  FROM career_pro_rankings WHERE career_id = p_career_id AND is_player = TRUE;

  UPDATE career_profiles SET
    season = v_new_season, week = 1, day = v_new_day, updated_at = now()
  WHERE id = p_career_id;

  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_subtype, event_name, format_legs, bracket_size, day, status)
  SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_subtype, t.event_name, t.format_legs, t.bracket_size,
    v_new_day + t.sequence_no * 10, 'pending'
  FROM career_schedule_templates t WHERE t.tier = 5 ORDER BY t.sequence_no;

  IF v_qualifies_champions THEN
    PERFORM rpc_champions_series_init(p_career_id, v_new_season);
  END IF;

  RETURN json_build_object('success', true, 'new_season', v_new_season, 'champions_series', v_qualifies_champions);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_new_season(UUID) TO authenticated;
