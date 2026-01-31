/*
  # Create Match Signals Table with Strict Routing

  1. Purpose
    - Replaces match_call_signals with proper signal routing
    - Ensures signals are ONLY visible to the intended recipient
    - Works for all match types (quick, ranked, tournament, league)

  2. New Table: match_signals
    - `id` (uuid, primary key)
    - `room_id` (uuid, match room identifier)
    - `from_user_id` (uuid, sender)
    - `to_user_id` (uuid, intended recipient)
    - `type` (text, signal type: offer/answer/ice)
    - `payload` (jsonb, signal data)
    - `created_at` (timestamp)

  3. Security (RLS)
    - INSERT: Only allowed if auth.uid() = from_user_id
    - SELECT: Only allowed if auth.uid() = to_user_id
    - This ensures signals are routed by recipient, not by room

  4. Why this fixes the issue
    - Old approach: Subscribe to all signals in room, filter in frontend
    - New approach: Database filters signals by to_user_id automatically
    - No more "Ignoring signal - not for me" messages
    - No accidental processing of own signals
*/

-- Create the new signals table
CREATE TABLE IF NOT EXISTS match_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'ice')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE match_signals ENABLE ROW LEVEL SECURITY;

-- INSERT policy: Can only send signals as yourself
CREATE POLICY "Users can send signals as themselves"
  ON match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

-- SELECT policy: Can only read signals sent TO you
CREATE POLICY "Users can only read signals sent to them"
  ON match_signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_signals_to_user ON match_signals(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_signals_room ON match_signals(room_id, created_at DESC);

-- Cleanup old signals (optional - keep last 24 hours)
CREATE INDEX IF NOT EXISTS idx_match_signals_cleanup ON match_signals(created_at);

COMMENT ON TABLE match_signals IS 'WebRTC signaling for all match types with strict to_user_id routing';
COMMENT ON COLUMN match_signals.to_user_id IS 'Recipient user ID - RLS ensures users only see signals addressed to them';
