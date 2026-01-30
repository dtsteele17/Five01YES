/*
  # Create Match Call Signals Table

  1. New Tables
    - `match_call_signals`
      - `id` (uuid, primary key)
      - `room_id` (uuid, foreign key to quick_match_lobbies)
      - `from_user` (uuid, foreign key to auth.users)
      - `to_user` (uuid, nullable, for direct messages)
      - `type` (text, signal type: offer/answer/ice/hangup)
      - `payload` (jsonb, signal data)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `match_call_signals` table
    - Add policy for authenticated users to insert signals
    - Add policy for authenticated users to read signals for their room

  3. Indexes
    - Index on room_id for faster queries
    - Index on created_at for cleanup
*/

CREATE TABLE IF NOT EXISTS match_call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user uuid,
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'ice', 'hangup')),
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE match_call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert call signals"
  ON match_call_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user);

CREATE POLICY "Users can read signals for their room"
  ON match_call_signals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quick_match_lobbies
      WHERE quick_match_lobbies.id = match_call_signals.room_id
      AND (quick_match_lobbies.player1_id = auth.uid() OR quick_match_lobbies.player2_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_match_call_signals_room_id ON match_call_signals(room_id);
CREATE INDEX IF NOT EXISTS idx_match_call_signals_created_at ON match_call_signals(created_at);
