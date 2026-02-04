/*
  # Fix Match Chat to Use 'body' Column

  1. Changes
    - Rename `message` column to `body` in `match_chat_messages` table
    - Update any dependent functions

  2. New RPC Function
    - `rpc_send_match_chat_message` - Send a chat message using body column
*/

-- Rename message column to body
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'match_chat_messages' AND column_name = 'message'
  ) THEN
    ALTER TABLE match_chat_messages RENAME COLUMN message TO body;
  END IF;
END $$;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS rpc_send_match_chat_message(uuid, text);

-- RPC function to send a match chat message
CREATE OR REPLACE FUNCTION rpc_send_match_chat_message(
  p_room_id uuid,
  p_body text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room match_rooms%ROWTYPE;
  v_message_id uuid;
BEGIN
  -- Get room details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Room not found');
  END IF;

  -- Check user is in this room
  IF auth.uid() != v_room.player1_id AND auth.uid() != v_room.player2_id THEN
    RETURN json_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  -- Insert message
  INSERT INTO match_chat_messages (room_id, from_user_id, body)
  VALUES (p_room_id, auth.uid(), p_body)
  RETURNING id INTO v_message_id;

  RETURN json_build_object('ok', true, 'message_id', v_message_id);
END;
$$;
