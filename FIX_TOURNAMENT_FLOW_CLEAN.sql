-- =======================================================
-- CLEAN TOURNAMENT FLOW FIX - NO DUPLICATE POLICY ERRORS
-- =======================================================

-- Fix 1: Create missing view causing 503 errors (drop first to avoid conflicts)
DROP VIEW IF EXISTS v_tournament_match_ready_status CASCADE;

CREATE VIEW v_tournament_match_ready_status AS
SELECT 
  tm.id as match_id,
  tm.tournament_id,
  tm.round,
  tm.match_number,
  tm.player1_id,
  tm.player2_id,
  tm.status,
  tm.match_room_id,
  tm.ready_deadline,
  tm.created_at,
  COALESCE(ready_counts.ready_count, 0) as ready_count,
  CASE 
    WHEN current_user_ready.user_id IS NOT NULL THEN true 
    ELSE false 
  END as my_ready
FROM tournament_matches tm
LEFT JOIN (
  SELECT 
    match_id, 
    COUNT(*) as ready_count
  FROM tournament_match_ready 
  GROUP BY match_id
) ready_counts ON tm.id = ready_counts.match_id
LEFT JOIN tournament_match_ready current_user_ready ON (
  tm.id = current_user_ready.match_id AND 
  current_user_ready.user_id = auth.uid()
)
WHERE tm.status IN ('ready', 'ready_check', 'in_progress');

GRANT SELECT ON v_tournament_match_ready_status TO authenticated;

-- Fix 2: Clean tournament_participants RLS policies
DROP POLICY IF EXISTS "Users can view all tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can manage their own participation" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;

CREATE POLICY "Users can view all tournament participants" ON tournament_participants
FOR SELECT USING (true);

CREATE POLICY "Users can join tournaments" ON tournament_participants
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own participation" ON tournament_participants
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave tournaments" ON tournament_participants
FOR DELETE USING (auth.uid() = user_id);

-- Fix 3: Add missing columns to tournaments table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'winner_id') THEN
    ALTER TABLE tournaments ADD COLUMN winner_id UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tournaments' AND column_name = 'completed_at') THEN
    ALTER TABLE tournaments ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Fix 4: Tournament progression function - OPEN → LIVE → COMPLETE
DROP FUNCTION IF EXISTS complete_tournament_flow_progression(UUID) CASCADE;

CREATE OR REPLACE FUNCTION complete_tournament_flow_progression(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_now TIMESTAMP WITH TIME ZONE;
  v_result JSON;
  v_final_match RECORD;
BEGIN
  v_now := NOW();
  
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Count confirmed participants
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
  AND status_type = 'confirmed';
  
  -- STEP 1: Before start time → keep status as "open" (scheduled/registration/checkin)
  IF v_tournament.start_at > v_now AND v_tournament.status IN ('cancelled', 'completed') = false THEN
    -- Tournament is open for registration
    IF v_tournament.status NOT IN ('scheduled', 'registration', 'checkin') THEN
      UPDATE tournaments 
      SET status = 'scheduled'
      WHERE id = p_tournament_id;
      
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_opened',
        'message', 'Tournament opened for registration',
        'participant_count', v_participant_count
      );
    ELSE
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_open',
        'message', 'Tournament open for registration',
        'participant_count', v_participant_count
      );
    END IF;
    
  -- STEP 2: Start time reached → LIVE (if enough participants) or DELETE (if not)  
  ELSIF v_tournament.status IN ('scheduled', 'checkin', 'registration') 
        AND v_tournament.start_at <= v_now THEN
    
    IF v_participant_count >= 2 THEN
      -- Generate bracket if not already generated
      IF v_tournament.bracket_generated_at IS NULL THEN
        PERFORM generate_tournament_bracket(p_tournament_id);
      END IF;
      
      -- Start tournament → status = "LIVE" (in_progress)
      UPDATE tournaments 
      SET status = 'in_progress',
          started_at = v_now
      WHERE id = p_tournament_id;
      
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_live',
        'message', 'Tournament is now LIVE!',
        'participant_count', v_participant_count
      );
      
    ELSE
      -- DELETE tournament - not enough players
      DELETE FROM tournament_participants WHERE tournament_id = p_tournament_id;
      DELETE FROM tournaments WHERE id = p_tournament_id;
      
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_deleted',
        'message', 'Not enough players - tournament deleted',
        'participant_count', v_participant_count
      );
    END IF;
    
  -- STEP 3: Check if tournament should be COMPLETE (final match finished)
  ELSIF v_tournament.status = 'in_progress' THEN
    
    -- Find the final match (highest round with winner)
    SELECT * INTO v_final_match
    FROM tournament_matches
    WHERE tournament_id = p_tournament_id
    AND round = (
      SELECT MAX(round) FROM tournament_matches WHERE tournament_id = p_tournament_id
    )
    AND status = 'completed'
    AND winner_id IS NOT NULL
    LIMIT 1;
    
    IF FOUND THEN
      -- Final match completed → Tournament COMPLETE
      UPDATE tournaments 
      SET status = 'completed',
          completed_at = v_now,
          winner_id = v_final_match.winner_id
      WHERE id = p_tournament_id;
      
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_completed',
        'message', 'Tournament COMPLETED!',
        'winner_id', v_final_match.winner_id
      );
    ELSE
      v_result := json_build_object(
        'success', true,
        'action', 'tournament_live',
        'message', 'Tournament still in progress',
        'participant_count', v_participant_count
      );
    END IF;
    
  ELSE
    v_result := json_build_object(
      'success', true,
      'action', 'no_change',
      'message', 'No status change needed',
      'current_status', v_tournament.status,
      'participant_count', v_participant_count
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Fix 5: Enhanced bracket generation
DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID) CASCADE;

CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participants UUID[];
  v_participant_count INTEGER;
  v_bracket_size INTEGER;
  v_round INTEGER;
  v_match_index INTEGER;
  v_match_id UUID;
  v_total_matches INTEGER := 0;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  IF v_tournament.bracket_generated_at IS NOT NULL THEN
    RETURN json_build_object('success', true, 'message', 'Bracket already generated');
  END IF;
  
  SELECT ARRAY_AGG(user_id ORDER BY RANDOM()) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status_type = 'confirmed';
  
  v_participant_count := array_length(v_participants, 1);
  
  IF v_participant_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Need at least 2 participants');
  END IF;
  
  -- Calculate bracket size (next power of 2)
  v_bracket_size := 2;
  WHILE v_bracket_size < v_participant_count LOOP
    v_bracket_size := v_bracket_size * 2;
  END LOOP;
  
  -- Generate first round matches
  v_round := 1;
  v_match_index := 1;
  
  FOR i IN 1..v_bracket_size/2 LOOP
    v_match_id := gen_random_uuid();
    
    INSERT INTO tournament_matches (
      id, tournament_id, round, match_number, match_index,
      player1_id, player2_id, status, ready_deadline
    ) VALUES (
      v_match_id, p_tournament_id, v_round, i, v_match_index,
      CASE WHEN i * 2 - 1 <= v_participant_count THEN v_participants[i * 2 - 1] ELSE NULL END,
      CASE WHEN i * 2 <= v_participant_count THEN v_participants[i * 2] ELSE NULL END,
      CASE 
        WHEN i * 2 <= v_participant_count THEN 'ready'
        WHEN i * 2 - 1 <= v_participant_count THEN 'bye'
        ELSE 'pending'
      END,
      CASE 
        WHEN i * 2 <= v_participant_count THEN v_tournament.start_at + INTERVAL '3 minutes'
        ELSE NULL
      END
    );
    
    v_match_index := v_match_index + 1;
    v_total_matches := v_total_matches + 1;
  END LOOP;
  
  -- Generate subsequent round placeholders
  v_round := 2;
  WHILE v_bracket_size > 2 LOOP
    v_bracket_size := v_bracket_size / 2;
    
    FOR i IN 1..v_bracket_size/2 LOOP
      v_match_id := gen_random_uuid();
      
      INSERT INTO tournament_matches (
        id, tournament_id, round, match_number, match_index, status
      ) VALUES (
        v_match_id, p_tournament_id, v_round, i, v_match_index, 'pending'
      );
      
      v_match_index := v_match_index + 1;
      v_total_matches := v_total_matches + 1;
    END LOOP;
    
    v_round := v_round + 1;
  END LOOP;
  
  UPDATE tournaments SET bracket_generated_at = NOW() WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Tournament bracket generated successfully',
    'tournament_id', p_tournament_id,
    'participants', v_participant_count,
    'total_matches', v_total_matches
  );
END;
$$;

-- Fix 6: Global tournament status transitions
DROP FUNCTION IF EXISTS process_tournament_status_transitions() CASCADE;

CREATE OR REPLACE FUNCTION process_tournament_status_transitions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_results JSON[] := ARRAY[]::JSON[];
  v_tournament_result JSON;
  v_started_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_deleted_count INTEGER := 0;
BEGIN
  FOR v_tournament IN 
    SELECT t.* FROM tournaments t 
    WHERE t.status IN ('registration', 'scheduled', 'checkin', 'in_progress') 
    ORDER BY t.start_at ASC
  LOOP
    SELECT complete_tournament_flow_progression(v_tournament.id) INTO v_tournament_result;
    
    IF (v_tournament_result->>'action') = 'tournament_live' THEN
      v_started_count := v_started_count + 1;
    ELSIF (v_tournament_result->>'action') = 'tournament_deleted' THEN  
      v_deleted_count := v_deleted_count + 1;
    END IF;
    
    v_results := v_results || v_tournament_result;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'processed_at', NOW(),
    'tournaments_started', v_started_count,
    'tournaments_deleted', v_deleted_count,
    'total_processed', v_started_count + v_deleted_count,
    'details', v_results
  );
