-- Allow authenticated users to insert into match_rooms for ranked matches
-- (The frontend syncs ranked_match_rooms → match_rooms so the full game screen works)
-- Safe to run multiple times.

DROP POLICY IF EXISTS "Users can insert ranked match rooms" ON match_rooms;
CREATE POLICY "Users can insert ranked match rooms"
ON match_rooms FOR INSERT
TO authenticated
WITH CHECK (
  source = 'ranked'
  AND (player1_id = auth.uid() OR player2_id = auth.uid())
);

-- Also ensure users can read and update their own match rooms
DROP POLICY IF EXISTS "Users can read own match rooms" ON match_rooms;
CREATE POLICY "Users can read own match rooms"
ON match_rooms FOR SELECT
TO authenticated
USING (player1_id = auth.uid() OR player2_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own match rooms" ON match_rooms;
CREATE POLICY "Users can update own match rooms"
ON match_rooms FOR UPDATE
TO authenticated
USING (player1_id = auth.uid() OR player2_id = auth.uid());
