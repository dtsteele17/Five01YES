/*
  # Fix Tournaments RLS - Add INSERT Policy

  1. Changes
    - Add INSERT policy for tournaments table to allow authenticated users to create tournaments
    - Add INSERT policy for tournament_entries table to allow users to register/create entries
    
  2. Security
    - Users must be authenticated to create tournaments
    - created_by must match auth.uid()
    - Tournament entries must match the user creating them or be created by tournament owners/admins
*/

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can register for tournaments" ON tournament_entries;

-- Allow authenticated users to create tournaments
CREATE POLICY "Users can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow users to insert tournament entries
-- Either they're registering themselves, or they're an owner/admin adding others
CREATE POLICY "Users can register for tournaments"
  ON tournament_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User registering themselves
    user_id = auth.uid()
    OR
    -- Owner/admin adding someone
    tournament_id IN (
      SELECT tournament_id FROM tournament_entries 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
