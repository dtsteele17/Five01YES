UPDATE career_events SET template_id = NULL WHERE template_id IN (SELECT id FROM career_schedule_templates WHERE tier = 2);
DELETE FROM career_schedule_templates WHERE tier = 2;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(2, 1, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 2, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 3, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 4, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 5, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 6, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 7, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}');

DROP FUNCTION IF EXISTS rpc_create_tier2_end_season_tournament(UUID);
CREATE OR REPLACE FUNCTION rpc_create_tier2_end_season_tournament(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_name TEXT;
  v_size INTEGER;
  v_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 2 THEN RETURN json_build_object('error', 'Not a Tier 2 career'); END IF;

  IF EXISTS (
    SELECT 1 FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season
      AND sequence_no >= 200 AND event_type = 'open'
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  v_name := _random_pub_tournament_name();
  v_size := (ARRAY[8, 16])[1 + floor(random() * 2)::int];

  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, 200, 'open', v_name, 3, v_size, 'pending', v_career.day + 3)
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'event_id', v_id, 'event_name', v_name, 'bracket_size', v_size);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_tier2_end_season_tournament(UUID) TO authenticated;

UPDATE career_events
SET status = 'pending_invite'
WHERE event_type = 'open'
  AND status = 'pending'
  AND sequence_no = 50
  AND career_id IN (SELECT id FROM career_profiles WHERE tier = 2);

CREATE OR REPLACE FUNCTION trg_tier2_mid_season_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'open' AND NEW.sequence_no = 50 AND NEW.status = 'pending' THEN
    IF EXISTS (SELECT 1 FROM career_profiles WHERE id = NEW.career_id AND tier = 2) THEN
      NEW.status := 'pending_invite';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tier2_mid_season_invite ON career_events;
CREATE TRIGGER trg_tier2_mid_season_invite
  BEFORE INSERT ON career_events
  FOR EACH ROW
  EXECUTE FUNCTION trg_tier2_mid_season_invite();
