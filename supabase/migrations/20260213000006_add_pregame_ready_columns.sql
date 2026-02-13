-- Add pre-game lobby columns to match_rooms
ALTER TABLE match_rooms
ADD COLUMN IF NOT EXISTS player1_ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS player2_ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pregame_status TEXT DEFAULT 'waiting' CHECK (pregame_status IN ('waiting', 'ready', 'timeout', 'cancelled'));

-- Add comment explaining the columns
COMMENT ON COLUMN match_rooms.player1_ready IS 'Player 1 has clicked ready in pre-game lobby';
COMMENT ON COLUMN match_rooms.player2_ready IS 'Player 2 has clicked ready in pre-game lobby';
COMMENT ON COLUMN match_rooms.pregame_status IS 'Status of pre-game lobby: waiting, ready, timeout, or cancelled';

-- Create function to send player_ready signal
CREATE OR REPLACE FUNCTION rpc_send_match_signal(
  p_room_id UUID,
  p_to_user_id UUID,
  p_type TEXT,
  p_payload JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_user_id UUID := auth.uid();
BEGIN
  INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
  VALUES (p_room_id, v_from_user_id, p_to_user_id, p_type, p_payload);
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION rpc_send_match_signal TO authenticated;

-- Create index for faster pregame status lookups
CREATE INDEX IF NOT EXISTS idx_match_rooms_pregame_status ON match_rooms(pregame_status) 
WHERE pregame_status IN ('waiting', 'ready');
