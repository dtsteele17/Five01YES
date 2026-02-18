-- ============================================================================
-- COMPLETE TOURNAMENT SYSTEM IMPLEMENTATION
-- ============================================================================
-- This migration implements the full DartCounter-like tournament system:
-- 1. Check-in system
-- 2. Bracket generation with byes
-- 3. Match ready-up with auto-forfeit
-- 4. Winner advancement
-- 5. Scheduler functions for auto-progression
-- ============================================================================

-- ============================================================================
-- PART 1: UPDATE EXISTING DATA TO MATCH NEW CONSTRAINTS
-- ============================================================================

-- First, update any tournament_matches with invalid statuses
UPDATE tournament_matches 
SET status = 'pending' 
WHERE status NOT IN ('pending', 'ready', 'ready_check', 'in_game', 'completed', 'forfeit', 'bye');

-- Update any tournament_participants with invalid statuses
UPDATE tournament_participants 
SET status_type = 'registered' 
WHERE status_type NOT IN ('registered', 'checked-in', 'eliminated', 'withdrawn');

-- Update any tournaments with invalid statuses
UPDATE tournaments 
SET status = 'scheduled' 
WHERE status NOT IN ('draft', 'scheduled', 'checkin', 'in_progress', 'completed', 'cancelled');

-- ============================================================================
-- PART 2: ENSURE STATUS CONSTRAINTS
-- ============================================================================

-- Ensure tournaments table has correct status values
ALTER TABLE tournaments 
  DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_status_check 
  CHECK (status IN ('draft', 'scheduled', 'checkin', 'in_progress', 'completed', 'cancelled'));

-- Ensure tournament_participants has correct status values  
ALTER TABLE tournament_participants
  DROP CONSTRAINT IF EXISTS tournament_participants_status_type_check;

ALTER TABLE tournament_participants
  ADD CONSTRAINT tournament_participants_status_type_check
  CHECK (status_type IN ('registered', 'checked-in', 'eliminated', 'withdrawn'));

-- Ensure tournament_matches has correct status values
ALTER TABLE tournament_matches
  DROP CONSTRAINT IF EXISTS tournament_matches_status_check;

ALTER TABLE tournament_matches
  ADD CONSTRAINT tournament_matches_status_check
  CHECK (status IN ('pending', 'ready', 'ready_check', 'in_game', 'completed', 'forfeit', 'bye'));

-- ============================================================================
-- PART 3: ADD SCHEDULER LOG TABLE
-- ============================================================================

-- Create table if not exists
CREATE TABLE IF NOT EXISTS tournament_scheduler_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add columns if they don't exist (safe for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_scheduler_log' AND column_name = 'function_name') THEN
    ALTER TABLE tournament_scheduler_log ADD COLUMN function_name TEXT NOT NULL DEFAULT 'unknown';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_scheduler_log' AND column_name = 'tournaments_processed') THEN
    ALTER TABLE tournament_scheduler_log ADD COLUMN tournaments_processed INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_scheduler_log' AND column_name = 'matches_processed') THEN
    ALTER TABLE tournament_scheduler_log ADD COLUMN matches_processed INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_scheduler_log' AND column_name = 'errors') THEN
    ALTER TABLE tournament_scheduler_log ADD COLUMN errors JSONB DEFAULT '[]'::jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_scheduler_log' AND column_name = 'duration_ms') THEN
    ALTER TABLE tournament_scheduler_log ADD COLUMN duration_ms INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scheduler_log_ran_at ON tournament_scheduler_log(ran_at);
CREATE INDEX IF NOT EXISTS idx_scheduler_log_function ON tournament_scheduler_log(function_name);

-- Enable RLS
ALTER TABLE tournament_scheduler_log ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view logs (for debugging)
DROP POLICY IF EXISTS "Scheduler logs viewable by authenticated" ON tournament_scheduler_log;
CREATE POLICY "Scheduler logs viewable by authenticated"
  ON tournament_scheduler_log FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- PART 4: CHECK-IN RPC
-- ============================================================================

