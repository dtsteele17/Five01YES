-- =======================================================
-- COMPLETE DARTCOUNTER.NET TOURNAMENT FLOW
-- =======================================================

-- Enhanced bracket generation with proper byes
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
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
  
  -- Get participants in random order for fair bracket seeding
  SELECT ARRAY_AGG(user_id ORDER BY RANDOM()) INTO v_participants
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
  
  -- Create first round matches with proper bye handling
  v_round := 1;
  v_match_index := 0;
  
  FOR i IN 1..v_bracket_size/2 LOOP
    v_match_id := gen_random_uuid();
    
    DECLARE
      v_player1_id UUID;
      v_player2_id UUID;
      v_match_status TEXT;
      v_winner_id UUID;
    BEGIN
      -- Assign players with bye logic
      v_player1_id := CASE WHEN i <= v_participant_count THEN v_participants[i] ELSE NULL END;
      v_player2_id := CASE WHEN i + v_bracket_size/2 <= v_participant_count THEN v_participants[i + v_bracket_size/2] ELSE NULL END;
      
      -- Determine match status and winner for byes
      IF v_player1_id IS NOT NULL AND v_player2_id IS NOT NULL THEN
        v_match_status := 'ready';
        v_winner_id := NULL;
      ELSIF v_player1_id IS NOT NULL AND v_player2_id IS NULL THEN
        -- Player 1 gets bye
        v_match_status := 'completed';
        v_winner_id := v_player1_id;
      ELSIF v_player1_id IS NULL AND v_player2_id IS NOT NULL THEN
        -- Player 2 gets bye  
        v_match_status := 'completed';
        v_winner_id := v_player2_id;
      ELSE
        -- Empty match
        v_match_status := 'pending';
        v_winner_id := NULL;
      END IF;
    
      INSERT INTO tournament_matches (
        id,
        tournament_id,
        round,
        match_index,
        player1_id,
        player2_id,
        winner_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        v_match_id,
        p_tournament_id,
        v_round,
        v_match_index,
        v_player1_id,
        v_player2_id,
        v_winner_id,
        v_match_status,
        NOW(),
        NOW()
      );
    END;
    
    v_match_index := v_match_index + 1;
  END LOOP;
  
  -- Create subsequent rounds (empty, will be populated as matches complete)
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
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        p_tournament_id,
        v_round,
        v_match_index,
        'pending',
        NOW(),
        NOW()
      );
      
      v_match_index := v_match_index + 1;
    END LOOP;
  END LOOP;

  -- Progress winners from completed bye matches
  FOR v_match_id IN 
    SELECT id FROM tournament_matches 
    WHERE tournament_id = p_tournament_id 
    AND round = 1 
    AND status = 'completed' 
    AND winner_id IS NOT NULL
  LOOP
    PERFORM progress_tournament_bracket(v_match_id, (
      SELECT winner_id FROM tournament_matches WHERE id = v_match_id
    ));
  END LOOP;
  
  -- Update tournament status
  UPDATE tournaments 
  SET status = 'in_progress',
      bracket_generated_at = NOW(),
      started_at = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'bracket_size', v_bracket_size,
    'participant_count', v_participant_count,
    'rounds', v_round,
    'message', 'Tournament bracket generated successfully'
  );
END;
$$;

