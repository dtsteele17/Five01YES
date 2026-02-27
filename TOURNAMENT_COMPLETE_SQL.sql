-- ================================================================
-- FIVE01 TOURNAMENT SYSTEM - COMPLETE SQL
-- Apply this ONE file in Supabase SQL Editor. It contains everything.
-- Safe to run multiple times (uses CREATE OR REPLACE / DROP IF EXISTS)
-- Last updated: 2026-02-27
-- ================================================================

-- ============================================
-- 0. FIX CHECK CONSTRAINTS
-- ============================================
-- This MUST run first to avoid constraint violations in the functions below
-- Drop constraint FIRST so we can clean up rows freely
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
-- Normalize any non-standard statuses
UPDATE tournament_matches SET status = 'completed' WHERE status NOT IN ('pending', 'ready', 'ready_check', 'in_progress', 'completed', 'cancelled', 'forfeited', 'bye');
-- Now add the constraint
ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('pending', 'ready', 'ready_check', 'in_progress', 'completed', 'cancelled', 'forfeited', 'bye'));

-- ============================================
-- 1. ENSURE TABLES & COLUMNS EXIST
-- ============================================

-- Ensure tournament_matches has all needed columns
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

-- Ensure match_rooms has tournament_match_id column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_rooms' AND column_name = 'tournament_match_id') THEN
    ALTER TABLE match_rooms ADD COLUMN tournament_match_id UUID;
  END IF;
END $$;