END;
$$;

-- Fix 7: Tournament match ready table
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ready_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ready status" ON tournament_match_ready;
DROP POLICY IF EXISTS "Users can ready up" ON tournament_match_ready;

CREATE POLICY "Users can view ready status" ON tournament_match_ready FOR SELECT USING (true);
CREATE POLICY "Users can ready up" ON tournament_match_ready FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Fix 8: Ready-up function
DROP FUNCTION IF EXISTS ready_up_tournament_match(UUID) CASCADE;

CREATE OR REPLACE FUNCTION ready_up_tournament_match(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_current_user_id UUID;
  v_ready_count INTEGER;
  v_match_room_id TEXT;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not authenticated');
  END IF;
  
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_current_user_id != v_match.player1_id AND v_current_user_id != v_match.player2_id THEN
    RETURN json_build_object('success', false, 'error', 'User not a participant');
  END IF;
  
  INSERT INTO tournament_match_ready (match_id, user_id)
  VALUES (p_match_id, v_current_user_id)
  ON CONFLICT (match_id, user_id) DO NOTHING;
  
  SELECT COUNT(*) INTO v_ready_count FROM tournament_match_ready WHERE match_id = p_match_id;
  
  IF v_ready_count = 2 THEN
    v_match_room_id := 'tournament_' || p_match_id::text || '_' || extract(epoch from now())::text;
    
    UPDATE tournament_matches
    SET match_room_id = v_match_room_id, status = 'in_progress', started_at = NOW()
    WHERE id = p_match_id;
    
    RETURN json_build_object('success', true, 'ready_count', v_ready_count, 'match_room_id', v_match_room_id, 'status', 'match_starting');
  ELSE
    RETURN json_build_object('success', true, 'ready_count', v_ready_count, 'status', 'waiting_for_opponent');
  END IF;
END;
$$;

-- Fix 10: Tournament activities table - REMOVED FOR NOW (was causing 400 errors)
-- Will be added back later when foreign key relationships are properly configured

-- Fix 11: Enhanced join tournament function with activity logging (SIMPLIFIED - remove activities for now)
DROP FUNCTION IF EXISTS join_tournament(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION join_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Check if tournament accepts new participants
  IF v_tournament.status NOT IN ('registration', 'scheduled', 'checkin') THEN
    RETURN json_build_object('success', false, 'error', 'Tournament registration is closed', 'current_status', v_tournament.status);
  END IF;
  
  -- Check if tournament is full
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  IF v_participant_count >= v_tournament.max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Tournament is full');
  END IF;
  
  -- Check if user is already registered
  IF EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already registered for this tournament');
  END IF;
  
  -- Add participant
  INSERT INTO tournament_participants (
    tournament_id,
    user_id,
    role,
    status_type,
    joined_at
  ) VALUES (
    p_tournament_id,
    p_user_id,
    'participant',
    'confirmed',
    NOW()
  );
  
  -- Get updated participant count
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Successfully joined tournament!',
    'tournament_id', p_tournament_id,
    'user_id', p_user_id,
    'participant_count', v_participant_count
  );
  
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Already registered for this tournament');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Failed to join tournament: ' || SQLERRM);
END;
$$;

-- Fix 15: Function to auto-register tournament creator
DROP FUNCTION IF EXISTS auto_register_tournament_creator(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION auto_register_tournament_creator(
  p_tournament_id UUID,
  p_creator_user_id UUID  
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add creator as participant if not already registered
  INSERT INTO tournament_participants (
    tournament_id,
    user_id,
    role,
    status_type,
    joined_at
  ) VALUES (
    p_tournament_id,
    p_creator_user_id,
    'creator',
    'confirmed',
    NOW()
  )
  ON CONFLICT (tournament_id, user_id) DO NOTHING;
  
  RETURN json_build_object('success', true, 'message', 'Creator auto-registered');
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO authenticated;
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO service_role;
GRANT EXECUTE ON FUNCTION ready_up_tournament_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION join_tournament(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_register_tournament_creator(UUID, UUID) TO authenticated;

-- Fix 12: Ensure profiles table is accessible for tournament participant joins
GRANT SELECT ON profiles TO authenticated;

-- Fix 13: Create index for better performance on tournament participants
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id ON tournament_participants(user_id);

-- Fix 14: Ensure tournament_participants has proper foreign key to profiles
-- Add constraint to ensure user_id exists in auth.users (already done via CREATE TABLE)
-- But make sure profiles table relationship works properly for joins