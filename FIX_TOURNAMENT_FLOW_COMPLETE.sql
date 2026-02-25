-- =======================================================
-- COMPLETE TOURNAMENT FLOW FIX - 503 ERRORS & END-TO-END FLOW
-- =======================================================

-- This SQL fixes the 503 errors and ensures the complete tournament flow works:
-- 1. Users can join tournament and appear in players tab
-- 2. At tournament start time: create bracket + stop joins
-- 3. 1-minute countdown timer shows up
-- 4. After countdown: users put into bracket matches

-- Fix 1: Create missing view causing 503 errors
DROP VIEW IF EXISTS v_tournament_match_ready_status;

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

-- Grant access to the view
GRANT SELECT ON v_tournament_match_ready_status TO authenticated;

-- Fix 2: Ensure tournament_participants table has proper RLS
DROP POLICY IF EXISTS "Users can view all tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can manage their own participation" ON tournament_participants;

CREATE POLICY "Users can view all tournament participants" ON tournament_participants
FOR SELECT USING (true);

CREATE POLICY "Users can join tournaments" ON tournament_participants
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own participation" ON tournament_participants
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can leave tournaments" ON tournament_participants
FOR DELETE USING (auth.uid() = user_id);

-- Fix 3: Enhanced tournament status transitions with proper bracket generation
DROP FUNCTION IF EXISTS complete_tournament_flow_progression(UUID);

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
  
  -- STEP 1: If tournament should start and has enough participants
  IF v_tournament.status IN ('scheduled', 'checkin') 
     AND v_tournament.start_at <= v_now 
     AND v_participant_count >= 2 THEN
    
    -- Generate bracket if not already generated
    IF v_tournament.bracket_generated_at IS NULL THEN
      PERFORM generate_tournament_bracket(p_tournament_id);
    END IF;
    
    -- Start tournament (this will trigger countdown and then matches)
    UPDATE tournaments 
    SET status = 'in_progress',
        started_at = v_now
    WHERE id = p_tournament_id;
    
    v_result := json_build_object(
      'success', true,
      'action', 'tournament_started',
      'message', 'Tournament started with bracket generation',
      'participant_count', v_participant_count
    );
    
  -- STEP 2: If tournament should start but insufficient participants
  ELSIF v_tournament.status IN ('scheduled', 'checkin') 
        AND v_tournament.start_at <= v_now 
        AND v_participant_count < 2 THEN
    
    -- Cancel tournament
    UPDATE tournaments 
    SET status = 'cancelled',
        cancelled_at = v_now,
        cancellation_reason = 'Insufficient participants (minimum 2 required)'
    WHERE id = p_tournament_id;
    
    v_result := json_build_object(
      'success', true,
      'action', 'tournament_cancelled',
      'message', 'Tournament cancelled - insufficient participants',
      'participant_count', v_participant_count
    );
    
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

-- Fix 4: Enhanced bracket generation with proper match setup
DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID);

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
  -- Get tournament details
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Check if bracket already generated
  IF v_tournament.bracket_generated_at IS NOT NULL THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Bracket already generated',
      'tournament_id', p_tournament_id
    );
  END IF;
  
  -- Get participants in random order for fair bracket seeding
  SELECT ARRAY_AGG(user_id ORDER BY RANDOM()) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
  AND status_type = 'confirmed';
  
  v_participant_count := array_length(v_participants, 1);
  
  -- Validate minimum participants
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
      id,
      tournament_id,
      round,
      match_number,
      match_index,
      player1_id,
      player2_id,
      status,
      ready_deadline
    ) VALUES (
      v_match_id,
      p_tournament_id,
      v_round,
      i,
      v_match_index,
      CASE WHEN i * 2 - 1 <= v_participant_count THEN v_participants[i * 2 - 1] ELSE NULL END,
      CASE WHEN i * 2 <= v_participant_count THEN v_participants[i * 2] ELSE NULL END,
      CASE 
        WHEN i * 2 <= v_participant_count THEN 'ready'
        WHEN i * 2 - 1 <= v_participant_count THEN 'bye'
        ELSE 'pending'
      END,
      -- Set ready deadline to 3 minutes after tournament start
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
        id,
        tournament_id,
        round,
        match_number,
        match_index,
        status
      ) VALUES (
        v_match_id,
        p_tournament_id,
        v_round,
        i,
        v_match_index,
        'pending'
      );
      
      v_match_index := v_match_index + 1;
      v_total_matches := v_total_matches + 1;
    END LOOP;
    
    v_round := v_round + 1;
  END LOOP;
  
  -- Update bracket_generated_at timestamp
  UPDATE tournaments
  SET bracket_generated_at = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Tournament bracket generated successfully',
    'tournament_id', p_tournament_id,
    'participants', v_participant_count,
    'total_matches', v_total_matches,
    'bracket_size', v_participant_count
  );