-- Tournament match ready table
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);
ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view match ready status" ON tournament_match_ready;
CREATE POLICY "Users can view match ready status" ON tournament_match_ready FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own ready status" ON tournament_match_ready;
CREATE POLICY "Users can insert their own ready status" ON tournament_match_ready FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. JOIN TOURNAMENT
-- ============================================
DROP FUNCTION IF EXISTS join_tournament(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION join_tournament(p_tournament_id UUID, p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Tournament not found'); END IF;

  IF v_tournament.status NOT IN ('registration', 'scheduled', 'checkin') THEN
    RETURN json_build_object('success', false, 'error', 'Tournament registration is closed');
  END IF;

  SELECT COUNT(*) INTO v_participant_count FROM tournament_participants WHERE tournament_id = p_tournament_id;
  IF v_participant_count >= v_tournament.max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Tournament is full');
  END IF;

  IF EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already registered');
  END IF;

  INSERT INTO tournament_participants (tournament_id, user_id, role, status_type, joined_at)
  VALUES (p_tournament_id, p_user_id, 'participant', 'registered', NOW());

  SELECT COUNT(*) INTO v_participant_count FROM tournament_participants WHERE tournament_id = p_tournament_id;
  RETURN json_build_object('success', true, 'message', 'Joined!', 'participant_count', v_participant_count);
EXCEPTION
  WHEN unique_violation THEN RETURN json_build_object('success', false, 'error', 'Already registered');
  WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- 3. AUTO-REGISTER TOURNAMENT CREATOR
-- ============================================
DROP FUNCTION IF EXISTS auto_register_tournament_creator(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION auto_register_tournament_creator(p_tournament_id UUID, p_creator_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO tournament_participants (tournament_id, user_id, role, status_type, joined_at)
  VALUES (p_tournament_id, p_creator_user_id, 'creator', 'registered', NOW())
  ON CONFLICT (tournament_id, user_id) DO NOTHING;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- 4. GENERATE TOURNAMENT BRACKET
-- ============================================
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
  -- Get registered participants (randomized order)
  SELECT ARRAY_AGG(user_id ORDER BY RANDOM()) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status_type = 'registered';

  v_count := COALESCE(array_length(v_participants, 1), 0);
  IF v_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Need at least 2 participants');
  END IF;

  -- Calculate bracket size (next power of 2)
  v_bracket_size := 1;
  WHILE v_bracket_size < v_count LOOP v_bracket_size := v_bracket_size * 2; END LOOP;
  v_rounds := CEIL(LOG(2, v_bracket_size))::integer;

  -- Delete existing matches
  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;

  -- Create Round 1 matches
  v_matches_in_round := v_bracket_size / 2;
  FOR v_match_index IN 0..(v_matches_in_round - 1) LOOP
    DECLARE
      p1_idx INTEGER := v_match_index * 2 + 1;
      p2_idx INTEGER := v_match_index * 2 + 2;
      p1_id UUID := CASE WHEN p1_idx <= v_count THEN v_participants[p1_idx] ELSE NULL END;
      p2_id UUID := CASE WHEN p2_idx <= v_count THEN v_participants[p2_idx] ELSE NULL END;
      match_status TEXT := 'pending';
    BEGIN
      -- If only one player (bye), auto-advance them
      IF p1_id IS NOT NULL AND p2_id IS NULL THEN
        match_status := 'completed';
      ELSIF p1_id IS NOT NULL AND p2_id IS NOT NULL THEN
        match_status := 'ready';
      END IF;

      INSERT INTO tournament_matches (tournament_id, round, match_index, player1_id, player2_id, status, winner_id)
      VALUES (p_tournament_id, 1, v_match_index, p1_id, p2_id, match_status,
              CASE WHEN p2_id IS NULL AND p1_id IS NOT NULL THEN p1_id ELSE NULL END);
    END;
  END LOOP;

  -- Create empty matches for subsequent rounds
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

  -- Mark round 2 matches as 'ready' if both players are filled (from byes)
  UPDATE tournament_matches
  SET status = 'ready'
  WHERE tournament_id = p_tournament_id
    AND round = 2
    AND player1_id IS NOT NULL
    AND player2_id IS NOT NULL
    AND status = 'pending';

  -- Update tournament status
  UPDATE tournaments
  SET status = 'in_progress', started_at = NOW(), bracket_generated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN json_build_object('success', true, 'participants', v_count, 'rounds', v_rounds, 'bracket_size', v_bracket_size);
END;
$$;

-- ============================================
-- 5. COMPLETE TOURNAMENT FLOW PROGRESSION
-- ============================================
DROP FUNCTION IF EXISTS complete_tournament_flow_progression(UUID) CASCADE;
CREATE OR REPLACE FUNCTION complete_tournament_flow_progression(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Tournament not found', 'tournament_id', p_tournament_id); END IF;

  SELECT COUNT(*) INTO v_participant_count FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status_type = 'registered';

  -- Already started
  IF v_tournament.status = 'in_progress' THEN
    RETURN json_build_object('success', true, 'action', 'already_live', 'participant_count', v_participant_count);
  END IF;

  -- Not yet started and before start time
  IF v_tournament.start_at > v_now AND v_tournament.status NOT IN ('cancelled', 'completed') THEN
    RETURN json_build_object('success', true, 'action', 'still_open', 'participant_count', v_participant_count);
  END IF;

  -- Start time reached
  IF v_tournament.status IN ('scheduled', 'checkin', 'registration') AND v_tournament.start_at <= v_now THEN
    IF v_participant_count >= 2 THEN
      RETURN json_build_object('success', true, 'action', 'tournament_live', 'participant_count', v_participant_count);
    ELSE
      UPDATE tournaments SET status = 'cancelled' WHERE id = p_tournament_id;
      RETURN json_build_object('success', true, 'action', 'tournament_cancelled', 'participant_count', v_participant_count);
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'action', 'no_action', 'status', v_tournament.status);
END;
$$;

-- ============================================
-- 6. PROCESS ALL TOURNAMENT STATUS TRANSITIONS (batch)
-- ============================================
DROP FUNCTION IF EXISTS process_tournament_status_transitions() CASCADE;
CREATE OR REPLACE FUNCTION process_tournament_status_transitions()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_tournament IN
    SELECT id FROM tournaments WHERE status IN ('scheduled', 'checkin', 'registration') AND start_at <= NOW()
  LOOP
    PERFORM complete_tournament_flow_progression(v_tournament.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN json_build_object('success', true, 'processed', v_count);
END;
$$;

-- ============================================
-- 7. CREATE TOURNAMENT MATCH ROOM (uses match_rooms table)
-- ============================================
DROP FUNCTION IF EXISTS create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) CASCADE;
CREATE OR REPLACE FUNCTION create_tournament_match_room(
  p_tournament_match_id UUID, p_player1_id UUID, p_player2_id UUID,
  p_tournament_id UUID, p_game_mode INTEGER DEFAULT 501, p_legs_per_match INTEGER DEFAULT 5
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_room_id UUID;
  v_tournament RECORD;
  v_legs_to_win INTEGER;
  v_game_mode INTEGER;
  v_best_of INTEGER;
  v_existing_room TEXT;
BEGIN
  -- Check if room already exists (prevents duplicate rooms for same match)
  SELECT match_room_id INTO v_existing_room FROM tournament_matches WHERE id = p_tournament_match_id;
  IF v_existing_room IS NOT NULL THEN
    RETURN json_build_object('success', true, 'room_id', v_existing_room::uuid, 'message', 'Room already exists');
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  v_best_of := COALESCE(v_tournament.legs_per_match, p_legs_per_match);
  v_game_mode := COALESCE(v_tournament.game_mode, p_game_mode);
  v_legs_to_win := CEIL(v_best_of::numeric / 2);

  INSERT INTO match_rooms (
    player1_id, player2_id, game_mode, match_format, status,
    current_leg, legs_to_win, player1_remaining, player2_remaining,
    current_turn, source, match_type, tournament_match_id
  ) VALUES (
    p_player1_id, p_player2_id,
    v_game_mode,
    'best-of-' || v_best_of::text,
    'active', 1, v_legs_to_win,
    v_game_mode, v_game_mode,
    p_player1_id, 'tournament', 'tournament', p_tournament_match_id
  ) RETURNING id INTO v_room_id;

  UPDATE tournament_matches SET match_room_id = v_room_id::text, status = 'in_progress'
  WHERE id = p_tournament_match_id;

  RETURN json_build_object('success', true, 'room_id', v_room_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- 8. PROGRESS TOURNAMENT BRACKET (advance winner)
-- ============================================
DROP FUNCTION IF EXISTS progress_tournament_bracket(UUID, UUID) CASCADE;
CREATE OR REPLACE FUNCTION progress_tournament_bracket(p_tournament_match_id UUID, p_winner_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match RECORD;
  v_next_match RECORD;
  v_max_round INTEGER;
BEGIN
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_tournament_match_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Match not found'); END IF;

  UPDATE tournament_matches SET winner_id = p_winner_id, status = 'completed' WHERE id = p_tournament_match_id;

  SELECT MAX(round) INTO v_max_round FROM tournament_matches WHERE tournament_id = v_match.tournament_id;

  -- Final match = tournament complete
  IF v_match.round >= v_max_round THEN
    UPDATE tournaments SET status = 'completed' WHERE id = v_match.tournament_id;
    RETURN json_build_object('success', true, 'action', 'tournament_complete', 'winner_id', p_winner_id);
  END IF;

  -- Advance winner to next round
  SELECT * INTO v_next_match FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id AND round = v_match.round + 1 AND match_index = v_match.match_index / 2;

  IF FOUND THEN
    IF v_match.match_index % 2 = 0 THEN
      UPDATE tournament_matches SET player1_id = p_winner_id WHERE id = v_next_match.id;
    ELSE
      UPDATE tournament_matches SET player2_id = p_winner_id WHERE id = v_next_match.id;
    END IF;

    SELECT * INTO v_next_match FROM tournament_matches WHERE id = v_next_match.id;
    IF v_next_match.player1_id IS NOT NULL AND v_next_match.player2_id IS NOT NULL THEN
      UPDATE tournament_matches SET status = 'ready' WHERE id = v_next_match.id;
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'action', 'winner_advanced', 'next_round', v_match.round + 1);
END;
$$;

-- ============================================
-- 9. READY UP TOURNAMENT MATCH
-- ============================================
DROP FUNCTION IF EXISTS ready_up_tournament_match(UUID) CASCADE;
CREATE OR REPLACE FUNCTION ready_up_tournament_match(p_match_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match RECORD;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Match not found'); END IF;
  IF v_uid NOT IN (v_match.player1_id, v_match.player2_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not in this match');
  END IF;

  INSERT INTO tournament_match_ready (match_id, user_id) VALUES (p_match_id, v_uid)
  ON CONFLICT (match_id, user_id) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================
-- 10. GRANTS
-- ============================================
GRANT EXECUTE ON FUNCTION join_tournament(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_register_tournament_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO authenticated;
GRANT EXECUTE ON FUNCTION create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION progress_tournament_bracket(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION ready_up_tournament_match(UUID) TO authenticated;

-- ============================================
-- 11. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round, match_index);
CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id ON tournament_match_ready(match_id);

-- ============================================
-- 12. ONE-TIME CLEANUP: Cancel all currently "live" tournaments
-- ============================================
UPDATE tournaments SET status = 'cancelled' WHERE status = 'in_progress';

-- Also clean up any 'scheduled' tournaments whose start_at has passed
UPDATE tournaments SET status = 'cancelled' 
WHERE status IN ('scheduled', 'checkin', 'registration') AND start_at < NOW();

-- ============================================
-- DONE! Tournament system is ready.
-- ============================================
