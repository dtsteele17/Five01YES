-- Tournament Timing and Ready-Up System
-- Run this after the tournament invite functions

-- Create tournament match ready-up table
CREATE TABLE IF NOT EXISTS tournament_match_readyup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ready_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 minutes'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_tournament_id ON tournament_match_readyup(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_match_id ON tournament_match_readyup(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_user_id ON tournament_match_readyup(user_id);

-- Add unique constraint to prevent duplicate ready-ups
ALTER TABLE tournament_match_readyup 
ADD CONSTRAINT unique_match_readyup 
UNIQUE (match_id, user_id);

-- Enable RLS
ALTER TABLE tournament_match_readyup ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view readyup for their matches" 
ON tournament_match_readyup FOR SELECT 
USING (
  user_id = auth.uid() OR
  EXISTS(
    SELECT 1 FROM tournament_matches tm 
    WHERE tm.id = match_id 
    AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
  )
);

CREATE POLICY "Users can ready up for their matches" 
ON tournament_match_readyup FOR INSERT 
WITH CHECK (
  user_id = auth.uid() AND 
  EXISTS(
    SELECT 1 FROM tournament_matches tm 
    WHERE tm.id = match_id 
    AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
  )
);

-- RPC Function: Check and start tournaments at their scheduled time
CREATE OR REPLACE FUNCTION check_tournament_start_times()
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON[];
  v_tournament_result JSON;
BEGIN
  v_result := ARRAY[]::JSON[];

  -- Find tournaments that should start now
  FOR v_tournament IN 
    SELECT * FROM tournaments 
    WHERE status = 'registration' 
    AND start_at <= NOW()
    AND start_at > NOW() - INTERVAL '5 minutes' -- Only check recent ones
  LOOP
    -- Count participants
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id;
    
    -- Need at least 2 participants to start
    IF v_participant_count >= 2 THEN
      -- Lock tournament and generate bracket
      UPDATE tournaments 
      SET status = 'ready',
          bracket_generated_at = NOW()
      WHERE id = v_tournament.id;
      
      -- Generate bracket
      PERFORM generate_tournament_bracket(v_tournament.id);
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'started',
        'participant_count', v_participant_count
      );
    ELSE
      -- Cancel tournament - not enough players
      UPDATE tournaments 
      SET status = 'cancelled'
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'cancelled',
        'reason', 'insufficient_players',
        'participant_count', v_participant_count
      );
    END IF;
    
    v_result := v_result || v_tournament_result;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'tournaments_processed', array_length(v_result, 1),
    'results', v_result
  );
END;
$function$;

-- RPC Function: Generate tournament bracket with byes
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participants UUID[];
  v_participant_count INTEGER;
  v_bracket_size INTEGER;
  v_round INTEGER;
  v_match_index INTEGER;
  v_total_matches INTEGER;
  v_match_id UUID;
  v_result JSON;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Get participants
  SELECT ARRAY_AGG(user_id ORDER BY joined_at) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  v_participant_count := array_length(v_participants, 1);
  
  IF v_participant_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Not enough participants');
  END IF;
  
  -- Calculate bracket size (next power of 2)
  v_bracket_size := 2;
  WHILE v_bracket_size < v_participant_count LOOP
    v_bracket_size := v_bracket_size * 2;
  END LOOP;
  
  -- Clear existing matches
  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;
  
  -- Create first round matches
  v_round := 1;
  v_match_index := 0;
  
  FOR i IN 1..v_bracket_size/2 LOOP
    v_match_id := gen_random_uuid();
    
    INSERT INTO tournament_matches (
      id,
      tournament_id,
      round,
      match_index,
      player1_id,
      player2_id,
      status,
      created_at
    ) VALUES (
      v_match_id,
      p_tournament_id,
      v_round,
      v_match_index,
      CASE WHEN i <= v_participant_count THEN v_participants[i] ELSE NULL END,
      CASE WHEN i + v_bracket_size/2 <= v_participant_count THEN v_participants[i + v_bracket_size/2] ELSE NULL END,
      CASE 
        WHEN i <= v_participant_count AND i + v_bracket_size/2 <= v_participant_count THEN 'ready'
        WHEN i <= v_participant_count AND i + v_bracket_size/2 > v_participant_count THEN 'completed' -- Bye
        ELSE 'pending'
      END,
      NOW()
    );
    
    -- If it's a bye (only one player), auto-advance them
    IF i <= v_participant_count AND i + v_bracket_size/2 > v_participant_count THEN
      UPDATE tournament_matches 
      SET winner_id = v_participants[i],
          status = 'completed'
      WHERE id = v_match_id;
    END IF;
    
    v_match_index := v_match_index + 1;
  END LOOP;
  
  -- Create subsequent rounds (empty)
  v_total_matches := v_bracket_size/2;
  
  WHILE v_total_matches > 1 LOOP
    v_round := v_round + 1;
    v_total_matches := v_total_matches / 2;
    v_match_index := 0;
    
    FOR i IN 1..v_total_matches LOOP
      INSERT INTO tournament_matches (
        id,
        tournament_id,
        round,
        match_index,
        status,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_tournament_id,
        v_round,
        v_match_index,
        'pending',
        NOW()
      );
      
      v_match_index := v_match_index + 1;
    END LOOP;
  END LOOP;
  
  -- Update tournament status
  UPDATE tournaments 
  SET status = 'ready',
      bracket_generated_at = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'bracket_size', v_bracket_size,
    'participant_count', v_participant_count,
    'rounds', v_round,
    'message', 'Tournament bracket generated successfully'
  );