DROP FUNCTION IF EXISTS rpc_tournament_check_in(UUID);

CREATE OR REPLACE FUNCTION rpc_tournament_check_in(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_tournament RECORD;
  v_participant RECORD;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Check tournament status
  IF v_tournament.status != 'checkin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is not in check-in phase');
  END IF;

  -- Get participant
  SELECT * INTO v_participant
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
    AND user_id = v_user_id
    AND status_type = 'registered';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not registered for this tournament');
  END IF;

  -- Update to checked-in
  UPDATE tournament_participants
  SET status_type = 'checked-in',
      updated_at = NOW()
  WHERE id = v_participant.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully checked in',
    'participant_id', v_participant.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tournament_check_in(UUID) TO authenticated;

-- ============================================================================
-- PART 5: IMPROVED BRACKET GENERATION
-- ============================================================================

DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID);

CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_checked_in_participants UUID[];
  v_rounds INTEGER;
  v_bracket_size INTEGER;
  v_byes INTEGER;
  v_i INTEGER;
  v_j INTEGER;
  v_match_index INTEGER := 0;
  v_match_ids UUID[];
  v_player1_id UUID;
  v_player2_id UUID;
  v_byes_assigned INTEGER := 0;
  v_start_time TIMESTAMPTZ;
BEGIN
  -- Lock tournament row
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  -- Check if bracket already generated
  IF v_tournament.bracket_generated_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bracket already generated');
  END IF;

  -- Get checked-in participants
  SELECT ARRAY_AGG(user_id ORDER BY joined_at)
  INTO v_checked_in_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
    AND status_type = 'checked-in';

  v_participant_count := COALESCE(array_length(v_checked_in_participants, 1), 0);

  IF v_participant_count < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Need at least 2 checked-in participants');
  END IF;

  -- Calculate bracket size (next power of 2)
  v_rounds := CEIL(LOG(2, v_participant_count));
  v_bracket_size := POW(2, v_rounds)::INTEGER;
  v_byes := v_bracket_size - v_participant_count;

  v_start_time := NOW();

  -- Create all rounds
  FOR v_round IN 1..v_rounds LOOP
    v_match_index := 0;
    
    FOR v_i IN 1..(POW(2, v_rounds - v_round)::INTEGER) LOOP
      v_match_index := v_match_index + 1;
      
      -- Determine players based on round
      IF v_round = 1 THEN
        -- First round: seed participants
        v_player1_id := NULL;
        v_player2_id := NULL;
        
        -- Calculate positions in participant array
        DECLARE
          v_pos1 INTEGER := (v_i - 1) * 2 + 1;
          v_pos2 INTEGER := v_pos1 + 1;
        BEGIN
          IF v_pos1 <= v_participant_count THEN
            v_player1_id := v_checked_in_participants[v_pos1];
          END IF;
          IF v_pos2 <= v_participant_count THEN
            v_player2_id := v_checked_in_participants[v_pos2];
          END IF;
        END;
        
        -- Insert match
        INSERT INTO tournament_matches (
          tournament_id,
          round,
          match_index,
          match_number,
          player1_id,
          player2_id,
          status,
          playable_at,
          ready_deadline
        ) VALUES (
          p_tournament_id,
          v_round,
          v_match_index,
          v_match_index,
          v_player1_id,
          v_player2_id,
          CASE 
            WHEN v_player1_id IS NULL OR v_player2_id IS NULL THEN 'bye'
            ELSE 'pending'
          END,
          CASE 
            WHEN v_player1_id IS NULL OR v_player2_id IS NULL THEN NULL
            ELSE v_start_time
          END,
          CASE 
            WHEN v_player1_id IS NULL OR v_player2_id IS NULL THEN NULL
            ELSE v_start_time + INTERVAL '5 minutes'
          END
        );
        
      ELSE
        -- Subsequent rounds: winners advance
        INSERT INTO tournament_matches (
          tournament_id,
          round,
          match_index,
          match_number,
          player1_id,
          player2_id,
          status,
          playable_at,
          ready_deadline
        ) VALUES (
          p_tournament_id,
          v_round,
          v_match_index,
          v_match_index,
          NULL,
          NULL,
          'pending',
          NULL,
          NULL
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Auto-advance bye matches
  UPDATE tournament_matches
  SET winner_id = COALESCE(player1_id, player2_id),
      status = 'completed',
      updated_at = NOW()
  WHERE tournament_id = p_tournament_id
    AND status = 'bye';

  -- Advance bye winners to next round
  FOR v_match IN 
    SELECT * FROM tournament_matches 
    WHERE tournament_id = p_tournament_id 
      AND status = 'completed' 
      AND round = 1
      AND winner_id IS NOT NULL
  LOOP
    DECLARE
      v_next_match_index INTEGER;
      v_is_player1_slot BOOLEAN;
    BEGIN
      v_next_match_index := (v_match.match_index + 1) / 2;
      v_is_player1_slot := (v_match.match_index % 2 = 1);
      
      IF v_is_player1_slot THEN
        UPDATE tournament_matches
        SET player1_id = v_match.winner_id,
            status = CASE WHEN player2_id IS NOT NULL THEN 'pending' ELSE status END,
            playable_at = CASE WHEN player2_id IS NOT NULL THEN v_start_time ELSE NULL END,
            ready_deadline = CASE WHEN player2_id IS NOT NULL THEN v_start_time + INTERVAL '5 minutes' ELSE NULL END
        WHERE tournament_id = p_tournament_id
          AND round = 2
          AND match_index = v_next_match_index;
      ELSE
        UPDATE tournament_matches
        SET player2_id = v_match.winner_id,
            status = CASE WHEN player1_id IS NOT NULL THEN 'pending' ELSE status END,
            playable_at = CASE WHEN player1_id IS NOT NULL THEN v_start_time ELSE NULL END,
            ready_deadline = CASE WHEN player1_id IS NOT NULL THEN v_start_time + INTERVAL '5 minutes' ELSE NULL END
        WHERE tournament_id = p_tournament_id
          AND round = 2
          AND match_index = v_next_match_index;
      END IF;
    END;
  END LOOP;

  -- Update tournament
  UPDATE tournaments
  SET bracket_generated_at = NOW(),
      status = 'in_progress',
      total_rounds = v_rounds,
      current_round = 1,
      updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'participants', v_participant_count,
    'byes', v_byes,
    'rounds', v_rounds,
    'bracket_size', v_bracket_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;

-- ============================================================================
-- PART 6: PROCESS DUE TOURNAMENTS (SCHEDULER)
-- ============================================================================

DROP FUNCTION IF EXISTS process_due_tournaments();

CREATE OR REPLACE FUNCTION process_due_tournaments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_processed INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
  v_start_time TIMESTAMPTZ;
BEGIN
  v_start_time := clock_timestamp();

  -- Move scheduled -> checkin when within 10 minutes of start
  FOR v_tournament IN 
    SELECT * FROM tournaments
    WHERE status = 'scheduled'
      AND start_at IS NOT NULL
      AND start_at <= NOW() + INTERVAL '10 minutes'
      AND start_at > NOW()
  LOOP
    BEGIN
      UPDATE tournaments
      SET status = 'checkin',
          updated_at = NOW()
      WHERE id = v_tournament.id;
      
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'tournament_id', v_tournament.id,
        'error', SQLERRM,
        'step', 'checkin_start'
      );
    END;
  END LOOP;

  -- Generate bracket and start tournament at start time
  FOR v_tournament IN 
    SELECT * FROM tournaments
    WHERE status IN ('checkin', 'scheduled')
      AND start_at IS NOT NULL
      AND start_at <= NOW()
      AND bracket_generated_at IS NULL
  LOOP
    BEGIN
      -- Only generate if we have checked-in participants
      IF EXISTS (
        SELECT 1 FROM tournament_participants
        WHERE tournament_id = v_tournament.id
          AND status_type = 'checked-in'
        LIMIT 1
      ) THEN
        PERFORM generate_tournament_bracket(v_tournament.id);
        v_processed := v_processed + 1;
      ELSE
        -- No checked-in participants, cancel tournament
        UPDATE tournaments
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE id = v_tournament.id;
        
        v_processed := v_processed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'tournament_id', v_tournament.id,
        'error', SQLERRM,
        'step', 'bracket_generation'
      );
    END;
  END LOOP;

  -- Log the run
  INSERT INTO tournament_scheduler_log (
    function_name,
    tournaments_processed,
    errors,
    duration_ms
  ) VALUES (
    'process_due_tournaments',
    v_processed,
    v_errors,
    EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER
  );

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'errors_count', jsonb_array_length(v_errors),
    'duration_ms', EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_due_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION process_due_tournaments() TO service_role;

