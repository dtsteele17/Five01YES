/*
  # Create Tournament Flow System

  1. Views
    - Drop and recreate `v_tournament_bracket` - All tournament matches with player info
    - Drop and recreate `v_tournament_playable_matches` - Only matches that can be played now

  2. RPC Functions
    - `start_tournament(p_tournament_id UUID)` - Wrapper to generate bracket and start tournament
    - `report_tournament_match_winner(p_tournament_id UUID, p_round INT, p_match_index INT, p_winner_id UUID)` - Report match result and advance bracket

  3. Purpose
    - Enable tournament flow UI with host controls
    - Simplify bracket queries and next match detection
    - Handle match completion and winner advancement
*/

-- Drop existing views
DROP VIEW IF EXISTS v_tournament_bracket CASCADE;
DROP VIEW IF EXISTS v_tournament_playable_matches CASCADE;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS start_tournament(uuid);
DROP FUNCTION IF EXISTS report_tournament_match_winner(uuid, int, int, uuid);

-- View: All tournament matches (bracket view)
CREATE VIEW v_tournament_bracket AS
SELECT 
  tm.tournament_id,
  tm.round,
  tm.match_index,
  tm.match_number,
  tm.player1_id,
  tm.player2_id,
  tm.winner_id,
  tm.status,
  tm.updated_at AS completed_at,
  p1.username AS player1_username,
  p1.avatar_url AS player1_avatar_url,
  p2.username AS player2_username,
  p2.avatar_url AS player2_avatar_url
FROM tournament_matches tm
LEFT JOIN profiles p1 ON tm.player1_id = p1.id
LEFT JOIN profiles p2 ON tm.player2_id = p2.id;

-- View: Only playable matches (both players present, status pending)
CREATE VIEW v_tournament_playable_matches AS
SELECT 
  tm.tournament_id,
  tm.round,
  tm.match_index,
  tm.match_number,
  tm.player1_id,
  tm.player2_id,
  tm.winner_id,
  tm.status,
  tm.updated_at AS completed_at,
  p1.username AS player1_username,
  p1.avatar_url AS player1_avatar_url,
  p2.username AS player2_username,
  p2.avatar_url AS player2_avatar_url
FROM tournament_matches tm
LEFT JOIN profiles p1 ON tm.player1_id = p1.id
LEFT JOIN profiles p2 ON tm.player2_id = p2.id
WHERE tm.status = 'pending'
  AND tm.player1_id IS NOT NULL
  AND tm.player2_id IS NOT NULL;

-- RPC: Start tournament (wrapper function)
CREATE FUNCTION start_tournament(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_bracket_result jsonb;
  v_start_result jsonb;
BEGIN
  -- Get tournament
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament not found'
    );
  END IF;

  -- Check if already started
  IF v_tournament.status = 'in_progress' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Tournament already in progress'
    );
  END IF;

  -- Generate bracket if not already generated
  IF v_tournament.bracket_generated_at IS NULL THEN
    SELECT generate_tournament_bracket(p_tournament_id) INTO v_bracket_result;
    
    IF NOT (v_bracket_result->>'success')::boolean THEN
      RETURN v_bracket_result;
    END IF;
  END IF;

  -- Start round one
  SELECT start_tournament_round_one(p_tournament_id) INTO v_start_result;
  
  RETURN v_start_result;
END;
$$;

-- RPC: Report tournament match winner
CREATE FUNCTION report_tournament_match_winner(
  p_tournament_id uuid,
  p_round int,
  p_match_index int,
  p_winner_id uuid
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
  -- Get tournament
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament not found'
    );
  END IF;

  -- Get the match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND match_index = p_match_index;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Match not found'
    );
  END IF;

  -- Validate winner is one of the players
  IF p_winner_id != v_match.player1_id AND p_winner_id != v_match.player2_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Winner must be one of the match players'
    );
  END IF;

  -- Validate match is playable
  IF v_match.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Match is not in pending status'
    );
  END IF;

  -- Update match with winner
  UPDATE public.tournament_matches
  SET 
    winner_id = p_winner_id,
    status = 'completed',
    updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND match_index = p_match_index;

  -- Check if this is the final
  SELECT COUNT(*) INTO v_total_matches_in_round
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = p_round;

  IF v_total_matches_in_round = 1 THEN
    -- This was the final match, tournament is complete
    UPDATE public.tournaments
    SET 
      status = 'completed',
      updated_at = now()
    WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Tournament completed!',
      'tournament_completed', true
    );
  END IF;

  -- Advance winner to next round
  -- Calculate next round match index (parent match)
  v_next_match_index := (p_match_index + 1) / 2;
  v_is_player_slot_1 := (p_match_index % 2 = 1);

  -- Update next round match with winner
  IF v_is_player_slot_1 THEN
    UPDATE public.tournament_matches
    SET 
      player1_id = p_winner_id,
      status = CASE 
        WHEN player2_id IS NOT NULL THEN 'pending'
        ELSE 'bye'
      END,
      updated_at = now()
    WHERE tournament_id = p_tournament_id
      AND round = p_round + 1
      AND match_index = v_next_match_index;
  ELSE
    UPDATE public.tournament_matches
    SET 
      player2_id = p_winner_id,
      status = CASE 
        WHEN player1_id IS NOT NULL THEN 'pending'
        ELSE 'bye'
      END,
      updated_at = now()
    WHERE tournament_id = p_tournament_id
      AND round = p_round + 1
      AND match_index = v_next_match_index;
  END IF;

  -- Check if the round is complete
  SELECT COUNT(*) INTO v_completed_matches_in_round
  FROM public.tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = p_round
    AND status = 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match result recorded',
    'round_completed', v_completed_matches_in_round = v_total_matches_in_round,
    'winner_advanced', true
  );
END;
$$;

-- Grant permissions
GRANT SELECT ON v_tournament_bracket TO authenticated;
GRANT SELECT ON v_tournament_playable_matches TO authenticated;
