/*
  # Create Match Chat System

  1. New Tables
    - `match_chat_messages`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references match_rooms)
      - `from_user_id` (uuid, references auth.users)
      - `message` (text)
      - `created_at` (timestamptz)
      - `seen_by_player1` (boolean, default false)
      - `seen_by_player2` (boolean, default false)

  2. Security
    - Enable RLS on `match_chat_messages` table
    - Players can read messages from their match rooms
    - Players can insert messages to their match rooms
    - Players can update seen status for their own messages

  3. Indexes
    - Index on room_id for fast lookup
    - Index on created_at for ordering
*/

-- Create match_chat_messages table
CREATE TABLE IF NOT EXISTS match_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now(),
  seen_by_player1 boolean DEFAULT false,
  seen_by_player2 boolean DEFAULT false
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_match_chat_messages_room_id 
  ON match_chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_match_chat_messages_created_at 
  ON match_chat_messages(created_at);

-- Enable RLS
ALTER TABLE match_chat_messages ENABLE ROW LEVEL SECURITY;

-- Players can read messages from their match rooms
CREATE POLICY "Players can read match chat messages"
  ON match_chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = match_chat_messages.room_id
      AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
    )
  );

-- Players can insert messages to their match rooms
CREATE POLICY "Players can send match chat messages"
  ON match_chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = match_chat_messages.room_id
      AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
    )
  );

-- Players can update seen status
CREATE POLICY "Players can update seen status"
  ON match_chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = match_chat_messages.room_id
      AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM match_rooms
      WHERE match_rooms.id = match_chat_messages.room_id
      AND (match_rooms.player1_id = auth.uid() OR match_rooms.player2_id = auth.uid())
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE match_chat_messages;

-- RPC function to mark messages as seen
CREATE OR REPLACE FUNCTION rpc_mark_chat_messages_seen(
  p_room_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room match_rooms%ROWTYPE;
BEGIN
  -- Get room details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  -- Check user is in this room
  IF auth.uid() != v_room.player1_id AND auth.uid() != v_room.player2_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Mark messages as seen based on which player you are
  IF auth.uid() = v_room.player1_id THEN
    UPDATE match_chat_messages
    SET seen_by_player1 = true
    WHERE room_id = p_room_id
    AND seen_by_player1 = false;
  ELSIF auth.uid() = v_room.player2_id THEN
    UPDATE match_chat_messages
    SET seen_by_player2 = true
    WHERE room_id = p_room_id
    AND seen_by_player2 = false;
  END IF;
END;
$$;
