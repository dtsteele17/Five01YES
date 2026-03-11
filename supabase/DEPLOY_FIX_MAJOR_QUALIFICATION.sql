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