-- Enhanced bracket progression
CREATE OR REPLACE FUNCTION progress_tournament_bracket(
  p_tournament_match_id UUID,
  p_winner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament_id UUID;
  v_current_match RECORD;
  v_next_match RECORD;
  v_next_round INTEGER;
  v_next_match_index INTEGER;
  v_max_round INTEGER;
  v_tournament_complete BOOLEAN := false;
  v_result JSON;
BEGIN
  -- Get the completed match details
  SELECT tm.*, t.max_participants 
  INTO v_current_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_tournament_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament match not found');
  END IF;

  v_tournament_id := v_current_match.tournament_id;
  
  -- Mark current match as completed
  UPDATE tournament_matches 
  SET winner_id = p_winner_id,
      status = 'completed',
      updated_at = NOW()
  WHERE id = p_tournament_match_id;
  
  -- Calculate next round and match index
  v_next_round := v_current_match.round + 1;
  v_next_match_index := v_current_match.match_index / 2;
  
  -- Get the maximum round for this tournament
  SELECT MAX(round) INTO v_max_round 
  FROM tournament_matches 
  WHERE tournament_id = v_tournament_id;
  
  -- Check if this was the final match
  IF v_current_match.round = v_max_round THEN
    -- Tournament is complete! Update tournament status
    UPDATE tournaments 
    SET status = 'completed',
        winner_id = p_winner_id,
        completed_at = NOW()
    WHERE id = v_tournament_id;
    
    v_tournament_complete := true;
    
    v_result := json_build_object(
      'success', true,
      'tournament_complete', true,
      'winner_id', p_winner_id,
      'message', 'Tournament completed!'
    );
  ELSE
    -- Find the next round match where this winner should advance
    SELECT * INTO v_next_match
    FROM tournament_matches
    WHERE tournament_id = v_tournament_id
      AND round = v_next_round
      AND match_index = v_next_match_index;
    
    IF FOUND THEN
      -- Determine if winner goes to player1 or player2 slot
      IF v_current_match.match_index % 2 = 0 THEN
        UPDATE tournament_matches 
        SET player1_id = p_winner_id,
            updated_at = NOW()
        WHERE id = v_next_match.id;
      ELSE
        UPDATE tournament_matches 
        SET player2_id = p_winner_id,
            updated_at = NOW()
        WHERE id = v_next_match.id;
      END IF;
      
      -- Check if the next match now has both players
      SELECT * INTO v_next_match
      FROM tournament_matches
      WHERE id = v_next_match.id;
      
      IF v_next_match.player1_id IS NOT NULL AND v_next_match.player2_id IS NOT NULL THEN
        -- Both players are set, mark match as ready
        UPDATE tournament_matches
        SET status = 'ready',
            updated_at = NOW()
        WHERE id = v_next_match.id;
      END IF;
      
      v_result := json_build_object(
        'success', true,
        'tournament_complete', false,
        'advanced_to_match', v_next_match.id,
        'next_round', v_next_round,
        'message', 'Player advanced to next round'
      );
    ELSE
      v_result := json_build_object(
        'success', false,
        'error', 'Next round match not found'
      );
    END IF;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Enhanced ready-up function with timeout handling
CREATE OR REPLACE FUNCTION tournament_match_ready_up(p_match_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
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
  
  -- Insert/update ready-up status
  INSERT INTO tournament_match_readyup (match_id, user_id, tournament_id, ready_at, expires_at)
  VALUES (p_match_id, v_user_id, v_match.tournament_id, NOW(), NOW() + INTERVAL '3 minutes')
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
    -- Both players ready! Mark match as starting
    UPDATE tournament_matches 
    SET status = 'starting',
        updated_at = NOW()
    WHERE id = p_match_id;
    
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
$$;

-- Match room creation for tournaments
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
AS $$
DECLARE
  v_room_id UUID;
  v_legs_to_win INTEGER;
  v_result JSON;
BEGIN
  -- Calculate legs to win based on best-of format
  v_legs_to_win := CASE 
    WHEN p_legs_per_match % 2 = 1 THEN (p_legs_per_match + 1) / 2
    ELSE p_legs_per_match / 2 + 1
  END;
  
  -- Create the match room
  INSERT INTO match_rooms (
    id,
    player1_id,
    player2_id,
    game_mode,
    match_format,
    match_type,
    legs_to_win,
    status,
    double_out,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_player1_id,
    p_player2_id,
    p_game_mode,
    'best_of_' || p_legs_per_match::text,
    'tournament',
    v_legs_to_win,
    'active',
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO v_room_id;

  -- Link the match room to the tournament match
  UPDATE tournament_matches 
  SET match_room_id = v_room_id,
      status = 'in_progress',
      updated_at = NOW()
  WHERE id = p_tournament_match_id;
  
  -- Return the room ID
  v_result := json_build_object(
    'success', true,
    'room_id', v_room_id,
    'legs_to_win', v_legs_to_win
  );
  
  RETURN v_result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_tournament_bracket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION progress_tournament_bracket(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION tournament_match_ready_up(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- Success message
SELECT 'Complete tournament flow functions created successfully!' as message;