END;
$$;

-- Fix 5: Ensure tournament_match_ready table has proper structure and RLS
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ready_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(match_id, user_id)
);

-- RLS policies for tournament_match_ready
ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ready status" ON tournament_match_ready;
DROP POLICY IF EXISTS "Users can ready up" ON tournament_match_ready;

CREATE POLICY "Users can view ready status" ON tournament_match_ready
FOR SELECT USING (true);

CREATE POLICY "Users can ready up" ON tournament_match_ready
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Fix 6: Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_tournament_flow_progression(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO service_role;

-- Fix 7: Update process_tournament_status_transitions to use the enhanced progression
DROP FUNCTION IF EXISTS process_tournament_status_transitions();

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
BEGIN
  -- Process all tournaments that might need status updates
  FOR v_tournament IN 
    SELECT t.*
    FROM tournaments t 
    WHERE t.status IN ('registration', 'scheduled', 'checkin') 
    AND t.start_at <= NOW()
    ORDER BY t.start_at ASC
  LOOP
    
    -- Use the enhanced progression function
    SELECT complete_tournament_flow_progression(v_tournament.id) INTO v_tournament_result;
    
    -- Count results
    IF (v_tournament_result->>'action') = 'tournament_started' THEN
      v_started_count := v_started_count + 1;
    ELSIF (v_tournament_result->>'action') = 'tournament_cancelled' THEN  
      v_cancelled_count := v_cancelled_count + 1;
    END IF;
    
    v_results := v_results || v_tournament_result;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'processed_at', NOW(),
    'tournaments_started', v_started_count,
    'tournaments_cancelled', v_cancelled_count,
    'total_processed', v_started_count + v_cancelled_count,
    'details', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO authenticated;
GRANT EXECUTE ON FUNCTION process_tournament_status_transitions() TO service_role;

-- Fix 8: Create RPC function for ready-up that's properly accessible
DROP FUNCTION IF EXISTS ready_up_tournament_match(UUID);

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
  v_result JSON;
BEGIN
  v_current_user_id := auth.uid();
  
  IF v_current_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not authenticated');
  END IF;
  
  -- Get match details
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Check if user is a participant in this match
  IF v_current_user_id != v_match.player1_id AND v_current_user_id != v_match.player2_id THEN
    RETURN json_build_object('success', false, 'error', 'User not a participant in this match');
  END IF;
  
  -- Insert or update ready status
  INSERT INTO tournament_match_ready (match_id, user_id)
  VALUES (p_match_id, v_current_user_id)
  ON CONFLICT (match_id, user_id) DO NOTHING;
  
  -- Check how many players are ready
  SELECT COUNT(*) INTO v_ready_count
  FROM tournament_match_ready
  WHERE match_id = p_match_id;
  
  -- If both players are ready, create match room
  IF v_ready_count = 2 THEN
    -- Generate match room ID
    v_match_room_id := 'tournament_' || p_match_id::text || '_' || extract(epoch from now())::text;
    
    -- Update match with room ID and status
    UPDATE tournament_matches
    SET match_room_id = v_match_room_id,
        status = 'in_progress',
        started_at = NOW()
    WHERE id = p_match_id;
    
    v_result := json_build_object(
      'success', true,
      'ready_count', v_ready_count,
      'match_room_id', v_match_room_id,
      'status', 'match_starting'
    );
  ELSE
    v_result := json_build_object(
      'success', true,
      'ready_count', v_ready_count,
      'status', 'waiting_for_opponent'
    );
  END IF;
  
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(UUID) TO authenticated;