END;
$function$;

-- RPC Function: Ready up for tournament match
CREATE OR REPLACE FUNCTION tournament_match_ready_up(
  p_match_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_match RECORD;
  v_user_id UUID;
  v_other_ready BOOLEAN;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get match details
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Check if user is a participant in this match
  IF v_match.player1_id != v_user_id AND v_match.player2_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not a participant in this match');
  END IF;
  
  -- Check if match is ready for ready-up
  IF v_match.status != 'ready' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not ready for ready-up');
  END IF;
  
  -- Insert ready-up (upsert)
  INSERT INTO tournament_match_readyup (match_id, user_id, tournament_id)
  VALUES (p_match_id, v_user_id, v_match.tournament_id)
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET ready_at = NOW(), expires_at = NOW() + INTERVAL '3 minutes';
  
  -- Check if other player is ready
  SELECT EXISTS(
    SELECT 1 FROM tournament_match_readyup 
    WHERE match_id = p_match_id 
    AND user_id != v_user_id
    AND expires_at > NOW()
  ) INTO v_other_ready;
  
  IF v_other_ready THEN
    -- Both players ready! Start match
    UPDATE tournament_matches 
    SET status = 'starting'
    WHERE id = p_match_id;
    
    -- Create match room
    -- This would call create_tournament_match_room
    
    v_result := json_build_object(
      'success', true,
      'both_ready', true,
      'message', 'Both players ready! Starting match...'
    );
  ELSE
    v_result := json_build_object(
      'success', true,
      'both_ready', false,
      'message', 'Ready! Waiting for opponent...'
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- RPC Function: Get tournament match ready status
CREATE OR REPLACE FUNCTION get_tournament_match_ready_status(
  p_match_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_match RECORD;
  v_readyup_data JSON[];
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Get match details
  SELECT tm.*, t.name as tournament_name
  INTO v_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Get ready-up status
  SELECT ARRAY_AGG(
    json_build_object(
      'user_id', user_id,
      'ready_at', ready_at,
      'expires_at', expires_at,
      'is_ready', expires_at > NOW()
    )
  ) INTO v_readyup_data
  FROM tournament_match_readyup
  WHERE match_id = p_match_id;
  
  v_result := json_build_object(
    'success', true,
    'match', json_build_object(
      'id', v_match.id,
      'status', v_match.status,
      'player1_id', v_match.player1_id,
      'player2_id', v_match.player2_id,
      'tournament_name', v_match.tournament_name,
      'round', v_match.round
    ),
    'ready_status', COALESCE(v_readyup_data, ARRAY[]::JSON[]),
    'user_is_participant', (v_match.player1_id = v_user_id OR v_match.player2_id = v_user_id)
  );
  
  RETURN v_result;
END;
$function$;

-- Enable realtime for ready-up
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_match_readyup;