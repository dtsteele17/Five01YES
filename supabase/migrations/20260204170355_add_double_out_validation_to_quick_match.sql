/*
  # Add Double-Out Validation to Quick Match

  ## Summary
  Enhances the submit_quick_match_throw RPC function to enforce double-out rules. When a player
  attempts to finish a leg (reach 0), the last dart must be a double or double bull.

  ## Changes
  1. RPC Function Parameters
     - Adds `p_darts` (JSONB array) - Array of dart objects with structure: { mult: 'S'|'D'|'T'|'B', n: number }
     - Adds `p_darts_thrown` (INTEGER) - Number of darts thrown (1-3)
     - Maintains backward compatibility with p_score parameter

  2. Double-Out Validation Logic
     - Reads `double_out` field from match_rooms table
     - When double_out is true and attempted_remaining === 0:
       - Validates last dart is a double (mult = 'D') OR double bull (mult = 'B' AND n = 50)
       - If validation fails, treats as bust: score = 0, is_bust = true
     - Maintains existing bust rules:
       - attempted_remaining < 0 => bust
       - attempted_remaining === 1 => bust (cannot finish on 1 in double-out)

  3. Return Values
     - Adds `bust_reason` field to response:
       - 'double_out_required' - Failed double-out validation
       - 'below_zero' - Score would go below 0
       - 'left_on_one' - Score would leave exactly 1
       - null - Not a bust

  ## Dart Format
  Each dart in p_darts array:
  ```json
  {
    "mult": "S"|"D"|"T"|"B",  // Single, Double, Triple, Bull
    "n": 1-20|25|50            // Number (25=bull, 50=double bull)
  }
  ```

  ## Examples
  - Valid double finish: Last dart is { "mult": "D", "n": 20 } (Double 20)
  - Valid bull finish: Last dart is { "mult": "B", "n": 50 } (Double Bull)
  - Invalid finish: Last dart is { "mult": "S", "n": 10 } => BUST (double required)
  - Invalid bull: Last dart is { "mult": "B", "n": 25 } => BUST (single bull not allowed)

  ## Security
  - Server-side validation prevents client bypass
  - All double-out rules enforced at database level
  - Maintains SECURITY DEFINER for proper permission handling
*/

DROP FUNCTION IF EXISTS public.submit_quick_match_throw(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.submit_quick_match_throw(
  p_room_id UUID,
  p_score INTEGER,
  p_darts JSONB DEFAULT '[]'::JSONB,
  p_darts_thrown INTEGER DEFAULT 3
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
  v_is_bust BOOLEAN := FALSE;
  v_bust_reason TEXT := NULL;
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
  v_last_dart JSONB;
  v_last_dart_mult TEXT;
  v_last_dart_n INTEGER;
  v_is_valid_double_finish BOOLEAN;
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

  -- Validate darts_thrown
  IF p_darts_thrown < 0 OR p_darts_thrown > 3 THEN
    RAISE EXCEPTION 'Invalid darts_thrown: must be between 0 and 3';
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

  -- Check for standard bust conditions
  IF v_new_remaining < 0 THEN
    v_is_bust := TRUE;
    v_bust_reason := 'below_zero';
  ELSIF v_new_remaining = 1 THEN
    v_is_bust := TRUE;
    v_bust_reason := 'left_on_one';
  END IF;

  -- Check for double-out requirement when attempting to finish (new_remaining = 0)
  IF NOT v_is_bust AND v_new_remaining = 0 AND v_room.double_out = TRUE THEN
    -- Get last dart from darts array
    IF jsonb_array_length(p_darts) > 0 THEN
      v_last_dart := p_darts -> (jsonb_array_length(p_darts) - 1);
      v_last_dart_mult := v_last_dart ->> 'mult';
      v_last_dart_n := (v_last_dart ->> 'n')::INTEGER;

      -- Valid double finish: mult = 'D' OR (mult = 'B' AND n = 50)
      v_is_valid_double_finish := (
        v_last_dart_mult = 'D' OR 
        (v_last_dart_mult = 'B' AND v_last_dart_n = 50)
      );

      IF NOT v_is_valid_double_finish THEN
        v_is_bust := TRUE;
        v_bust_reason := 'double_out_required';
      END IF;
    ELSE
      -- No darts provided but trying to checkout - treat as bust
      v_is_bust := TRUE;
      v_bust_reason := 'double_out_required';
    END IF;
  END IF;

  -- Determine checkout status
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

  -- Insert event with 'visit' type, including dart details
  INSERT INTO public.match_events (room_id, player_id, seq, event_type, payload)
  VALUES (
    p_room_id,
    v_user_id,
    v_event_seq,
    'visit',
    jsonb_build_object(
      'score', CASE WHEN v_is_bust THEN 0 ELSE p_score END,
      'remaining', v_new_remaining,
      'is_bust', v_is_bust,
      'is_checkout', v_is_checkout,
      'leg', v_room.current_leg,
      'darts', p_darts,
      'darts_thrown', p_darts_thrown,
      'bust_reason', v_bust_reason
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
    -- NOT a checkout: Update remaining and switch turn
    UPDATE public.match_rooms
    SET
      player1_remaining = CASE WHEN v_is_player1 THEN v_new_remaining ELSE player1_remaining END,
      player2_remaining = CASE WHEN v_is_player1 THEN player2_remaining ELSE v_new_remaining END,
      current_turn = v_other_player_id,
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

  -- Return result with bust reason
  RETURN jsonb_build_object(
    'success', TRUE,
    'is_bust', v_is_bust,
    'bust_reason', v_bust_reason,
    'is_checkout', v_is_checkout,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'winner_id', v_winner_id,
    'new_remaining', v_new_remaining,
    'player1_legs', v_player1_legs,
    'player2_legs', v_player2_legs,
    'current_turn', v_other_player_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quick_match_throw(UUID, INTEGER, JSONB, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.submit_quick_match_throw IS 'Submits a visit for Quick Match with double-out validation. Validates that finishing darts are doubles when double_out is enabled.';