-- ============================================================================
-- PART 7: PROCESS READY DEADLINES (AUTO-FORFEIT)
-- ============================================================================

DROP FUNCTION IF EXISTS process_ready_deadlines();

CREATE OR REPLACE FUNCTION process_ready_deadlines()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_ready_players UUID[];
  v_player1_ready BOOLEAN;
  v_player2_ready BOOLEAN;
  v_winner_id UUID;
  v_processed INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
  v_start_time TIMESTAMPTZ;
BEGIN
  v_start_time := clock_timestamp();

  -- Find matches past ready deadline with missing readies
  FOR v_match IN 
    SELECT tm.*, t.game_mode, t.best_of_legs
    FROM tournament_matches tm
    JOIN tournaments t ON tm.tournament_id = t.id
    WHERE tm.status IN ('pending', 'ready', 'ready_check')
      AND tm.ready_deadline IS NOT NULL
      AND tm.ready_deadline < NOW()
      AND tm.match_room_id IS NULL
  LOOP
    BEGIN
      -- Get ready players
      SELECT ARRAY_AGG(user_id) INTO v_ready_players
      FROM tournament_match_ready
      WHERE match_id = v_match.id;

      v_player1_ready := v_match.player1_id = ANY(COALESCE(v_ready_players, '{}'::UUID[]));
      v_player2_ready := v_match.player2_id = ANY(COALESCE(v_ready_players, '{}'::UUID[]));

      -- Determine winner based on ready status
      IF v_player1_ready AND NOT v_player2_ready THEN
        -- Player 1 wins by forfeit
        v_winner_id := v_match.player1_id;
      ELSIF v_player2_ready AND NOT v_player1_ready THEN
        -- Player 2 wins by forfeit
        v_winner_id := v_match.player2_id;
      ELSIF v_player1_ready AND v_player2_ready THEN
        -- Both ready but match not started yet - shouldn't happen but handle it
        CONTINUE;
      ELSE
        -- Neither ready - both forfeit
        -- Use player1 as winner (deterministic)
        v_winner_id := v_match.player1_id;
      END IF;

      -- Update match with forfeit result
      UPDATE tournament_matches
      SET winner_id = v_winner_id,
          status = 'forfeit',
          updated_at = NOW()
      WHERE id = v_match.id;

      -- Advance winner
      PERFORM advance_tournament_winner(v_match.id, v_winner_id);

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'match_id', v_match.id,
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- Log the run
  INSERT INTO tournament_scheduler_log (
    function_name,
    matches_processed,
    errors,
    duration_ms
  ) VALUES (
    'process_ready_deadlines',
    v_processed,
    v_errors,
    EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER
  );

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'errors_count', jsonb_array_length(v_errors),
    'duration_ms', EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start_time))::INTEGER
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_ready_deadlines() TO authenticated;
GRANT EXECUTE ON FUNCTION process_ready_deadlines() TO service_role;

