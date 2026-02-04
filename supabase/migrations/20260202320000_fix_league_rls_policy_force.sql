/*
  # Fix League RLS Policy - Force Update

  ## Issue
  - Policy already exists, need to drop and recreate
  - Users can't view leagues they created

  ## Solution
  - Drop existing policy (if exists)
  - Create new policy that allows owners to view their leagues
*/

-- Drop existing policies (try both possible names)
DROP POLICY IF EXISTS "Users can view leagues they are members of" ON leagues;
DROP POLICY IF EXISTS "Users can view leagues they are members of or own" ON leagues;

-- Create updated policy that allows:
-- 1. Users who are members (via league_members)
-- 2. Users who are owners (via owner_id)
CREATE POLICY "Users can view leagues they are members of or own"
  ON leagues FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );
