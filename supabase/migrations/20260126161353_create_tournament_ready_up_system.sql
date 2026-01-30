/*
  # Create Tournament Ready Up System

  1. RPC Functions
    - `ready_up_tournament_match(p_tournament_match_id UUID)` - Mark player as ready for tournament match
      - Validates user is a player in the match
      - Records readiness in tournament_match_ready table
      - If both players ready, creates match_room and updates tournament_matches
      - Returns success status and match_room_id when both ready

  2. Purpose
    - Enable tournament match "ready up" flow before match starts
    - Automatically create match room when both players are ready
    - Integrate with existing quick-match mechanics via match_room_id
*/

-- Drop existing function if exists
DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

-- RPC: Ready up for tournament match
CREATE FUNCTION ready_up_tournament_match(p_tournament_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_tournament RECORD;
  v_is_player1 boolean;
  v_is_player2 boolean;
  v_player1_ready boolean := false;
  v_player2_ready boolean := false;
  v_match_room_id uuid;
  v_best_of integer;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not authenticated'
    );
  END IF;

  -- Get tournament match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = p_tournament_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament match not found'
    );
  END IF;

  -- Get tournament config
  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = v_match.tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Tournament not found'
    );
  END IF;

  -- Validate user is a player in this match
  v_is_player1 := (v_match.player1_id = v_user_id);
  v_is_player2 := (v_match.player2_id = v_user_id);

  IF NOT v_is_player1 AND NOT v_is_player2 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You are not a player in this match'
    );
  END IF;

  -- Validate match is in correct status
  IF v_match.status NOT IN ('pending', 'ready_check') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Match is not in ready check phase'
    );
  END IF;

  -- Record player readiness (upsert)
  INSERT INTO public.tournament_match_ready (tournament_match_id, user_id, ready_at)
  VALUES (p_tournament_match_id, v_user_id, now())
  ON CONFLICT (tournament_match_id, user_id) 
  DO UPDATE SET ready_at = now();

  -- Check if both players are ready
  SELECT EXISTS(
    SELECT 1 FROM public.tournament_match_ready
    WHERE tournament_match_id = p_tournament_match_id
      AND user_id = v_match.player1_id
  ) INTO v_player1_ready;

  SELECT EXISTS(
    SELECT 1 FROM public.tournament_match_ready
    WHERE tournament_match_id = p_tournament_match_id
      AND user_id = v_match.player2_id
  ) INTO v_player2_ready;

  -- If both players are ready, create match room and start match
  IF v_player1_ready AND v_player2_ready THEN
    -- Calculate legs_to_win from tournament best_of
    v_best_of := COALESCE(v_tournament.best_of, v_tournament.best_of_legs, 3);

    -- Create match room
    INSERT INTO public.match_rooms (
      player1_id,
      player2_id,
      game_mode,
      match_format,
      status,
      current_leg,
      legs_to_win,
      player1_remaining,
      player2_remaining,
      current_turn
    ) VALUES (
      v_match.player1_id,
      v_match.player2_id,
      v_tournament.game_mode,
      CASE v_best_of
        WHEN 1 THEN 'best-of-1'
        WHEN 3 THEN 'best-of-3'
        WHEN 5 THEN 'best-of-5'
        WHEN 7 THEN 'best-of-7'
        ELSE 'best-of-3'
      END,
      'active',
      1,
      CASE v_best_of
        WHEN 1 THEN 1
        WHEN 3 THEN 2
        WHEN 5 THEN 3
        WHEN 7 THEN 4
        ELSE 2
      END,
      v_tournament.game_mode,
      v_tournament.game_mode,
      v_match.player1_id
    )
    RETURNING id INTO v_match_room_id;

    -- Update tournament match with room id and status
    UPDATE public.tournament_matches
    SET 
      match_room_id = v_match_room_id,
      status = 'in_progress',
      started_at = now(),
      updated_at = now()
    WHERE id = p_tournament_match_id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Both players ready - match starting!',
      'both_ready', true,
      'match_room_id', v_match_room_id
    );
  END IF;

  -- Only current player is ready
  RETURN jsonb_build_object(
    'success', true,
    'message', 'You are ready! Waiting for opponent...',
    'both_ready', false,
    'player1_ready', v_player1_ready,
    'player2_ready', v_player2_ready
  );
END;
$$;

-- Update tournament_matches status check to include ready_check
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tournament_matches' 
      AND column_name = 'status'
  ) THEN
    -- Drop existing constraint
    ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
    
    -- Add new constraint with ready_check status
    ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_status_check 
      CHECK (status = ANY (ARRAY['pending'::text, 'ready_check'::text, 'in_progress'::text, 'ready'::text, 'live'::text, 'completed'::text]));
  END IF;
END $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;
