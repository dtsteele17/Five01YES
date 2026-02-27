-- Fix tournament_matches status CHECK constraint to allow all needed statuses
-- Also re-run generate_tournament_bracket with the latest fixes

-- Drop and recreate the status check constraint
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'cancelled', 'forfeited', 'bye'));

-- Also fix tournament_participants role check (seen in error logs)
ALTER TABLE tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_role_check;
ALTER TABLE tournament_participants ADD CONSTRAINT tournament_participants_role_check
  CHECK (status_type IN ('registered', 'checked-in', 'invited', 'creator', 'eliminated'));

-- Re-create generate_tournament_bracket with bye handling
DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID) CASCADE;
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_participants UUID[];
  v_count INTEGER;
  v_rounds INTEGER;
  v_bracket_size INTEGER;
  v_round INTEGER;
  v_match_index INTEGER;
  v_matches_in_round INTEGER;
BEGIN
  SELECT ARRAY_AGG(user_id ORDER BY RANDOM()) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status_type = 'registered';

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Need at least 2 participants');
  END IF;

  v_bracket_size := 1;
  WHILE v_bracket_size < v_count LOOP v_bracket_size := v_bracket_size * 2; END LOOP;
  v_rounds := CEIL(LOG(2, v_bracket_size))::integer;

  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;

  -- Round 1
  v_matches_in_round := v_bracket_size / 2;
  FOR v_match_index IN 0..(v_matches_in_round - 1) LOOP
    DECLARE
      p1_idx INTEGER := v_match_index * 2 + 1;
      p2_idx INTEGER := v_match_index * 2 + 2;
      p1_id UUID := CASE WHEN p1_idx <= v_count THEN v_participants[p1_idx] ELSE NULL END;
      p2_id UUID := CASE WHEN p2_idx <= v_count THEN v_participants[p2_idx] ELSE NULL END;
      match_status TEXT := 'pending';
    BEGIN
      IF p1_id IS NOT NULL AND p2_id IS NULL THEN
        match_status := 'completed'; -- bye
      ELSIF p1_id IS NOT NULL AND p2_id IS NOT NULL THEN
        match_status := 'ready';
      END IF;

      INSERT INTO tournament_matches (tournament_id, round, match_index, player1_id, player2_id, status, winner_id)
      VALUES (p_tournament_id, 1, v_match_index, p1_id, p2_id, match_status,
              CASE WHEN p2_id IS NULL AND p1_id IS NOT NULL THEN p1_id ELSE NULL END);
    END;
  END LOOP;

  -- Subsequent rounds
  FOR v_round IN 2..v_rounds LOOP
    v_matches_in_round := v_bracket_size / POWER(2, v_round)::integer;
    FOR v_match_index IN 0..(v_matches_in_round - 1) LOOP
      INSERT INTO tournament_matches (tournament_id, round, match_index, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_round, v_match_index, NULL, NULL, 'pending');
    END LOOP;
  END LOOP;

  -- Auto-advance byes to round 2
  DECLARE
    v_bye_match RECORD;
    v_next_match RECORD;
  BEGIN
    FOR v_bye_match IN
      SELECT * FROM tournament_matches
      WHERE tournament_id = p_tournament_id AND round = 1 AND status = 'completed' AND winner_id IS NOT NULL
    LOOP
      SELECT * INTO v_next_match FROM tournament_matches
      WHERE tournament_id = p_tournament_id AND round = 2 AND match_index = v_bye_match.match_index / 2;

      IF FOUND THEN
        IF v_bye_match.match_index % 2 = 0 THEN
          UPDATE tournament_matches SET player1_id = v_bye_match.winner_id WHERE id = v_next_match.id;
        ELSE
          UPDATE tournament_matches SET player2_id = v_bye_match.winner_id WHERE id = v_next_match.id;
        END IF;
      END IF;
    END LOOP;
  END;

  -- Mark round 2 matches ready if both players filled
  UPDATE tournament_matches SET status = 'ready'
  WHERE tournament_id = p_tournament_id AND round = 2
    AND player1_id IS NOT NULL AND player2_id IS NOT NULL AND status = 'pending';

  UPDATE tournaments SET status = 'in_progress', started_at = NOW(), bracket_generated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN json_build_object('success', true, 'participants', v_count, 'rounds', v_rounds, 'bracket_size', v_bracket_size);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;
