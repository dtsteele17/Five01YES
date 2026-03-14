DROP FUNCTION IF EXISTS rpc_pro_tour_major_qualification(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_major_qualification(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_qual_event_id UUID;
  v_major_event_id UUID;
  v_bracket_size INT;
  v_format_legs INT;
  v_wins_needed INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT id INTO v_major_event_id FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major' AND status IN ('pending', 'active')
  LIMIT 1;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  IF v_player_rank IS NULL THEN v_player_rank := 100; END IF;

  IF v_player_rank <= 32 THEN
    RETURN json_build_object('success', true, 'auto_qualified', true, 'player_rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || ' - automatic qualification for the Pro Tour Major!');
  END IF;

  IF EXISTS (SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'pro_major_qualifier' AND status IN ('pending', 'active')) THEN
    UPDATE career_events SET status = 'waiting_qualifier'
    WHERE id = v_major_event_id AND status = 'pending';
    RETURN json_build_object('already_exists', true, 'auto_qualified', false,
      'message', 'Qualifier is ready - check your next event');
  END IF;

  IF v_player_rank <= 50 THEN
    v_bracket_size := 4;
    v_wins_needed := 2;
    v_format_legs := 9;
  ELSE
    v_bracket_size := 8;
    v_wins_needed := 3;
    v_format_legs := 7;
  END IF;

  UPDATE career_events SET status = 'waiting_qualifier'
  WHERE id = v_major_event_id;

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day, status)
  VALUES (p_career_id, v_career.season, 70, 'pro_major_qualifier', 'Pro Tour Major Qualifier', v_format_legs, v_bracket_size, v_career.day + 2, 'pending')
  RETURNING id INTO v_qual_event_id;

  RETURN json_build_object('success', true, 'auto_qualified', false, 'player_rank', v_player_rank,
    'qual_event_id', v_qual_event_id, 'bracket_size', v_bracket_size, 'wins_needed', v_wins_needed,
    'message', 'Ranked ' || v_player_rank || ' - win ' || v_wins_needed || ' matches to qualify for the Pro Tour Major!');
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_major_qualification(UUID) TO authenticated;
