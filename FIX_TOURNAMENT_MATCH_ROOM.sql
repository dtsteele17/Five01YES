-- ==========================================================
-- FIX: create_tournament_match_room - Uses match_rooms table (NOT online_matches)
-- Apply this to fix the 400 error when creating tournament match rooms
-- ==========================================================

DROP FUNCTION IF EXISTS create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION create_tournament_match_room(
  p_tournament_match_id UUID,
  p_player1_id UUID,
  p_player2_id UUID,
  p_tournament_id UUID,
  p_game_mode INTEGER DEFAULT 501,
  p_legs_per_match INTEGER DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id UUID;
  v_tournament RECORD;
  v_legs_to_win INTEGER;
  v_match_format TEXT;
BEGIN
  -- Get tournament settings
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;

  -- Calculate legs to win and match format
  v_legs_to_win := CEIL(COALESCE(v_tournament.legs_per_match, p_legs_per_match)::numeric / 2);
  v_match_format := 'best-of-' || COALESCE(v_tournament.legs_per_match, p_legs_per_match)::text;

  -- Create match room using match_rooms table (the actual table in Supabase)
  INSERT INTO match_rooms (
    player1_id,
    player2_id,
    game_mode,
    match_format,
    status,
    current_leg,
    legs_to_win,
    player1_remaining,
    player2_remaining,
    current_turn,
    source,
    match_type,
    tournament_match_id
  ) VALUES (
    p_player1_id,
    p_player2_id,
    COALESCE(v_tournament.starting_score, p_game_mode),
    v_match_format,
    'active',
    1,
    v_legs_to_win,
    COALESCE(v_tournament.starting_score, p_game_mode),
    COALESCE(v_tournament.starting_score, p_game_mode),
    p_player1_id,
    'tournament',
    'tournament',
    p_tournament_match_id
  )
  RETURNING id INTO v_room_id;

  -- Update tournament match with room ID
  UPDATE tournament_matches
  SET match_room_id = v_room_id::text,
      status = 'in_progress'
  WHERE id = p_tournament_match_id;

  RETURN json_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Match room created!'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'detail', 'Failed to create match room'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ==========================================================
-- Also ensure progress_tournament_bracket exists
-- ==========================================================
DROP FUNCTION IF EXISTS progress_tournament_bracket(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION progress_tournament_bracket(
  p_tournament_match_id UUID,
  p_winner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_next_match RECORD;
  v_next_match_index INTEGER;
  v_next_round INTEGER;
  v_max_round INTEGER;
BEGIN
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_tournament_match_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Update match with winner
  UPDATE tournament_matches
  SET winner_id = p_winner_id, status = 'completed'
  WHERE id = p_tournament_match_id;

  -- Get max round
  SELECT MAX(round) INTO v_max_round
  FROM tournament_matches WHERE tournament_id = v_match.tournament_id;

  -- If final match, complete tournament
  IF v_match.round >= v_max_round THEN
    UPDATE tournaments SET status = 'completed' WHERE id = v_match.tournament_id;
    RETURN json_build_object('success', true, 'action', 'tournament_complete', 'winner_id', p_winner_id);
  END IF;

  -- Advance winner to next round
  v_next_round := v_match.round + 1;
  v_next_match_index := v_match.match_index / 2;

  SELECT * INTO v_next_match
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round = v_next_round AND match_index = v_next_match_index;

  IF FOUND THEN
    IF v_match.match_index % 2 = 0 THEN
      UPDATE tournament_matches SET player1_id = p_winner_id WHERE id = v_next_match.id;
    ELSE
      UPDATE tournament_matches SET player2_id = p_winner_id WHERE id = v_next_match.id;
    END IF;

    -- If both players set, mark as ready
    SELECT * INTO v_next_match FROM tournament_matches WHERE id = v_next_match.id;
    IF v_next_match.player1_id IS NOT NULL AND v_next_match.player2_id IS NOT NULL THEN
      UPDATE tournament_matches SET status = 'ready' WHERE id = v_next_match.id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'action', 'winner_advanced', 'next_round', v_next_round);
END;
$$;

GRANT EXECUTE ON FUNCTION progress_tournament_bracket(UUID, UUID) TO authenticated;

-- ==========================================================
-- Ensure tournament_matches has needed columns
-- ==========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_room_id') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_room_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_index') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_index INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'winner_id') THEN
    ALTER TABLE tournament_matches ADD COLUMN winner_id UUID;
  END IF;
END $$;

-- ==========================================================
-- Ensure match_rooms has tournament_match_id column
-- ==========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_rooms' AND column_name = 'tournament_match_id') THEN
    ALTER TABLE match_rooms ADD COLUMN tournament_match_id UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round, match_index);
