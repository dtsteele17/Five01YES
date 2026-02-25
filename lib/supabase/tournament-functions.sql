-- Tournament system RPC functions

-- Progress tournament bracket when a match is completed
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
  
  -- Calculate next round and match index
  v_next_round := v_current_match.round + 1;
  v_next_match_index := v_current_match.match_index / 2; -- Integer division
  
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
      -- Even match_index in current round -> player1 in next round
      -- Odd match_index in current round -> player2 in next round
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

-- Create tournament match room for tournament matches
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
  v_legs_to_win := (p_legs_per_match / 2) + 1;
  
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
    true, -- Most tournaments use double out
    NOW(),
    NOW()
  ) RETURNING id INTO v_room_id;
  
  -- Return the room ID
  v_result := json_build_object(
    'success', true,
    'room_id', v_room_id,
    'legs_to_win', v_legs_to_win
  );
  
  RETURN v_result;
END;
$$;

-- Join tournament function (if not exists)
CREATE OR REPLACE FUNCTION join_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Check if tournament is open for registration
  IF v_tournament.status != 'registration' THEN
    RETURN json_build_object('success', false, 'error', 'Tournament registration is closed');
  END IF;
  
  -- Check if user is already registered
  IF EXISTS(SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already registered for this tournament');
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  -- Check if tournament is full
  IF v_participant_count >= v_tournament.max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Tournament is full');
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
  
  v_result := json_build_object(
    'success', true,
    'message', 'Successfully joined tournament'
  );
  
  RETURN v_result;
END;
$$;