/*
  # Fix Tournament RPC Parameter Names

  1. Changes
    - Update RPC function signatures to use unprefixed parameter names
    - This matches the client-side calling convention
  
  2. Functions Updated
    - `start_tournament` - use `tournament_id` instead of `p_tournament_id`
    - `report_tournament_match_winner` - use unprefixed parameter names
*/

-- Drop and recreate start_tournament with correct parameter name
DROP FUNCTION IF EXISTS start_tournament(uuid);

CREATE FUNCTION start_tournament(tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_bracket_result jsonb;
  v_start_result jsonb;
BEGIN
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament not found'
    );
  END IF;

  IF v_tournament.status = 'in_progress' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Tournament already in progress'
    );
  END IF;

  IF v_tournament.bracket_generated_at IS NULL THEN
    SELECT generate_tournament_bracket(tournament_id) INTO v_bracket_result;
    
    IF NOT (v_bracket_result->>'success')::boolean THEN
      RETURN v_bracket_result;
    END IF;
  END IF;

  SELECT start_tournament_round_one(tournament_id) INTO v_start_result;
  
  RETURN v_start_result;
END;
$$;

-- Drop and recreate report_tournament_match_winner with correct parameter names
DROP FUNCTION IF EXISTS report_tournament_match_winner(uuid, int, int, uuid);

CREATE FUNCTION report_tournament_match_winner(
  tournament_id uuid,
  round int,
  match_index int,
  winner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_next_match_index int;
  v_total_matches_in_round int;
  v_completed_matches_in_round int;
  v_is_player_slot_1 boolean;
BEGIN
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament not found'
    );
  END IF;

  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
    AND tournament_matches.round = report_tournament_match_winner.round
    AND tournament_matches.match_index = report_tournament_match_winner.match_index;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Match not found'
    );
  END IF;

  IF winner_id != v_match.player1_id AND winner_id != v_match.player2_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Winner must be one of the match players'
    );
  END IF;

  IF v_match.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Match is not in pending status'
    );
  END IF;

  UPDATE public.tournament_matches
  SET 
    winner_id = report_tournament_match_winner.winner_id,
    status = 'completed',
    updated_at = now()
  WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
    AND tournament_matches.round = report_tournament_match_winner.round
    AND tournament_matches.match_index = report_tournament_match_winner.match_index;

  SELECT COUNT(*) INTO v_total_matches_in_round
  FROM public.tournament_matches
  WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
    AND tournament_matches.round = report_tournament_match_winner.round;

  IF v_total_matches_in_round = 1 THEN
    UPDATE public.tournaments
    SET 
      status = 'completed',
      updated_at = now()
    WHERE id = tournament_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Tournament completed!',
      'tournament_completed', true
    );
  END IF;

  v_next_match_index := (match_index + 1) / 2;
  v_is_player_slot_1 := (match_index % 2 = 1);

  IF v_is_player_slot_1 THEN
    UPDATE public.tournament_matches
    SET 
      player1_id = winner_id,
      status = CASE 
        WHEN player2_id IS NOT NULL THEN 'pending'
        ELSE 'bye'
      END,
      updated_at = now()
    WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
      AND tournament_matches.round = report_tournament_match_winner.round + 1
      AND tournament_matches.match_index = v_next_match_index;
  ELSE
    UPDATE public.tournament_matches
    SET 
      player2_id = winner_id,
      status = CASE 
        WHEN player1_id IS NOT NULL THEN 'pending'
        ELSE 'bye'
      END,
      updated_at = now()
    WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
      AND tournament_matches.round = report_tournament_match_winner.round + 1
      AND tournament_matches.match_index = v_next_match_index;
  END IF;

  SELECT COUNT(*) INTO v_completed_matches_in_round
  FROM public.tournament_matches
  WHERE tournament_matches.tournament_id = report_tournament_match_winner.tournament_id
    AND tournament_matches.round = report_tournament_match_winner.round
    AND status = 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match result recorded',
    'round_completed', v_completed_matches_in_round = v_total_matches_in_round,
    'winner_advanced', true
  );
END;
$$;
