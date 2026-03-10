UPDATE career_events SET template_id = NULL WHERE template_id IN (SELECT id FROM career_schedule_templates WHERE tier = 3);
DELETE FROM career_schedule_templates WHERE tier = 3;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(3, 1, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 2, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 3, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 4, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 5, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 6, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 7, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 8, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}'),
(3, 9, 'league', 'County League Night', 'county_league', 5, NULL, FALSE, '{}');

DROP FUNCTION IF EXISTS _random_county_tournament_name();
CREATE OR REPLACE FUNCTION _random_county_tournament_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'The County Shield', 'The Borough Cup', 'The Shire Open',
    'The County Masters', 'The District Championship', 'The Regional Shield',
    'The County Invitational', 'The Borough Masters', 'The Shire Classic',
    'The County Open', 'The District Cup', 'The Regional Classic',
    'The County Trophy', 'The Borough Shield', 'The Shire Trophy',
    'The County Challenge', 'The District Open', 'The Regional Cup',
    'The County Premier', 'The Borough Challenge', 'The Shire Masters',
    'The County Classic', 'The District Shield', 'The Regional Trophy'
  ];
BEGIN
  RETURN v_names[floor(random() * array_length(v_names, 1))::int + 1];
END;
$$;

DROP FUNCTION IF EXISTS rpc_create_tier3_tournament_choice(UUID);
CREATE OR REPLACE FUNCTION rpc_create_tier3_tournament_choice(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed_leagues INTEGER;
  v_choice_round INTEGER;
  v_existing INTEGER;
  v_name1 TEXT;
  v_name2 TEXT;
  v_size1 INTEGER;
  v_size2 INTEGER;
  v_seq INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 3 THEN RETURN json_build_object('error', 'Not a Tier 3 career'); END IF;

  SELECT COUNT(*) INTO v_completed_leagues
  FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'league' AND status = 'completed';

  IF v_completed_leagues = 3 THEN v_choice_round := 1; v_seq := 50;
  ELSIF v_completed_leagues = 6 THEN v_choice_round := 2; v_seq := 100;
  ELSE RETURN json_build_object('error', 'Not at a tournament choice point'); END IF;

  SELECT COUNT(*) INTO v_existing FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'open' AND sequence_no >= v_seq AND sequence_no < v_seq + 10;
  IF v_existing > 0 THEN RETURN json_build_object('already_exists', true); END IF;

  v_name1 := _random_county_tournament_name();
  v_name2 := _random_county_tournament_name();
  WHILE v_name2 = v_name1 LOOP v_name2 := _random_county_tournament_name(); END LOOP;

  v_size1 := CASE WHEN random() < 0.5 THEN 16 ELSE 32 END;
  v_size2 := CASE WHEN random() < 0.5 THEN 16 ELSE 32 END;

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES
    (p_career_id, v_career.season, v_seq, 'open', v_name1, 5, v_size1, 'pending_invite', v_career.day + 3),
    (p_career_id, v_career.season, v_seq + 1, 'open', v_name2, 5, v_size2, 'pending_invite', v_career.day + 5);

  RETURN json_build_object('success', true, 'choice_round', v_choice_round,
    'tournament1', json_build_object('name', v_name1, 'size', v_size1),
    'tournament2', json_build_object('name', v_name2, 'size', v_size2));
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_tier3_tournament_choice(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_tier3_tournament_respond(UUID, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION rpc_tier3_tournament_respond(
  p_career_id UUID,
  p_event_id UUID,
  p_accept BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event career_events;
  v_seq_base INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Not your career');
  END IF;

  SELECT * INTO v_event FROM career_events
  WHERE id = p_event_id AND career_id = p_career_id AND status = 'pending_invite';
  IF v_event.id IS NULL THEN RETURN json_build_object('error', 'No pending invite'); END IF;

  v_seq_base := CASE WHEN v_event.sequence_no >= 100 THEN 100 WHEN v_event.sequence_no >= 50 THEN 50 ELSE 0 END;

  IF p_accept THEN
    UPDATE career_events SET status = 'pending' WHERE id = p_event_id;
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id AND season = v_event.season
      AND id != p_event_id AND status = 'pending_invite'
      AND sequence_no >= v_seq_base AND sequence_no < v_seq_base + 10;
    RETURN json_build_object('success', true, 'message', 'Tournament accepted!');
  ELSE
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object('success', true, 'message', 'Tournament declined.');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tier3_tournament_respond(UUID, UUID, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS rpc_create_tier3_end_season_tournament(UUID);
CREATE OR REPLACE FUNCTION rpc_create_tier3_end_season_tournament(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_total_players SMALLINT;
  v_name TEXT;
  v_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 3 THEN RETURN json_build_object('error', 'Not a Tier 3 career'); END IF;

  IF EXISTS (
    SELECT 1 FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season AND sequence_no >= 200 AND event_type = 'open'
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = 3;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = 3
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 3 AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 3 AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 3 AND is_player = TRUE)));

  IF v_player_rank > (v_total_players - 2) THEN
    RETURN json_build_object('excluded', true, 'reason', 'Bottom 2 - no end of season tournament');
  END IF;

  v_name := _random_county_tournament_name();

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, 200, 'open', v_name, 5, 32, 'pending', v_career.day + 3)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'event_id', v_id, 'event_name', v_name, 'bracket_size', 32);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_tier3_end_season_tournament(UUID) TO authenticated;
