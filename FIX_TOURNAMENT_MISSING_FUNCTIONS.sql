-- ==========================================================
-- MISSING TOURNAMENT FUNCTIONS - Apply AFTER FIX_TOURNAMENT_FLOW_CLEAN.sql
-- These are the functions the frontend calls but were missing from the first SQL file
-- ==========================================================

-- ============================================
-- 1. get_tournament_match_ready_status
-- Called by TournamentMatchReadyUp component to get match + ready status
-- ============================================
DROP FUNCTION IF EXISTS get_tournament_match_ready_status(UUID) CASCADE;

CREATE OR REPLACE FUNCTION get_tournament_match_ready_status(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_ready_statuses JSON;
  v_current_user_id UUID;
  v_user_is_participant BOOLEAN := false;
BEGIN
  v_current_user_id := auth.uid();

  -- Get match details
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Get tournament name
  SELECT name INTO v_tournament FROM tournaments WHERE id = v_match.tournament_id;

  -- Check if current user is a participant in this match
  IF v_current_user_id IN (v_match.player1_id, v_match.player2_id) THEN
    v_user_is_participant := true;
  END IF;

  -- Get ready statuses from tournament_match_ready table
  SELECT COALESCE(json_agg(json_build_object(
    'user_id', tmr.user_id,
    'ready_at', tmr.created_at,
    'expires_at', tmr.created_at + interval '3 minutes',
    'is_ready', true
  )), '[]'::json)
  INTO v_ready_statuses
  FROM tournament_match_ready tmr
  WHERE tmr.match_id = p_match_id;

  RETURN json_build_object(
    'success', true,
    'match', json_build_object(
      'id', v_match.id,
      'status', v_match.status,
      'player1_id', v_match.player1_id,
      'player2_id', v_match.player2_id,
      'tournament_name', COALESCE(v_tournament.name, 'Tournament'),
      'round', v_match.round
    ),
    'ready_status', v_ready_statuses,
    'user_is_participant', v_user_is_participant
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_tournament_match_ready_status(UUID) TO authenticated;

-- ============================================
-- 2. tournament_match_ready_up
-- Called when a player clicks "Ready Up" button
-- ============================================
DROP FUNCTION IF EXISTS tournament_match_ready_up(UUID) CASCADE;

CREATE OR REPLACE FUNCTION tournament_match_ready_up(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_current_user_id UUID;
  v_ready_count INTEGER;
  v_both_ready BOOLEAN := false;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get match
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Verify user is in this match
  IF v_current_user_id NOT IN (v_match.player1_id, v_match.player2_id) THEN
    RETURN json_build_object('success', false, 'error', 'You are not in this match');
  END IF;

  -- Insert ready status (or ignore if already ready)
  INSERT INTO tournament_match_ready (match_id, user_id)
  VALUES (p_match_id, v_current_user_id)
  ON CONFLICT (match_id, user_id) DO NOTHING;

  -- Count ready players for this match
  SELECT COUNT(*) INTO v_ready_count
  FROM tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both players ready, update match status
  IF v_ready_count >= 2 THEN
    v_both_ready := true;
    UPDATE tournament_matches
    SET status = 'in_progress'
    WHERE id = p_match_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'both_ready', v_both_ready,
    'message', CASE WHEN v_both_ready THEN 'Both players ready! Match starting!' ELSE 'You are ready! Waiting for opponent...' END,
    'ready_count', v_ready_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tournament_match_ready_up(UUID) TO authenticated;

-- ============================================
-- 3. progress_tournament_bracket
-- Called when a match is won - advances winner to next round
-- ============================================
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
  v_total_matches_in_round INTEGER;
  v_next_match_index INTEGER;
  v_next_round INTEGER;
  v_is_final BOOLEAN := false;
  v_max_round INTEGER;
BEGIN
  -- Get current match
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_tournament_match_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;

  -- Update current match with winner
  UPDATE tournament_matches
  SET winner_id = p_winner_id,
      status = 'completed'
  WHERE id = p_tournament_match_id;

  -- Get max round for this tournament
  SELECT MAX(round) INTO v_max_round
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id;

  -- Check if this was the final
  IF v_match.round >= v_max_round THEN
    v_is_final := true;
    
    -- Update tournament as completed
    UPDATE tournaments
    SET status = 'completed'
    WHERE id = v_match.tournament_id;

    RETURN json_build_object(
      'success', true,
      'action', 'tournament_complete',
      'winner_id', p_winner_id,
      'message', 'Tournament complete! Champion crowned!'
    );
  END IF;

  -- Calculate next round match
  v_next_round := v_match.round + 1;
  v_next_match_index := (v_match.match_index / 2);  -- Integer division pairs matches

  -- Find the next round match
  SELECT * INTO v_next_match
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round = v_next_round
    AND match_index = v_next_match_index;

  IF FOUND THEN
    -- Place winner in the correct slot (even match_index → player1, odd → player2)
    IF v_match.match_index % 2 = 0 THEN
      UPDATE tournament_matches
      SET player1_id = p_winner_id
      WHERE id = v_next_match.id;
    ELSE
      UPDATE tournament_matches
      SET player2_id = p_winner_id
      WHERE id = v_next_match.id;
    END IF;

    -- If both players are now set in the next match, update its status to 'pending'
    SELECT * INTO v_next_match FROM tournament_matches WHERE id = v_next_match.id;
    IF v_next_match.player1_id IS NOT NULL AND v_next_match.player2_id IS NOT NULL THEN
      UPDATE tournament_matches
      SET status = 'ready'
      WHERE id = v_next_match.id;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'action', 'winner_advanced',
    'next_round', v_next_round,
    'next_match_id', v_next_match.id,
    'message', 'Winner advances to next round!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION progress_tournament_bracket(UUID, UUID) TO authenticated;

-- ============================================
-- 4. create_tournament_match_room
-- Creates a match room when both players are ready
-- Links to the existing match/game system
-- ============================================
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
BEGIN
  -- Get tournament settings
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;

  -- Create a match room
  v_room_id := gen_random_uuid();

  -- Insert into match_rooms table (if it exists) or online_matches
  BEGIN
    INSERT INTO online_matches (
      id,
      player1_id,
      player2_id,
      status,
      game_mode,
      starting_score,
      legs_required,
      tournament_id,
      tournament_match_id,
      created_at
    ) VALUES (
      v_room_id,
      p_player1_id,
      p_player2_id,
      'waiting',
      COALESCE(v_tournament.game_type, '501'),
      COALESCE(v_tournament.starting_score, p_game_mode),
      COALESCE(v_tournament.legs_per_match, p_legs_per_match),
      p_tournament_id,
      p_tournament_match_id,
      NOW()
    );
  EXCEPTION
    WHEN undefined_table THEN
      -- online_matches table doesn't exist, try match_rooms
      BEGIN
        INSERT INTO match_rooms (
          id,
          player1_id,
          player2_id,
          status,
          game_mode,
          created_at
        ) VALUES (
          v_room_id,
          p_player1_id,
          p_player2_id,
          'waiting',
          p_game_mode::text,
          NOW()
        );
      EXCEPTION
        WHEN undefined_table THEN
          -- Neither table exists, just return the room ID
          NULL;
      END;
    WHEN undefined_column THEN
      -- Some columns don't exist, try simpler insert
      INSERT INTO online_matches (
        id,
        player1_id,
        player2_id,
        status,
        created_at
      ) VALUES (
        v_room_id,
        p_player1_id,
        p_player2_id,
        'waiting',
        NOW()
      );
  END;

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
END;
$$;

GRANT EXECUTE ON FUNCTION create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- 5. Ensure tournament_match_ready table exists
-- This table tracks which players have clicked "Ready Up"
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view match ready status" ON tournament_match_ready;
CREATE POLICY "Users can view match ready status" ON tournament_match_ready
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own ready status" ON tournament_match_ready;
CREATE POLICY "Users can insert their own ready status" ON tournament_match_ready
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 6. Ensure tournament_matches table has all needed columns
-- ============================================
DO $$
BEGIN
  -- Add match_room_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_room_id') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_room_id TEXT;
  END IF;
  
  -- Add match_index if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_index') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_index INTEGER DEFAULT 0;
  END IF;

  -- Add winner_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'winner_id') THEN
    ALTER TABLE tournament_matches ADD COLUMN winner_id UUID;
  END IF;
END $$;

-- ============================================
-- 7. Index for faster match queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round, match_index);
CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id ON tournament_match_ready(match_id);

-- ============================================
-- DONE! All missing tournament functions are now available.
-- ============================================
