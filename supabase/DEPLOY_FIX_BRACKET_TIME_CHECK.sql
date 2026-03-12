DROP FUNCTION IF EXISTS generate_tournament_bracket(uuid);

CREATE FUNCTION generate_tournament_bracket(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
declare
  v_tournament record;
  v_participant_count integer;
  v_bracket_size integer;
  v_round integer;
  v_matches_in_round integer;
  v_participants uuid[];
  v_idx integer;
  v_p1 uuid;
  v_p2 uuid;
  v_status text;
  v_match_index integer;
begin
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;

  IF v_tournament.bracket_generated_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Bracket already generated');
  END IF;

  IF v_tournament.start_at IS NOT NULL AND now() < v_tournament.start_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot generate bracket before start time');
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM public.tournament_participants WHERE tournament_id = p_tournament_id;

  IF v_participant_count < 2 THEN
    RAISE EXCEPTION 'Tournament needs at least 2 participants';
  END IF;

  SELECT array_agg(user_id ORDER BY joined_at)
  INTO v_participants
  FROM public.tournament_participants WHERE tournament_id = p_tournament_id;

  v_bracket_size := 2;
  WHILE v_bracket_size < v_participant_count LOOP
    v_bracket_size := v_bracket_size * 2;
  END LOOP;

  v_matches_in_round := v_bracket_size / 2;

  v_match_index := 0;
  v_idx := 1;
  WHILE v_idx <= v_matches_in_round LOOP
    v_p1 := CASE WHEN (v_idx * 2 - 1) <= array_length(v_participants, 1) THEN v_participants[v_idx * 2 - 1] ELSE NULL END;
    v_p2 := CASE WHEN (v_idx * 2) <= array_length(v_participants, 1) THEN v_participants[v_idx * 2] ELSE NULL END;

    IF v_p1 IS NOT NULL AND v_p2 IS NOT NULL THEN
      v_status := 'pending';
    ELSIF v_p1 IS NOT NULL OR v_p2 IS NOT NULL THEN
      v_status := 'bye';
    ELSE
      v_status := 'pending';
    END IF;

    INSERT INTO public.tournament_matches (
      tournament_id, round, match_index, match_number, player1_id, player2_id, status
    ) VALUES (p_tournament_id, 1, v_match_index, v_idx, v_p1, v_p2, v_status);

    v_match_index := v_match_index + 1;
    v_idx := v_idx + 1;
  END LOOP;

  v_round := 2;
  WHILE v_matches_in_round > 1 LOOP
    v_matches_in_round := v_matches_in_round / 2;
    v_match_index := 0;
    v_idx := 1;
    WHILE v_idx <= v_matches_in_round LOOP
      INSERT INTO public.tournament_matches (
        tournament_id, round, match_index, match_number, status
      ) VALUES (p_tournament_id, v_round, v_match_index, v_idx, 'pending');
      v_match_index := v_match_index + 1;
      v_idx := v_idx + 1;
    END LOOP;
    v_round := v_round + 1;
  END LOOP;

  UPDATE public.tournaments
  SET bracket_generated_at = now(), status = 'in_progress', started_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true, 'bracket_size', v_bracket_size,
    'participants', v_participant_count
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION generate_tournament_bracket(uuid) TO authenticated;
