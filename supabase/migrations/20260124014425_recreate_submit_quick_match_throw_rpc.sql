/*
  # Recreate RPC function for submitting Quick Match throws

  1. Drop existing function
    - Drop old version if exists

  2. Create new function
    - `submit_quick_match_throw(p_room_id, p_score)`
    - Validates it's the player's turn
    - Updates player remaining score
    - Creates match event
    - Switches turn
    - Handles leg completion and match completion
    - Returns result with checkout/bust/winner info

  3. Security
    - Only authenticated users can call
    - Only the player whose turn it is can submit
    - All updates happen atomically
*/

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

  -- Insert event
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

  -- Handle leg completion
  IF v_is_checkout THEN
    v_leg_won := TRUE;
    
    -- Get current leg counts from summary or initialize
    IF v_room.summary ? 'player1_legs' THEN
      v_player1_legs := (v_room.summary->>'player1_legs')::INTEGER;
      v_player2_legs := (v_room.summary->>'player2_legs')::INTEGER;
    END IF;

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

    -- If match won, mark as completed
    IF v_match_won THEN
      UPDATE public.match_rooms
      SET
        status = 'completed',
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
      -- Start new leg
      v_next_leg := v_room.current_leg + 1;
      
      UPDATE public.match_rooms
      SET
        current_leg = v_next_leg,
        player1_remaining = v_room.game_mode,
        player2_remaining = v_room.game_mode,
        current_turn = v_room.player1_id,
        summary = jsonb_build_object(
          'player1_legs', v_player1_legs,
          'player2_legs', v_player2_legs
        ),
        updated_at = NOW()
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- Update remaining and switch turn
    UPDATE public.match_rooms
    SET
      player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE player1_remaining END,
      player2_remaining = CASE WHEN v_is_player1 THEN player2_remaining ELSE v_new_remaining END,
      current_turn = v_other_player_id,
      updated_at = NOW()
    WHERE id = p_room_id;
  END IF;

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'is_bust', v_is_bust,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'winner_id', v_winner_id,
    'new_remaining', v_new_remaining,
    'player1_legs', v_player1_legs,
    'player2_legs', v_player2_legs
  );
END;
$$;
