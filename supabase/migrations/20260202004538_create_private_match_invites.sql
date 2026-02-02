/*
  # Create Private Match Invites System

  1. New Tables
    - `private_match_invites`
      - `id` (uuid, primary key)
      - `from_user_id` (uuid, references profiles)
      - `to_user_id` (uuid, references profiles)
      - `room_id` (uuid)
      - `match_options` (jsonb) - stores game settings
      - `status` (text: pending, accepted, declined, cancelled)
      - `created_at` (timestamptz)
      - `responded_at` (timestamptz)

  2. Security
    - Enable RLS on table
    - Add policies for authenticated users
*/

-- Private Match Invites Table
CREATE TABLE IF NOT EXISTS private_match_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  match_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_private_match_invites_from ON private_match_invites(from_user_id);
CREATE INDEX IF NOT EXISTS idx_private_match_invites_to ON private_match_invites(to_user_id);
CREATE INDEX IF NOT EXISTS idx_private_match_invites_status ON private_match_invites(status);
CREATE INDEX IF NOT EXISTS idx_private_match_invites_room ON private_match_invites(room_id);

ALTER TABLE private_match_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invites"
  ON private_match_invites FOR SELECT
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "Users can create invites"
  ON private_match_invites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Users can update invites they sent or received"
  ON private_match_invites FOR UPDATE
  TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Enable Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'private_match_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE private_match_invites;
  END IF;
END $$;