-- ============================================================================
-- PART 8: ADVANCE TOURNAMENT WINNER HELPER
-- ============================================================================

DROP FUNCTION IF EXISTS advance_tournament_winner(UUID, UUID);

CREATE OR REPLACE FUNCTION advance_tournament_winner(
  p_match_id UUID,
  p_winner_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_next_match RECORD;
  v_next_match_index INTEGER;
  v_is_player1_slot BOOLEAN;
  v_total_matches INTEGER;
  v_completed_matches INTEGER;
BEGIN
  -- Get the match
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Get tournament
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = v_match.tournament_id;

  -- Calculate next round match
  v_next_match_index := (v_match.match_index + 1) / 2;
  v_is_player1_slot := (v_match.match_index % 2 = 1);

  -- Check if this was the final
  SELECT COUNT(*) INTO v_total_matches
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round = v_match.round;

  IF v_total_matches = 1 THEN
    -- This was the final - tournament complete
    UPDATE tournaments
    SET status = 'completed',
        winner_id = p_winner_id,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_match.tournament_id;
    
    RETURN true;
  END IF;

  -- Advance to next round
  SELECT * INTO v_next_match
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round = v_match.round + 1
    AND match_index = v_next_match_index
  FOR UPDATE;

  IF FOUND THEN
    IF v_is_player1_slot THEN
      UPDATE tournament_matches
      SET player1_id = p_winner_id,
          status = CASE 
            WHEN player2_id IS NOT NULL THEN 'pending'
            ELSE status
          END,
          playable_at = CASE 
            WHEN player2_id IS NOT NULL THEN NOW()
            ELSE NULL
          END,
          ready_deadline = CASE 
            WHEN player2_id IS NOT NULL THEN NOW() + INTERVAL '5 minutes'
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE id = v_next_match.id;
    ELSE
      UPDATE tournament_matches
      SET player2_id = p_winner_id,
          status = CASE 
            WHEN player1_id IS NOT NULL THEN 'pending'
            ELSE status
          END,
          playable_at = CASE 
            WHEN player1_id IS NOT NULL THEN NOW()
            ELSE NULL
          END,
          ready_deadline = CASE 
            WHEN player1_id IS NOT NULL THEN NOW() + INTERVAL '5 minutes'
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE id = v_next_match.id;
    END IF;
  END IF;

  -- Check if round is complete and advance tournament round
  SELECT COUNT(*) INTO v_completed_matches
  FROM tournament_matches
  WHERE tournament_id = v_match.tournament_id
    AND round = v_match.round
    AND status IN ('completed', 'forfeit');

  IF v_completed_matches = v_total_matches THEN
    UPDATE tournaments
    SET current_round = v_match.round + 1,
        updated_at = NOW()
    WHERE id = v_match.tournament_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_tournament_winner(UUID, UUID) TO authenticated;

-- ============================================================================
-- PART 9: TRIGGER FOR MATCH COMPLETION
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_on_match_room_complete ON match_rooms;
DROP FUNCTION IF EXISTS handle_match_room_complete();

CREATE OR REPLACE FUNCTION handle_match_room_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament_match RECORD;
BEGIN
  -- Only process if status changed to completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Find associated tournament match
    SELECT * INTO v_tournament_match
    FROM tournament_matches
    WHERE match_room_id = NEW.id;

    IF FOUND THEN
      -- Determine winner based on legs won
      DECLARE
        v_winner_id UUID;
        v_player1_legs INTEGER;
        v_player2_legs INTEGER;
      BEGIN
        -- Count legs won by each player
        SELECT COUNT(*) INTO v_player1_legs
        FROM match_legs
        WHERE match_id = NEW.id AND winner_id = NEW.player1_id;

        SELECT COUNT(*) INTO v_player2_legs
        FROM match_legs
        WHERE match_id = NEW.id AND winner_id = NEW.player2_id;

        IF v_player1_legs > v_player2_legs THEN
          v_winner_id := NEW.player1_id;
        ELSIF v_player2_legs > v_player1_legs THEN
          v_winner_id := NEW.player2_id;
        ELSE
          -- Tie - shouldn't happen but default to player1
          v_winner_id := NEW.player1_id;
        END IF;

        -- Update tournament match
        UPDATE tournament_matches
        SET winner_id = v_winner_id,
            status = 'completed',
            updated_at = NOW()
        WHERE id = v_tournament_match.id;

        -- Advance winner
        PERFORM advance_tournament_winner(v_tournament_match.id, v_winner_id);
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: Trigger will be created only if match_rooms table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'match_rooms'
  ) THEN
    CREATE TRIGGER trigger_on_match_room_complete
      AFTER UPDATE ON match_rooms
      FOR EACH ROW
      WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
      EXECUTE FUNCTION handle_match_room_complete();
  END IF;
