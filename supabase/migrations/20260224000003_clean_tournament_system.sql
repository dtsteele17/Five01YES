-- ============================================================================
-- CLEAN TOURNAMENT SYSTEM - Remove conflicts and unify tables
-- ============================================================================
-- This migration:
-- 1. Removes old conflicting tables (tournament_entries)
-- 2. Ensures tournament_participants has all required columns
-- 3. Ensures tournament_matches has all required columns
-- 4. Re-creates all functions with clean definitions
-- ============================================================================

-- ============================================================================
-- PART 1: Clean up old/conflicting tables
-- ============================================================================

-- Drop old tournament_entries table (we use tournament_participants instead)
DROP TABLE IF EXISTS tournament_entries CASCADE;

-- ============================================================================
-- PART 2: Ensure tournament_participants table exists with correct structure
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'participant' CHECK (role IN ('owner', 'admin', 'participant')),
  status_type TEXT DEFAULT 'registered' CHECK (status_type IN ('registered', 'checked-in', 'eliminated', 'withdrawn')),
  ban_rounds_remaining INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_participants' AND column_name = 'role') THEN
    ALTER TABLE tournament_participants ADD COLUMN role TEXT DEFAULT 'participant' CHECK (role IN ('owner', 'admin', 'participant'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_participants' AND column_name = 'status_type') THEN
    ALTER TABLE tournament_participants ADD COLUMN status_type TEXT DEFAULT 'registered' CHECK (status_type IN ('registered', 'checked-in', 'eliminated', 'withdrawn'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_participants' AND column_name = 'ban_rounds_remaining') THEN
    ALTER TABLE tournament_participants ADD COLUMN ban_rounds_remaining INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_participants' AND column_name = 'updated_at') THEN
    ALTER TABLE tournament_participants ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_participants' AND column_name = 'joined_at') THEN
    ALTER TABLE tournament_participants ADD COLUMN joined_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_status ON tournament_participants(status_type);

-- Add foreign key to profiles if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tournament_participants_user_id_fkey'
  ) THEN
    ALTER TABLE tournament_participants 
    ADD CONSTRAINT tournament_participants_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES profiles(id);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- If profiles(id) doesn't exist as FK target, skip
    NULL;
END $$;

ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

-- Clean policies
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Tournament owners and admins can manage participants" ON tournament_participants;

CREATE POLICY "Users can view tournament participants"
  ON tournament_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can join tournaments"
  ON tournament_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave tournaments"
  ON tournament_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- PART 3: Ensure tournament_matches table exists with correct structure
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_index INTEGER NOT NULL,
  match_number INTEGER,
  player1_id UUID REFERENCES auth.users(id),
  player2_id UUID REFERENCES auth.users(id),
  winner_id UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'ready_check', 'in_game', 'completed', 'forfeit', 'bye')),
  match_room_id UUID,
  player1_ready BOOLEAN DEFAULT false,
  player2_ready BOOLEAN DEFAULT false,
  ready_open_at TIMESTAMPTZ,
  ready_deadline TIMESTAMPTZ,
  playable_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, round, match_index)
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_number') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_number INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'match_room_id') THEN
    ALTER TABLE tournament_matches ADD COLUMN match_room_id UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'player1_ready') THEN
    ALTER TABLE tournament_matches ADD COLUMN player1_ready BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'player2_ready') THEN
    ALTER TABLE tournament_matches ADD COLUMN player2_ready BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'ready_open_at') THEN
    ALTER TABLE tournament_matches ADD COLUMN ready_open_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'ready_deadline') THEN
    ALTER TABLE tournament_matches ADD COLUMN ready_deadline TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'playable_at') THEN
    ALTER TABLE tournament_matches ADD COLUMN playable_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'completed_at') THEN
    ALTER TABLE tournament_matches ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournament_matches' AND column_name = 'updated_at') THEN
    ALTER TABLE tournament_matches ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player1 ON tournament_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player2 ON tournament_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- Clean policies
DROP POLICY IF EXISTS "Users can view tournament matches" ON tournament_matches;
DROP POLICY IF EXISTS "Tournament owners and admins can manage matches" ON tournament_matches;

CREATE POLICY "Users can view tournament matches"
  ON tournament_matches FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- PART 4: Ensure tournament_match_ready table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_match_ready (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  player1_ready BOOLEAN DEFAULT false,
  player2_ready BOOLEAN DEFAULT false,
  ready_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id)
);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view match ready status" ON tournament_match_ready;
CREATE POLICY "Users can view match ready status"
  ON tournament_match_ready FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- PART 5: Clean up and recreate functions
-- ============================================================================

-- Drop all conflicting functions
DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID);
DROP FUNCTION IF EXISTS rpc_tournament_check_in(UUID);
DROP FUNCTION IF EXISTS process_due_tournaments();
DROP FUNCTION IF EXISTS process_ready_deadlines();
DROP FUNCTION IF EXISTS advance_tournament_winner(UUID, UUID);

-- ============================================================================
-- PART 6: Create clean bracket generation function
-- ============================================================================

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
  v_match_index INTEGER := 0;
  v_player1_id UUID;
  v_player2_id UUID;
  v_start_time TIMESTAMPTZ;
  v_match RECORD;
  v_round INTEGER;
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
      completed_at = NOW(),
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
-- PART 7: Create check-in function
-- ============================================================================

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
-- PART 8: Create scheduler functions
-- ============================================================================

CREATE OR REPLACE FUNCTION process_due_tournaments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Move scheduled tournaments to checkin when start time reached
  UPDATE tournaments
  SET status = 'checkin',
      updated_at = NOW()
  WHERE status = 'scheduled'
    AND start_at <= NOW() + INTERVAL '15 minutes';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('processed', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION process_due_tournaments() TO authenticated;

CREATE OR REPLACE FUNCTION process_ready_deadlines()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Forfeit matches where deadline passed and someone isn't ready
  UPDATE tournament_matches
  SET status = 'forfeit',
      winner_id = CASE 
        WHEN player1_ready THEN player1_id 
        WHEN player2_ready THEN player2_id 
        ELSE NULL 
      END,
      updated_at = NOW()
  WHERE status IN ('ready', 'ready_check')
    AND ready_deadline < NOW()
    AND (player1_ready = false OR player2_ready = false);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN jsonb_build_object('forfeited', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION process_ready_deadlines() TO authenticated;

-- ============================================================================
-- PART 9: Ensure tournaments table has all required columns
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'bracket_generated_at') THEN
    ALTER TABLE tournaments ADD COLUMN bracket_generated_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'started_at') THEN
    ALTER TABLE tournaments ADD COLUMN started_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'current_round') THEN
    ALTER TABLE tournaments ADD COLUMN current_round INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'total_rounds') THEN
    ALTER TABLE tournaments ADD COLUMN total_rounds INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'updated_at') THEN
    ALTER TABLE tournaments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- PART 10: Enable realtime
-- ============================================================================

ALTER TABLE tournament_participants REPLICA IDENTITY FULL;
ALTER TABLE tournament_matches REPLICA IDENTITY FULL;
ALTER TABLE tournament_match_ready REPLICA IDENTITY FULL;

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'tournament_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_participants;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'tournament_match_ready'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_match_ready;
  END IF;
END $$;
