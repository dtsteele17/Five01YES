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

  SELECT id INTO v_major_event_id FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major' AND status IN ('pending', 'active')
  LIMIT 1;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  IF v_player_rank <= 32 THEN
    RETURN json_build_object('success', true, 'auto_qualified', true, 'player_rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || ' - automatic qualification for the Pro Tour Major!');
  ELSE
    IF EXISTS (SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
        AND event_type = 'pro_major_qualifier' AND status IN ('pending', 'active')) THEN
      UPDATE career_events SET status = 'waiting_qualifier'
      WHERE id = v_major_event_id AND status = 'pending';
      RETURN json_build_object('already_exists', true, 'auto_qualified', false,
        'message', 'Qualifier match is ready - check your next event');
    END IF;

    UPDATE career_events SET status = 'waiting_qualifier'
    WHERE id = v_major_event_id;

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

CREATE OR REPLACE FUNCTION rpc_pro_tour_restore_major_after_qualifier(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_qual career_events;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_qual FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major_qualifier'
  ORDER BY created_at DESC LIMIT 1;

  IF v_qual.status = 'completed' THEN
    UPDATE career_events SET status = 'pending'
    WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major' AND status = 'waiting_qualifier';
    RETURN json_build_object('restored', true);
  ELSIF v_qual.status = 'skipped' THEN
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major' AND status = 'waiting_qualifier';
    RETURN json_build_object('skipped', true);
  END IF;

  RETURN json_build_object('no_action', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_restore_major_after_qualifier(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_start_qualifier(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_start_qualifier(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_opponent career_opponents;
  v_room_id UUID;
  v_match_id UUID;
  v_bot_avg SMALLINT;
  v_opp_name TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season AND event_type = 'pro_major_qualifier' AND status IN ('pending', 'active')
  ORDER BY sequence_no LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('error', 'No qualifier event found'); END IF;

  IF EXISTS (SELECT 1 FROM career_matches WHERE event_id = v_event.id AND career_id = p_career_id) THEN
    SELECT cm.id, cm.bot_average, cm.opponent_name INTO v_match_id, v_bot_avg, v_opp_name
    FROM career_matches cm WHERE cm.event_id = v_event.id AND cm.career_id = p_career_id LIMIT 1;
    RETURN json_build_object('match_id', v_match_id, 'event_id', v_event.id, 'bot_average', v_bot_avg, 'best_of', 11,
      'opponent', json_build_object('id', 'qualifier_bot', 'name', v_opp_name));
  END IF;

  v_bot_avg := 65 + floor(random() * 15)::int;

  SELECT first_name || COALESCE(' ''' || nickname || ''' ', ' ') || last_name INTO v_opp_name
  FROM career_opponents WHERE career_id = p_career_id
  ORDER BY random() LIMIT 1;
  IF v_opp_name IS NULL THEN v_opp_name := 'Major Qualifier Opponent'; END IF;

  INSERT INTO match_room (user_id, source, match_type, status)
  VALUES (auth.uid(), 'career', 'career', 'waiting')
  RETURNING id INTO v_room_id;

  INSERT INTO career_matches (career_id, event_id, room_id, opponent_name, bot_average, best_of)
  VALUES (p_career_id, v_event.id, v_room_id, v_opp_name, v_bot_avg, 11)
  RETURNING id INTO v_match_id;

  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  RETURN json_build_object('match_id', v_match_id, 'event_id', v_event.id, 'bot_average', v_bot_avg, 'best_of', 11,
    'opponent', json_build_object('id', 'qualifier_bot', 'name', v_opp_name));
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_start_qualifier(UUID) TO authenticated;
