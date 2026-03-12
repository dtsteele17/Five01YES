DROP FUNCTION IF EXISTS complete_tournament_flow_progression(UUID);

CREATE OR REPLACE FUNCTION complete_tournament_flow_progression(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.start_at IS NOT NULL AND now() < v_tournament.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not yet started', 'action', 'too_early');
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants WHERE tournament_id = p_tournament_id;

  IF v_participant_count < 2 THEN
    UPDATE tournaments SET status = 'cancelled' WHERE id = p_tournament_id;
    RETURN jsonb_build_object('success', true, 'action', 'tournament_cancelled', 'participant_count', v_participant_count);
  END IF;

  IF v_tournament.bracket_generated_at IS NULL THEN
    v_result := generate_tournament_bracket(p_tournament_id);
  END IF;

  IF v_tournament.started_at IS NULL THEN
    v_result := start_tournament_round_one(p_tournament_id);
  END IF;

  UPDATE tournaments SET status = 'in_progress' WHERE id = p_tournament_id;

  RETURN jsonb_build_object('success', true, 'action', 'tournament_live', 'participant_count', v_participant_count);
END;
$$;

GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO authenticated;
