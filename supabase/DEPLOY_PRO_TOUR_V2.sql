ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;

CREATE TABLE IF NOT EXISTS career_pro_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  opponent_id UUID REFERENCES career_opponents(id),
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  ranking_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  prev_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  ranking_position SMALLINT,
  expected_round TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE career_pro_rankings DROP CONSTRAINT IF EXISTS career_pro_rankings_career_id_is_player_key;

ALTER TABLE career_pro_rankings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own rankings" ON career_pro_rankings;
CREATE POLICY "Users can view own rankings" ON career_pro_rankings
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update own rankings" ON career_pro_rankings;
CREATE POLICY "Users can update own rankings" ON career_pro_rankings
  FOR UPDATE USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS career_champions_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  player_name TEXT NOT NULL,
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  ranking_at_qualification SMALLINT,
  points SMALLINT NOT NULL DEFAULT 0,
  legs_for SMALLINT NOT NULL DEFAULT 0,
  legs_against SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(career_id, season, player_name)
);

ALTER TABLE career_champions_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own champions series" ON career_champions_series;
CREATE POLICY "Users can view own champions series" ON career_champions_series
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can modify own champions series" ON career_champions_series;
CREATE POLICY "Users can modify own champions series" ON career_champions_series
  FOR ALL USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

DELETE FROM career_schedule_templates WHERE tier = 5;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(5, 1,  'pro_players_championship', 'Players Championship', 'pc_england', 9, 64, FALSE,
  '{"country":"England","tournament_number":1,"optional":true,"round_formats":{"L64":9,"L32":9,"L16":11,"QF":13,"SF":13,"F":15},"rating_table":{"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'),
(5, 2,  'pro_players_championship', 'Players Championship', 'pc_germany', 9, 64, FALSE,
  '{"country":"Germany","tournament_number":2,"optional":true,"round_formats":{"L64":9,"L32":9,"L16":11,"QF":13,"SF":13,"F":15},"rating_table":{"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'),
(5, 3,  'pro_players_championship', 'Players Championship', 'pc_netherlands', 9, 64, FALSE,
  '{"country":"Netherlands","tournament_number":3,"optional":true,"round_formats":{"L64":9,"L32":9,"L16":11,"QF":13,"SF":13,"F":15},"rating_table":{"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'),
(5, 4,  'pro_open', 'Pro Tour Open', 'pro_open_ireland', 9, 128, FALSE,
  '{"country":"Ireland","tournament_number":4,"optional":false,"round_formats":{"L128":9,"L64":9,"L32":11,"L16":13,"QF":15,"SF":17,"F":19},"rating_table":{"L128":3,"L64":8,"L32":15,"L16":25,"QF":40,"SF":55,"RU":75,"W":100}}'),
(5, 5,  'pro_players_championship', 'Players Championship', 'pc_scotland', 9, 64, FALSE,
  '{"country":"Scotland","tournament_number":5,"optional":true,"round_formats":{"L64":9,"L32":9,"L16":11,"QF":13,"SF":13,"F":15},"rating_table":{"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'),
(5, 6,  'pro_players_championship', 'Players Championship', 'pc_austria', 9, 64, FALSE,
  '{"country":"Austria","tournament_number":6,"optional":true,"round_formats":{"L64":9,"L32":9,"L16":11,"QF":13,"SF":13,"F":15},"rating_table":{"L64":5,"L32":10,"L16":20,"QF":30,"SF":45,"RU":60,"W":80}}'),
(5, 7,  'pro_major', 'Pro Tour Major', 'pro_major_england', 11, 128, FALSE,
  '{"country":"England","tournament_number":7,"optional":false,"qualification_required":true,"top_32_auto_qualify":true,"qualifier_format":11,"round_formats":{"L128":11,"L64":11,"L32":13,"L16":15,"QF":17,"SF":19,"F":21},"rating_table":{"L128":5,"L64":12,"L32":20,"L16":35,"QF":50,"SF":70,"RU":95,"W":130}}'),
(5, 8,  'pro_world_series', 'World Series Event', 'ws_usa', 9, 128, FALSE,
  '{"country":"USA","tournament_number":8,"optional":false,"round_formats":{"L128":9,"L64":9,"L32":11,"L16":13,"QF":15,"SF":17,"F":19},"rating_table":{"L128":3,"L64":8,"L32":15,"L16":25,"QF":40,"SF":55,"RU":75,"W":100}}');

