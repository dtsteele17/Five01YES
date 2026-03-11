UPDATE career_events SET template_id = NULL WHERE template_id IN (SELECT id FROM career_schedule_templates WHERE tier = 4);
DELETE FROM career_schedule_templates WHERE tier = 4;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(4, 1,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 2,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 3,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 4,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 5,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 6,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 7,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 8,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 9,  'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 10, 'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 11, 'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 12, 'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 13, 'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 14, 'league', 'Regional Tour Match', 'regional_league', 7, NULL, FALSE, '{}');

DROP FUNCTION IF EXISTS _random_regional_tournament_name();
CREATE OR REPLACE FUNCTION _random_regional_tournament_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'The Regional Classic', 'The Tour Championship', 'The Regional Open',
    'The Tour Masters', 'The Regional Shield', 'The Tour Invitational',
    'The Regional Cup', 'The Tour Trophy', 'The Regional Premier',
    'The Tour Classic', 'The Regional Challenge', 'The Tour Shield',
    'The Regional Masters', 'The Tour Open', 'The Regional Invitational',
    'The Tour Cup', 'The Regional Trophy', 'The Tour Challenge',
    'The Grand Regional', 'The Tour Premier', 'The Regional Series',
    'The Tour Grand Prix', 'The Regional Showcase', 'The Tour Festival'
  ];
BEGIN
  RETURN v_names[floor(random() * array_length(v_names, 1))::int + 1];
END;
$$;

DROP FUNCTION IF EXISTS rpc_create_tier4_tournament(UUID, INTEGER);
CREATE OR REPLACE FUNCTION rpc_create_tier4_tournament(
  p_career_id UUID,
  p_tournament_num INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed_leagues INTEGER;
  v_expected_leagues INTEGER;
  v_seq INTEGER;
  v_name TEXT;
  v_size INTEGER;
  v_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 4 THEN RETURN json_build_object('error', 'Not a Tier 4 career'); END IF;

  IF p_tournament_num = 1 THEN v_expected_leagues := 5; v_seq := 50; v_size := 32;
  ELSIF p_tournament_num = 2 THEN v_expected_leagues := 10; v_seq := 100; v_size := 32;
  ELSIF p_tournament_num = 3 THEN v_expected_leagues := 15; v_seq := 200; v_size := 64;
  ELSE RETURN json_build_object('error', 'Invalid tournament number'); END IF;

  SELECT COUNT(*) INTO v_completed_leagues
  FROM career_events WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'league' AND status = 'completed';

  IF v_completed_leagues < v_expected_leagues THEN
    RETURN json_build_object('error', 'Not enough league matches completed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'open' AND sequence_no >= v_seq AND sequence_no < v_seq + 10
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  v_name := _random_regional_tournament_name();

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, v_seq, 'open', v_name, 7, v_size, 'pending', v_career.day + 3)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'event_id', v_id, 'event_name', v_name,
    'bracket_size', v_size, 'tournament_num', p_tournament_num);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_tier4_tournament(UUID, INTEGER) TO authenticated;

