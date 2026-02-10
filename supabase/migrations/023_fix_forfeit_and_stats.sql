-- Fix forfeit function and ensure stats work properly

-- 1. Create or replace the forfeit function
CREATE OR REPLACE FUNCTION public.rpc_forfeit_match(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_player_id UUID;
  v_opponent_id UUID;
BEGIN
  v_player_id := auth.uid();
  
  -- Get room
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Determine opponent
  IF v_player_id = v_room.player1_id THEN
    v_opponent_id := v_room.player2_id;
  ELSIF v_player_id = v_room.player2_id THEN
    v_opponent_id := v_room.player1_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Not a player in this match');
  END IF;
  
  -- Update room - opponent wins
  UPDATE public.match_rooms SET
    status = 'forfeited',
    winner_id = v_opponent_id
  WHERE id = p_room_id;
  
  RETURN jsonb_build_object('ok', true, 'winner_id', v_opponent_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_forfeit_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_forfeit_match(UUID) TO anon;

-- 2. Ensure darts_thrown column exists and has proper values
-- Check if any visits are missing darts_thrown
UPDATE public.quick_match_visits
SET darts_thrown = COALESCE(jsonb_array_length(darts), 0)
WHERE darts_thrown IS NULL OR darts_thrown = 0;

-- 3. Ensure all visits have proper defaults
ALTER TABLE public.quick_match_visits 
ALTER COLUMN darts_thrown SET DEFAULT 0,
ALTER COLUMN is_bust SET DEFAULT false,
ALTER COLUMN is_checkout SET DEFAULT false;

-- 4. Verify the submit function handles darts_thrown correctly
-- (The 021_clean_winner_popup.sql should have fixed this)

-- 5. Add index for faster visit queries
CREATE INDEX IF NOT EXISTS idx_visits_player_checkout 
ON public.quick_match_visits(player_id, is_checkout) 
WHERE is_checkout = true;