DROP FUNCTION IF EXISTS rpc_pro_tour_init_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_init_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_i INT;
  v_name TEXT;
  v_points NUMERIC;
  v_start_rank INT;
  v_first_names TEXT[] := ARRAY[
    'Michael','James','Peter','Gary','Phil','Adrian','Gerwyn','Nathan','Joe','Dave',
    'Rob','Chris','Luke','Damon','Kim','Brendan','Daryl','Danny','Mensur','Gabriel',
    'Dimitri','Fallon','Ross','Stephen','Keane','Martin','Dirk','Raymond','Simon','Andrew',
    'Ryan','Josh','Callan','Jonny','Devon','Ricardo','Jose','Florian','Keegan','Boris',
    'Mervyn','Ted','John','Mark','Alan','Scott','Ritchie','Ian','Jamie','Wayne',
    'Colin','Terry','Andy','Steve','Dean','Kevin','Barry','Darren','Nigel','Paul',
    'Stuart','Vincent','Max','Jeff','Liam','Connor','Ethan','Jake','Tyler','Ben',
    'Matt','Tom','Will','Sam','Dan','Alex','Harry','Oscar','Leo','Alfie',
    'George','Charlie','Noah','Arthur','Logan','Finley','Archie','Theo','Mason','Jack',
    'Ricky','Graham','Stan','Reg','Noel','Glen','Clive','Vince','Trevor','Roy'
  ];
  v_surnames TEXT[] := ARRAY[
    'van Gerwen','Anderson','Wright','Price','Smith','Lewis','Aspinall','Cross','Clayton','Chisnall',
    'Wade','Humphries','Searle','Heta','de Graaf','Dolan','Gurney','Noppert','Clemens','Cullen',
    'van den Bergh','Sherrock','Rock','Bunting','Barry','Schindler','van Duijvenbode','Whitlock','Ratajski','Gilding',
    'van Veen','Pietreczko','Lukeman','Dobey','Petersen','Rodriguez','de Sousa','Hempel','Brown','Soutar',
    'King','Hankey','Lowe','Bristow','Taylor','Wilson','Painter','Jenkins','Part','Barneveld',
    'Thornton','Adams','Mitchell','Warren','Waites','Ashton','Nicholson','Beaton','Mardle','Hamilton',
    'Webster','Fitton','Fordham','Evetts','Hughes','Owen','Green','Cooper','Evans','Harris',
    'Clark','Robinson','Turner','Baker','Wood','Hall','Walker','Allen','Young','Phillips',
    'Thompson','White','Jackson','Martin','Davies','Roberts','Campbell','Edwards','Miller','Watts',
    'Fraser','Reid','Stewart','Murray','Bennett','Shaw','Kelly','Stone','Fox','Webb'
  ];
  v_used_names TEXT[] := ARRAY[]::TEXT[];
  v_candidate TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  v_start_rank := 85 + floor(random() * 11)::int;

  INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, prev_points, ranking_position, expected_round)
  VALUES (p_career_id, 'You', TRUE, 15 + floor(random() * 20)::int, 0, v_start_rank, NULL);

  FOR v_i IN 1..99 LOOP
    LOOP
      v_candidate := v_first_names[1 + ((v_i * 7 + v_career.career_seed) * 31 + length(v_used_names::text)) % array_length(v_first_names, 1)]
        || ' ' || v_surnames[1 + ((v_i * 13 + v_career.career_seed) * 37 + length(v_used_names::text)) % array_length(v_surnames, 1)];
      EXIT WHEN NOT (v_candidate = ANY(v_used_names));
      v_career.career_seed := v_career.career_seed + 1;
    END LOOP;
    v_used_names := array_append(v_used_names, v_candidate);

    IF v_i < v_start_rank THEN
      v_points := GREATEST(20, 500 - (v_i * 5) + (random() * 20 - 10));
    ELSE
      v_points := GREATEST(5, 500 - (v_i * 5) + (random() * 20 - 10));
    END IF;

    INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, prev_points, ranking_position, expected_round)
    VALUES (p_career_id, v_candidate, FALSE, v_points, v_points, v_i,
      CASE
        WHEN v_i <= 10 THEN 'L16'
        WHEN v_i <= 25 THEN 'L32'
        WHEN v_i <= 60 THEN 'L64'
        ELSE NULL
      END);
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'players_created', 100, 'player_start_rank', v_start_rank);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_init_rankings(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_get_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_get_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_top25 JSON;
  v_player_row JSON;
  v_player_rank INT;
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  SELECT json_agg(row_to_json(t)) INTO v_top25 FROM (
    SELECT player_name, is_player, ranking_points, prev_points, ranking_position,
      (ranking_points - prev_points) AS points_change
    FROM career_pro_rankings
    WHERE career_id = p_career_id
    ORDER BY ranking_position
    LIMIT 25
  ) t;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  SELECT json_build_object(
    'player_name', player_name, 'ranking_points', ranking_points,
    'prev_points', prev_points, 'ranking_position', ranking_position,
    'points_change', (ranking_points - prev_points)
  ) INTO v_player_row
  FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  RETURN json_build_object('top25', v_top25, 'player', v_player_row, 'player_rank', v_player_rank);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_get_rankings(UUID) TO authenticated;

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

  SELECT (metadata)::jsonb INTO v_metadata FROM career_schedule_templates
    WHERE tier = 5 AND event_subtype = v_event.event_subtype LIMIT 1;

  IF v_metadata IS NULL THEN
    RETURN json_build_object('error', 'No metadata found for event subtype ' || v_event.event_subtype);
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
    prev_points = ranking_points,
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
        prev_points = ranking_points,
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

DROP FUNCTION IF EXISTS rpc_pro_tour_skip_tournament(UUID, UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_skip_tournament(
  p_career_id UUID,
  p_event_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_metadata JSONB;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  SELECT (metadata)::jsonb INTO v_metadata FROM career_schedule_templates
    WHERE tier = 5 AND event_subtype = v_event.event_subtype LIMIT 1;

  IF v_metadata IS NULL OR (v_metadata->>'optional')::boolean IS NOT TRUE THEN
    RETURN json_build_object('error', 'This tournament is not optional');
  END IF;

  UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;

  PERFORM rpc_pro_tour_award_points(p_career_id, p_event_id, 'L64');

  RETURN json_build_object('success', true, 'skipped', true, 'event_name', v_event.event_name);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_skip_tournament(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_major_qualification(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_major_qualification(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_qual_event_id UUID;
  v_major_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  IF v_player_rank <= 32 THEN
    RETURN json_build_object('success', true, 'auto_qualified', true, 'player_rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || ' - automatic qualification for the Pro Tour Major!');
  ELSE
    IF EXISTS (SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
        AND event_type = 'pro_major_qualifier') THEN
      RETURN json_build_object('already_exists', true);
    END IF;

    INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
    VALUES (p_career_id, v_career.season, 70, 'pro_major_qualifier', 'Pro Tour Major Qualifier', 11, v_career.day + 2, 'pending')
    RETURNING id INTO v_qual_event_id;

    RETURN json_build_object('success', true, 'auto_qualified', false, 'player_rank', v_player_rank,
      'qual_event_id', v_qual_event_id,
      'message', 'Ranked ' || v_player_rank || ' - must win a qualifier to enter the Pro Tour Major');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_major_qualification(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_season_end(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_season_end(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_qualifies_champions BOOLEAN;
  v_top8 JSON;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  v_qualifies_champions := (v_player_rank <= 8);

  SELECT json_agg(row_to_json(t)) INTO v_top8 FROM (
    SELECT player_name, ranking_points, ranking_position, is_player
    FROM career_pro_rankings
    WHERE career_id = p_career_id
    ORDER BY ranking_position
    LIMIT 8
  ) t;

  IF v_qualifies_champions THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'champions_series_qualification', 'Champions Series Qualification!',
      'Finished ranked ' || v_player_rank || ' - qualified for the Champions Series!',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END IF;

  RETURN json_build_object(
    'success', true,
    'player_rank', v_player_rank,
    'qualifies_champions_series', v_qualifies_champions,
    'top8', v_top8,
    'message', CASE WHEN v_qualifies_champions
      THEN 'Ranked ' || v_player_rank || ' - qualified for the Champions Series!'
      ELSE 'Season complete - ranked ' || v_player_rank || ' in the world'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_season_end(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_champions_series_init(UUID, SMALLINT);
CREATE OR REPLACE FUNCTION rpc_champions_series_init(p_career_id UUID, p_season SMALLINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_top8 RECORD;
  v_night INT;
  v_locations TEXT[] := ARRAY['Belfast','Glasgow','Dublin','Cardiff','Manchester','Birmingham','Rotterdam','London'];
  v_evt_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_champions_series WHERE career_id = p_career_id AND season = p_season LIMIT 1) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  FOR v_top8 IN
    SELECT player_name, is_player, ranking_position
    FROM career_pro_rankings
    WHERE career_id = p_career_id
    ORDER BY ranking_position
    LIMIT 8
  LOOP
    INSERT INTO career_champions_series (career_id, season, player_name, is_player, ranking_at_qualification, points, legs_for, legs_against)
    VALUES (p_career_id, p_season, v_top8.player_name, v_top8.is_player, v_top8.ranking_position, 0, 0, 0);
  END LOOP;

  FOR v_night IN 1..8 LOOP
    INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day, status)
    VALUES (p_career_id, p_season, 500 + v_night, 'champions_series_night',
      'Champions Series - ' || v_locations[v_night], 11, 8, v_career.day + (v_night * 10), 'pending')
    RETURNING id INTO v_evt_id;
  END LOOP;

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
  VALUES (p_career_id, p_season, 510, 'champions_series_semi', 'Champions Series Semi-Final', 15, v_career.day + 90, 'pending');

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
  VALUES (p_career_id, p_season, 511, 'champions_series_final', 'Champions Series Final', 19, v_career.day + 95, 'pending');

  RETURN json_build_object('success', true, 'players', 8, 'nights', 8);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_init(UUID, SMALLINT) TO authenticated;

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
  v_cs RECORD;
  v_ai_results TEXT[] := ARRAY['winner','runner_up','semi','qf','qf','qf','qf'];
  v_ai_points INT[] := ARRAY[5,3,2,0,0,0,0];
  v_ai_idx INT := 1;
  v_ai_legs_for INT;
  v_ai_legs_against INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  v_night_points := CASE p_player_result
    WHEN 'winner' THEN 5
    WHEN 'runner_up' THEN 3
    WHEN 'semi' THEN 2
    WHEN 'qf' THEN 0
    ELSE 0
  END;

  UPDATE career_champions_series SET
    points = points + v_night_points,
    legs_for = legs_for + p_player_legs_for,
    legs_against = legs_against + p_player_legs_against
  WHERE career_id = p_career_id AND season = v_career.season AND is_player = TRUE;

  FOR v_cs IN
    SELECT id, player_name FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = FALSE
    ORDER BY random()
  LOOP
    IF v_ai_idx <= array_length(v_ai_points, 1) THEN
      v_ai_legs_for := 3 + floor(random() * 8)::int;
      v_ai_legs_against := 2 + floor(random() * 6)::int;
      UPDATE career_champions_series SET
        points = points + v_ai_points[v_ai_idx],
        legs_for = legs_for + v_ai_legs_for,
        legs_against = legs_against + v_ai_legs_against
      WHERE id = v_cs.id;
      v_ai_idx := v_ai_idx + 1;
    END IF;
  END LOOP;

  UPDATE career_events SET status = 'completed' WHERE id = p_event_id;

  RETURN json_build_object('success', true, 'points_earned', v_night_points, 'result', p_player_result);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_night_complete(UUID, UUID, TEXT, INT, INT) TO authenticated;

DROP FUNCTION IF EXISTS rpc_champions_series_get_standings(UUID, SMALLINT);
CREATE OR REPLACE FUNCTION rpc_champions_series_get_standings(p_career_id UUID, p_season SMALLINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_standings JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_standings FROM (
    SELECT player_name, is_player, points, legs_for, legs_against,
      (legs_for - legs_against) AS leg_difference,
      ranking_at_qualification
    FROM career_champions_series
    WHERE career_id = p_career_id AND season = p_season
    ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC
  ) t;

  RETURN json_build_object('standings', v_standings);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_get_standings(UUID, SMALLINT) TO authenticated;

DROP FUNCTION IF EXISTS rpc_champions_series_playoffs(UUID);
CREATE OR REPLACE FUNCTION rpc_champions_series_playoffs(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_top4 JSON;
  v_player_pos INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT json_agg(row_to_json(t)) INTO v_top4 FROM (
    SELECT player_name, is_player, points, legs_for, legs_against, pos FROM (
      SELECT player_name, is_player, points, legs_for, legs_against,
        ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS pos
      FROM career_champions_series
      WHERE career_id = p_career_id AND season = v_career.season
    ) ranked WHERE pos <= 4
  ) t;

  SELECT pos INTO v_player_pos FROM (
    SELECT is_player,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS pos
    FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season
  ) sub WHERE is_player = TRUE;

  IF v_player_pos > 4 THEN
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type IN ('champions_series_semi', 'champions_series_final');

    RETURN json_build_object('qualified', false, 'player_position', v_player_pos,
      'message', 'Finished ' || v_player_pos || 'th - did not qualify for playoffs');
  END IF;

  RETURN json_build_object('qualified', true, 'player_position', v_player_pos, 'top4', v_top4,
    'semi_matchup', CASE v_player_pos
      WHEN 1 THEN '1st vs 4th'
      WHEN 2 THEN '2nd vs 3rd'
      WHEN 3 THEN '3rd vs 2nd'
      WHEN 4 THEN '4th vs 1st'
    END);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_playoffs(UUID) TO authenticated;

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

  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day, status)
  SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
    v_new_day + t.sequence_no * 10, 'pending'
  FROM career_schedule_templates t WHERE t.tier = 5 ORDER BY t.sequence_no;

  IF v_qualifies_champions THEN
    PERFORM rpc_champions_series_init(p_career_id, v_new_season);
  END IF;

  RETURN json_build_object('success', true, 'new_season', v_new_season,
    'champions_series', COALESCE(v_qualifies_champions, false));
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_new_season(UUID) TO authenticated;