DROP FUNCTION IF EXISTS rpc_tier4_award_tournament_points(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION rpc_tier4_award_tournament_points(
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
  v_points INTEGER;
  v_is_major BOOLEAN;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 4 THEN RETURN json_build_object('error', 'Not a Tier 4 career'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF v_event.id IS NULL THEN RETURN json_build_object('error', 'Event not found'); END IF;

  v_is_major := v_event.sequence_no >= 200;

  IF v_is_major THEN
    v_points := CASE p_placement
      WHEN 'Winner' THEN 7
      WHEN 'Runner-Up' THEN 6
      WHEN 'Semi-Finalist' THEN 5
      WHEN 'Quarter-Finalist' THEN 4
      WHEN 'Last 16' THEN 3
      WHEN 'Last 32' THEN 2
      ELSE 0
    END;
  ELSE
    v_points := CASE p_placement
      WHEN 'Winner' THEN 5
      WHEN 'Runner-Up' THEN 4
      WHEN 'Semi-Finalist' THEN 3
      WHEN 'Quarter-Finalist' THEN 2
      WHEN 'Last 16' THEN 1
      ELSE 0
    END;
  END IF;

  IF v_points > 0 THEN
    UPDATE career_league_standings
    SET points = points + v_points
    WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE;
  END IF;

  RETURN json_build_object('success', true, 'points_awarded', v_points, 'placement', p_placement, 'is_major', v_is_major);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tier4_award_tournament_points(UUID, UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS rpc_tier4_check_t3_qualification(UUID);
CREATE OR REPLACE FUNCTION rpc_tier4_check_t3_qualification(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 4 THEN RETURN json_build_object('error', 'Not a Tier 4 career'); END IF;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = 4
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)));

  IF v_player_rank <= 8 THEN
    RETURN json_build_object('qualified', true, 'auto_qualify', true, 'rank', v_player_rank,
      'message', 'Top 8 - automatic qualification for Tournament 3!');
  ELSIF v_player_rank <= 15 THEN
    RETURN json_build_object('qualified', false, 'needs_qualifier', true, 'rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || 'th - must win qualification match for Tournament 3');
  ELSE
    RETURN json_build_object('qualified', false, 'needs_qualifier', false, 'rank', v_player_rank);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tier4_check_t3_qualification(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_tier4_q_school(UUID);
CREATE OR REPLACE FUNCTION rpc_tier4_q_school(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_opponents RECORD;
  v_semi_opponent_rank SMALLINT;
  v_semi_opponent_name TEXT;
  v_semi_id UUID;
  v_final_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 4 THEN RETURN json_build_object('error', 'Not a Tier 4 career'); END IF;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = 4
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)));

  IF v_player_rank < 3 OR v_player_rank > 6 THEN
    RETURN json_build_object('error', 'Player rank ' || v_player_rank || ' does not qualify for Q School (3rd-6th only)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
      AND event_type IN ('q_school_semi', 'q_school_final')
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  v_semi_opponent_rank := CASE v_player_rank WHEN 3 THEN 6 WHEN 4 THEN 5 WHEN 5 THEN 4 WHEN 6 THEN 3 END;

  SELECT co.first_name || ' ' || co.last_name INTO v_semi_opponent_name
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = 4 AND ls.is_player = FALSE
  ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
  OFFSET (v_semi_opponent_rank - 2)
  LIMIT 1;

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, status, day)
  VALUES (p_career_id, v_career.season, 300, 'q_school_semi', 'Q School Semi-Final', 9, 'pending', v_career.day + 5)
  RETURNING id INTO v_semi_id;

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, status, day)
  VALUES (p_career_id, v_career.season, 301, 'q_school_final', 'Q School Final', 9, 'pending', v_career.day + 7)
  RETURNING id INTO v_final_id;

  RETURN json_build_object('success', true, 'player_rank', v_player_rank,
    'semi_opponent', v_semi_opponent_name, 'semi_opponent_rank', v_semi_opponent_rank,
    'semi_event_id', v_semi_id, 'final_event_id', v_final_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tier4_q_school(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION trg_tier4_q_school_winner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_event career_events;
BEGIN
  IF NEW.result = 'win' AND OLD.result IS DISTINCT FROM NEW.result THEN
    SELECT * INTO v_event FROM career_events WHERE id = NEW.event_id;
    IF v_event.event_type = 'q_school_final' THEN
      INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
      SELECT NEW.career_id, 'q_school_winner', 'Q School Winner!',
        'Won Q School to earn promotion to the Pro Tour!',
        cp.tier, cp.season, cp.week, cp.day
      FROM career_profiles cp WHERE cp.id = NEW.career_id
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tier4_q_school_winner ON career_matches;
CREATE TRIGGER trg_tier4_q_school_winner
  AFTER UPDATE ON career_matches
  FOR EACH ROW
  EXECUTE FUNCTION trg_tier4_q_school_winner();
