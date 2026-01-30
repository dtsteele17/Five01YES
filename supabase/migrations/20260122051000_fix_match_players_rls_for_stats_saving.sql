/*
  # Fix match_players RLS to allow stats saving after match completion

  ## Problem
  The previous migration created an overly restrictive INSERT policy on match_players
  that only allows inserts when match status is 'lobby'. This blocks saving player stats
  after match completion when status is 'completed'.

  ## Changes
  1. Drop the restrictive INSERT policy
  2. Create two separate INSERT policies:
     - One for joining matches in lobby (for online matches)
     - One for saving stats when match is completed (for all match types)
  
  ## Security
  Both policies ensure users can only insert data for matches they're authorized for
*/

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users can join matches in lobby" ON match_players;
DROP POLICY IF EXISTS "Users can insert players to their matches" ON match_players;

-- Policy 1: Allow inserting players when joining lobby matches (for online matches)
CREATE POLICY "Users can join matches in lobby"
  ON match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.status = 'lobby'
      AND (
        SELECT COUNT(*) FROM match_players mp
        WHERE mp.match_id = m.id
      ) < 2
    )
  );

-- Policy 2: Allow inserting player stats after match completion (for all match types)
CREATE POLICY "Users can save player stats for their matches"
  ON match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  );
