/*
  # Fix Quick Match Lobbies Relationships and Schema

  1. Schema Changes
    - Add expires_at column for automatic lobby cleanup
    - Add foreign key constraints for player1_id and player2_id to profiles table
    - Add index on status for faster queries

  2. Foreign Keys
    - player1_id references profiles(id) with cascade delete
    - player2_id references profiles(id) with set null
    - match_id references matches(id) with set null

  3. RLS Policies (Updated)
    - Allow all authenticated users to read open lobbies
    - Allow users to create lobbies as themselves
    - Allow users to delete their own lobbies
    - Allow users to join open lobbies with strict conditions

  4. Important Notes
    - This fixes the "Could not find a relationship" error
    - Enables Supabase to properly join player profiles
    - Adds automatic expiration tracking
*/

-- Add expires_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_match_lobbies' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE quick_match_lobbies 
    ADD COLUMN expires_at timestamptz DEFAULT now() + interval '30 minutes';
  END IF;
END $$;

-- Add foreign key constraints
ALTER TABLE quick_match_lobbies
DROP CONSTRAINT IF EXISTS quick_match_lobbies_player1_fk;

ALTER TABLE quick_match_lobbies
ADD CONSTRAINT quick_match_lobbies_player1_fk
FOREIGN KEY (player1_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE quick_match_lobbies
DROP CONSTRAINT IF EXISTS quick_match_lobbies_player2_fk;

ALTER TABLE quick_match_lobbies
ADD CONSTRAINT quick_match_lobbies_player2_fk
FOREIGN KEY (player2_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE quick_match_lobbies
DROP CONSTRAINT IF EXISTS quick_match_lobbies_match_fk;

ALTER TABLE quick_match_lobbies
ADD CONSTRAINT quick_match_lobbies_match_fk
FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS quick_match_lobbies_status_idx 
ON quick_match_lobbies(status) 
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS quick_match_lobbies_expires_at_idx 
ON quick_match_lobbies(expires_at) 
WHERE status = 'open';

-- Drop existing RLS policies and recreate them properly
DROP POLICY IF EXISTS "Users can view open quick match lobbies" ON quick_match_lobbies;
DROP POLICY IF EXISTS "Users can create quick match lobbies" ON quick_match_lobbies;
DROP POLICY IF EXISTS "Users can update their own lobbies" ON quick_match_lobbies;
DROP POLICY IF EXISTS "Users can delete their own lobbies" ON quick_match_lobbies;
DROP POLICY IF EXISTS "read_open_lobbies" ON quick_match_lobbies;
DROP POLICY IF EXISTS "create_lobby" ON quick_match_lobbies;
DROP POLICY IF EXISTS "delete_own_lobby" ON quick_match_lobbies;
DROP POLICY IF EXISTS "join_open_lobby" ON quick_match_lobbies;

-- Ensure RLS is enabled
ALTER TABLE quick_match_lobbies ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can read open lobbies
CREATE POLICY "read_open_lobbies"
ON quick_match_lobbies
FOR SELECT
TO authenticated
USING (status = 'open');

-- Policy 2: Users can create lobbies as themselves
CREATE POLICY "create_lobby"
ON quick_match_lobbies
FOR INSERT
TO authenticated
WITH CHECK (player1_id = auth.uid());

-- Policy 3: Users can delete their own lobbies
CREATE POLICY "delete_own_lobby"
ON quick_match_lobbies
FOR DELETE
TO authenticated
USING (player1_id = auth.uid());

-- Policy 4: Users can join open lobbies (update player2_id)
CREATE POLICY "join_open_lobby"
ON quick_match_lobbies
FOR UPDATE
TO authenticated
USING (
  status = 'open' 
  AND player2_id IS NULL 
  AND player1_id <> auth.uid()
)
WITH CHECK (
  player2_id = auth.uid() 
  OR player1_id = auth.uid()
);

-- Policy 5: Creator can update their own lobby (for cancellation, etc)
CREATE POLICY "update_own_lobby"
ON quick_match_lobbies
FOR UPDATE
TO authenticated
USING (player1_id = auth.uid())
WITH CHECK (player1_id = auth.uid());
