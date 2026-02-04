/*
  # Ensure Turn Switching and Leg Scores Work Correctly
  
  ⚠️ CRITICAL: DO NOT MODIFY THIS FUNCTION WITHOUT TESTING TURN SWITCHING AND LEG SCORES ⚠️
  
  This migration ensures that:
  1. Turn switching works correctly after each visit (line 189: current_turn = v_other_player_id)
  2. Leg scores are properly initialized and updated in summary JSONB
  3. The summary JSONB is always present with player1_legs and player2_legs
  
  KEY BEHAVIORS (DO NOT CHANGE):
  - Line 189: ALWAYS switches turn to opponent after a visit (even on bust)
  - Lines 190-197: ALWAYS maintains summary JSONB with leg scores
  - Lines 127-131: Increments leg count when checkout happens
  - Lines 175: Sets current_turn to next leg starter when leg is won
  
  TESTING REQUIRED:
  - Player A submits score → must switch to Player B's turn
  - Player wins leg → leg score must update (e.g., 1-0, 2-1)
  - Both players can continue playing without turn getting stuck
*/

-- Ensure submit_quick_match_throw properly switches turns and updates leg scores
DROP FUNCTION IF EXISTS public.submit_quick_match_throw(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.submit_quick_match_throw(
  p_room_id UUID,
  p_score INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room RECORD;
  v_is_player1 BOOLEAN;
  v_current_remaining INTEGER;
  v_new_remaining INTEGER;
  v_is_bust BOOLEAN;
  v_is_checkout BOOLEAN;
  v_other_player_id UUID;
  v_player1_legs INTEGER := 0;
  v_player2_legs INTEGER := 0;
  v_leg_won BOOLEAN := FALSE;
  v_match_won BOOLEAN := FALSE;
  v_winner_id UUID := NULL;
  v_next_leg INTEGER;
  v_next_leg_starter UUID;
  v_event_seq INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate score
  IF p_score < 0 OR p_score > 180 THEN
    RAISE EXCEPTION 'Invalid score: must be between 0 and 180';
  END IF;

  -- Lock and get room
  SELECT * INTO v_room
  FROM public.match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check if match is active
  IF v_room.status != 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  -- Check if it's the user's turn
  IF v_room.current_turn != v_user_id THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  -- Determine if user is player1 or player2
  v_is_player1 := (v_user_id = v_room.player1_id);
  IF NOT v_is_player1 AND v_user_id != v_room.player2_id THEN
    RAISE EXCEPTION 'Not a player in this match';
  END IF;

  -- Get current remaining and calculate new remaining
  v_current_remaining := CASE WHEN v_is_player1 THEN v_room.player1_remaining ELSE v_room.player2_remaining END;
  v_new_remaining := v_current_remaining - p_score;

  -- Determine bust and checkout
  v_is_bust := (v_new_remaining < 0 OR v_new_remaining = 1);
  v_is_checkout := (NOT v_is_bust AND v_new_remaining = 0);

  -- If bust, reset to current remaining
  IF v_is_bust THEN
    v_new_remaining := v_current_remaining;
  END IF;

  -- Get other player
  v_other_player_id := CASE WHEN v_is_player1 THEN v_room.player2_id ELSE v_room.player1_id END;

  -- Get current event sequence
  SELECT COALESCE(MAX(seq), 0) + 1 INTO v_event_seq
  FROM public.match_events
  WHERE room_id = p_room_id;

  -- Insert event with 'visit' type
  INSERT INTO public.match_events (room_id, player_id, seq, event_type, payload)
  VALUES (
    p_room_id,
    v_user_id,
    v_event_seq,
    'visit',
    jsonb_build_object(
      'score', p_score,
      'remaining', v_new_remaining,
      'is_bust', v_is_bust,
      'is_checkout', v_is_checkout,
      'leg', v_room.current_leg
    )
  );

  -- Initialize leg counts from summary if it exists, otherwise start at 0
  IF v_room.summary IS NOT NULL AND v_room.summary ? 'player1_legs' THEN
    v_player1_legs := COALESCE((v_room.summary->>'player1_legs')::INTEGER, 0);
    v_player2_legs := COALESCE((v_room.summary->>'player2_legs')::INTEGER, 0);
  ELSE
    v_player1_legs := 0;
    v_player2_legs := 0;
  END IF;

  -- Handle leg completion
  IF v_is_checkout THEN
    v_leg_won := TRUE;

    -- Increment leg count for winner
    IF v_is_player1 THEN
      v_player1_legs := v_player1_legs + 1;
    ELSE
      v_player2_legs := v_player2_legs + 1;
    END IF;

    -- Check if match is won
    IF v_player1_legs >= v_room.legs_to_win THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player1_id;
    ELSIF v_player2_legs >= v_room.legs_to_win THEN
      v_match_won := TRUE;
      v_winner_id := v_room.player2_id;
    END IF;

    -- If match won, mark as finished
    IF v_match_won THEN
      UPDATE public.match_rooms
      SET
        status = 'finished',
        winner_id = v_winner_id,
        player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE player1_remaining END,
        player2_remaining = CASE WHEN v_is_player1 THEN player2_remaining ELSE v_new_remaining END,
        summary = jsonb_build_object(
          'player1_legs', v_player1_legs,
          'player2_legs', v_player2_legs
        ),
        updated_at = NOW()
      WHERE id = p_room_id;
    ELSE
      -- Start new leg with alternating starter
      v_next_leg := v_room.current_leg + 1;

      -- Alternate starting player based on leg number
      -- Odd legs (1, 3, 5, ...): player1 starts
      -- Even legs (2, 4, 6, ...): player2 starts
      IF v_next_leg % 2 = 1 THEN
        v_next_leg_starter := v_room.player1_id;
      ELSE
        v_next_leg_starter := v_room.player2_id;
      END IF;

      UPDATE public.match_rooms
      SET
        current_leg = v_next_leg,
        player1_remaining = v_room.game_mode,
        player2_remaining = v_room.game_mode,
        current_turn = v_next_leg_starter,
        summary = jsonb_build_object(
          'player1_legs', v_player1_legs,
          'player2_legs', v_player2_legs
        ),
        updated_at = NOW()
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- NOT a checkout: Update remaining and switch turn (match stays active)
    -- IMPORTANT: Always switch turn after a visit (unless it's a bust, but we still switch)
    UPDATE public.match_rooms
    SET
      player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE player1_remaining END,
      player2_remaining = CASE WHEN v_is_player1 THEN player2_remaining ELSE v_new_remaining END,
      current_turn = v_other_player_id,  -- SWITCH TURN HERE
      summary = COALESCE(
        CASE 
          WHEN v_room.summary IS NULL THEN jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
          WHEN NOT (v_room.summary ? 'player1_legs') THEN jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
          ELSE v_room.summary
        END,
        jsonb_build_object('player1_legs', 0, 'player2_legs', 0)
      ),
      updated_at = NOW()
    WHERE id = p_room_id;
  END IF;

  -- Return result with leg scores
  RETURN jsonb_build_object(
    'success', TRUE,
    'is_bust', v_is_bust,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'winner_id', v_winner_id,
    'new_remaining', v_new_remaining,
    'player1_legs', v_player1_legs,
    'player2_legs', v_player2_legs,
    'current_turn', v_other_player_id  -- Return the new turn player
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quick_match_throw(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.submit_quick_match_throw IS 'Submits a throw/visit for a match. Always switches turn after visit. Updates leg scores in summary JSONB.';
