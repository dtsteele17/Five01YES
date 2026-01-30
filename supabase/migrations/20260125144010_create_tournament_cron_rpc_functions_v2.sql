/*
  # Create Tournament Cron RPC Functions

  1. New Functions
    - `generate_tournament_bracket(tournament_id UUID)`
      - Generates tournament bracket by creating tournament_matches records
      - Sets bracket_generated_at timestamp
      - Validates tournament has enough participants

    - `start_tournament_round_one(tournament_id UUID)`
      - Starts the first round of a tournament
      - Calls start_tournament_round_matches for round 1
      - Sets started_at timestamp
      - Updates status to 'in_progress'

  2. Purpose
    - Automate tournament bracket generation before tournament start
    - Automate tournament start when scheduled time arrives
    - Enable cron job to manage tournament lifecycle

  3. Security
    - Both functions use SECURITY DEFINER to bypass RLS
    - Granted to service_role for cron job execution
    - Validates tournament exists and is in correct state
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS generate_tournament_bracket(uuid);
DROP FUNCTION IF EXISTS start_tournament_round_one(uuid);

-- Function to generate tournament bracket
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_tournament record;
  v_participant_count integer;
  v_max_participants integer;
  v_round integer;
  v_matches_in_round integer;
  v_participants uuid[];
  v_idx integer;
  v_match_id uuid;
begin
  -- Get tournament details
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Check if bracket already generated
  IF v_tournament.bracket_generated_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Bracket already generated',
      'tournament_id', p_tournament_id
    );
  END IF;

  -- Get participant count
  SELECT COUNT(*), v_tournament.max_participants
  INTO v_participant_count, v_max_participants
  FROM public.tournament_participants
  WHERE tournament_id = p_tournament_id
  GROUP BY v_tournament.max_participants;

  -- Validate minimum participants (at least 2)
  IF v_participant_count < 2 THEN
    RAISE EXCEPTION 'Tournament needs at least 2 participants to generate bracket';
  END IF;

  -- Get all participants ordered by joined_at
  SELECT array_agg(user_id ORDER BY joined_at)
  INTO v_participants
  FROM public.tournament_participants
  WHERE tournament_id = p_tournament_id;

  -- Calculate number of rounds (log2 of max participants)
  v_round := 1;
  v_matches_in_round := v_max_participants / 2;

  -- Generate first round matches
  v_idx := 1;
  WHILE v_idx <= v_matches_in_round LOOP
    INSERT INTO public.tournament_matches (
      tournament_id,
      round,
      match_number,
      player1_id,
      player2_id,
      status
    ) VALUES (
      p_tournament_id,
      1,
      v_idx,
      CASE WHEN v_idx <= array_length(v_participants, 1) THEN v_participants[v_idx * 2 - 1] ELSE NULL END,
      CASE WHEN v_idx * 2 <= array_length(v_participants, 1) THEN v_participants[v_idx * 2] ELSE NULL END,
      CASE
        WHEN v_idx * 2 <= array_length(v_participants, 1) THEN 'pending'
        WHEN v_idx <= array_length(v_participants, 1) THEN 'bye'
        ELSE 'pending'
      END
    );
    v_idx := v_idx + 1;
  END LOOP;

  -- Generate subsequent round placeholders
  v_round := 2;
  WHILE v_matches_in_round > 1 LOOP
    v_matches_in_round := v_matches_in_round / 2;
    v_idx := 1;
    WHILE v_idx <= v_matches_in_round LOOP
      INSERT INTO public.tournament_matches (
        tournament_id,
        round,
        match_number,
        status
      ) VALUES (
        p_tournament_id,
        v_round,
        v_idx,
        'pending'
      );
      v_idx := v_idx + 1;
    END LOOP;
    v_round := v_round + 1;
  END LOOP;

  -- Update bracket_generated_at
  UPDATE public.tournaments
  SET bracket_generated_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Bracket generated successfully',
    'tournament_id', p_tournament_id,
    'participants', v_participant_count,
    'matches_created', (SELECT COUNT(*) FROM public.tournament_matches WHERE tournament_id = p_tournament_id)
  );
END;
$$;

-- Function to start tournament round one
CREATE OR REPLACE FUNCTION start_tournament_round_one(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  v_tournament record;
begin
  -- Get tournament details
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Check if already started
  IF v_tournament.started_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Tournament already started',
      'tournament_id', p_tournament_id
    );
  END IF;

  -- Check if bracket is generated
  IF v_tournament.bracket_generated_at IS NULL THEN
    RAISE EXCEPTION 'Bracket must be generated before starting tournament';
  END IF;

  -- Start round 1 matches
  PERFORM start_tournament_round_matches(p_tournament_id, 1);

  -- Update started_at timestamp
  UPDATE public.tournaments
  SET started_at = now()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Tournament started successfully',
    'tournament_id', p_tournament_id,
    'started_at', now()
  );
END;
$$;

-- Grant execute permissions to service_role
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION start_tournament_round_one(uuid) TO service_role;

-- Also grant to authenticated for manual testing
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION start_tournament_round_one(uuid) TO authenticated;