END $$;

-- ============================================================================
-- PART 10: ADMIN FUNCTIONS
-- ============================================================================

-- Force start tournament (admin only)
DROP FUNCTION IF EXISTS admin_force_start_tournament(UUID);

CREATE OR REPLACE FUNCTION admin_force_start_tournament(p_tournament_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Check if user is owner/admin
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only tournament owner can force start');
  END IF;

  -- Generate bracket
  RETURN generate_tournament_bracket(p_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_force_start_tournament(UUID) TO authenticated;

-- Extend check-in (admin only)
DROP FUNCTION IF EXISTS admin_extend_check_in(UUID, INTEGER);

CREATE OR REPLACE FUNCTION admin_extend_check_in(
  p_tournament_id UUID,
  p_minutes INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament not found');
  END IF;

  IF v_tournament.owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only tournament owner can extend check-in');
  END IF;

  IF v_tournament.status != 'checkin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tournament is not in check-in phase');
  END IF;

  -- Extend start time
  UPDATE tournaments
  SET start_at = COALESCE(start_at, NOW()) + (p_minutes || ' minutes')::INTERVAL,
      updated_at = NOW()
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Check-in extended by ' || p_minutes || ' minutes'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_extend_check_in(UUID, INTEGER) TO authenticated;

-- Force forfeit match (admin only)
DROP FUNCTION IF EXISTS admin_force_forfeit(UUID, UUID);

CREATE OR REPLACE FUNCTION admin_force_forfeit(
  p_match_id UUID,
  p_forfeit_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_tournament RECORD;
  v_user_id UUID;
  v_winner_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  SELECT * INTO v_match
  FROM tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;

  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = v_match.tournament_id;

  IF v_tournament.owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only tournament owner can force forfeit');
  END IF;

  -- Determine winner (the other player)
  IF p_forfeit_player_id = v_match.player1_id THEN
    v_winner_id := v_match.player2_id;
  ELSIF p_forfeit_player_id = v_match.player2_id THEN
    v_winner_id := v_match.player1_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Player not in this match');
  END IF;

  -- Update match
  UPDATE tournament_matches
  SET winner_id = v_winner_id,
      status = 'forfeit',
      updated_at = NOW()
  WHERE id = p_match_id;

  -- Advance winner
  PERFORM advance_tournament_winner(p_match_id, v_winner_id);

  RETURN jsonb_build_object(
    'success', true,
    'winner_id', v_winner_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_force_forfeit(UUID, UUID) TO authenticated;

-- ============================================================================
-- PART 11: RLS POLICIES
-- ============================================================================

-- Ensure tournament participants can be viewed by everyone
DROP POLICY IF EXISTS "Tournament participants viewable by all" ON tournament_participants;
CREATE POLICY "Tournament participants viewable by all"
  ON tournament_participants FOR SELECT
  USING (true);

-- Ensure tournament matches can be viewed by everyone
DROP POLICY IF EXISTS "Tournament matches viewable by all" ON tournament_matches;
CREATE POLICY "Tournament matches viewable by all"
  ON tournament_matches FOR SELECT
  USING (true);

-- Users can only insert their own participant record
DROP POLICY IF EXISTS "Users can register themselves" ON tournament_participants;
CREATE POLICY "Users can register themselves"
  ON tournament_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own status (for check-in)
DROP POLICY IF EXISTS "Users can update their own status" ON tournament_participants;
CREATE POLICY "Users can update their own status"
  ON tournament_participants FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Tournament owners can update participant statuses
DROP POLICY IF EXISTS "Owners can manage participants" ON tournament_participants;
CREATE POLICY "Owners can manage participants"
  ON tournament_participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_participants.tournament_id
        AND t.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT 'Complete tournament system implemented!' as status;
