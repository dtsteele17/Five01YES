-- Create RPC function to complete the coin toss for a QuickMatch
-- This sets the coin toss winner and initializes the game state

CREATE OR REPLACE FUNCTION public.rpc_complete_coin_toss(
  p_room_id UUID,
  p_winner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_loser_id UUID;
BEGIN
  -- Get the current room state
  SELECT * INTO v_room
  FROM public.match_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Room not found');
  END IF;

  -- Validate the winner is one of the players
  IF p_winner_id != v_room.player1_id AND p_winner_id != v_room.player2_id THEN
    RETURN jsonb_build_object('error', 'Invalid winner ID');
  END IF;

  -- Determine the loser
  IF p_winner_id = v_room.player1_id THEN
    v_loser_id := v_room.player2_id;
  ELSE
    v_loser_id := v_room.player1_id;
  END IF;

  -- Update the room with coin toss results
  UPDATE public.match_rooms
  SET 
    coin_toss_winner_id = p_winner_id,
    coin_toss_completed = TRUE,
    current_turn = p_winner_id,  -- Winner throws first in leg 1
    leg_starter_id = p_winner_id,  -- Winner starts leg 1
    status = 'active',  -- Ensure status is active
    updated_at = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'winner_id', p_winner_id,
    'loser_id', v_loser_id,
    'message', 'Coin toss completed. ' || p_winner_id || ' will throw first.'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rpc_complete_coin_toss(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_coin_toss(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.rpc_complete_coin_toss IS 'Complete the coin toss for a QuickMatch and set the starting player';
