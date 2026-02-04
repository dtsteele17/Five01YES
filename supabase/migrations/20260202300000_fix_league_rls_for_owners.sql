/*
  # Fix League RLS Policy for Owners

  ## Issue
  - Users can't view leagues they created if they're not in league_members (shouldn't happen, but handle it)
  - RLS policy only checks league_members, not owner_id

  ## Solution
  - Update RLS policy to allow owners to view their leagues
  - This ensures league creators can always view their leagues
*/

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view leagues they are members of" ON leagues;

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
