/*
  # Fix Recursive RLS Policies on Matches

  ## Problem
  Infinite recursion error when inserting matches because:
  - matches SELECT policy queries match_players
  - match_players SELECT policy queries matches
  - This creates a recursive loop

  ## Solution
  1. Remove all recursive checks from matches policies
  2. Use simple column checks (user_id, opponent_id, winner_id)
  3. Keep match_players policies that query matches (not recursive)
  4. Ensure insert policies allow completed matches

  ## Changes
  - Drop all existing matches policies
  - Create safe non-recursive policies for matches
  - Fix match_players policies to be non-recursive
*/

-- ========================================================
-- 1) Fix matches table policies (remove recursion)
-- ========================================================

-- Drop all existing policies on matches
DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
DROP POLICY IF EXISTS "Users can update their own active matches" ON matches;
DROP POLICY IF EXISTS "Users can view matches they're part of or by invite code" ON matches;

-- SELECT: Users can view matches where they are participants
-- NO SUBQUERIES - just direct column checks
CREATE POLICY "matches_select_participants"
  ON matches FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR opponent_id = auth.uid()
    OR winner_id = auth.uid()
    OR (invite_code IS NOT NULL AND status = 'lobby')
  );

-- INSERT: Users can insert matches where they are the creator
-- Allow any status including 'completed' for training/local matches
CREATE POLICY "matches_insert_creator"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: Users can update their own matches
CREATE POLICY "matches_update_owner"
  ON matches FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================================================
-- 2) Fix match_players policies (safe to query matches)
-- ========================================================

-- Drop all existing policies on match_players
DROP POLICY IF EXISTS "Users can view players from their matches" ON match_players;
DROP POLICY IF EXISTS "Users can insert players to their matches" ON match_players;
DROP POLICY IF EXISTS "Users can update players in their matches" ON match_players;
DROP POLICY IF EXISTS "Players can view match players" ON match_players;
DROP POLICY IF EXISTS "Users can join matches in lobby" ON match_players;
DROP POLICY IF EXISTS "Users can save player stats for their matches" ON match_players;

-- SELECT: Users can view players from matches they're in
-- This queries matches but matches doesn't query back - NO RECURSION
CREATE POLICY "match_players_select_participants"
  ON match_players FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (
        m.user_id = auth.uid()
        OR m.opponent_id = auth.uid()
        OR m.winner_id = auth.uid()
      )
    )
  );

-- INSERT: Users can insert match_players for matches they own
-- Allow both lobby matches AND completed matches (for stats saving)
CREATE POLICY "match_players_insert_participants"
  ON match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  );

-- UPDATE: Users can update their own player records or records in their matches
CREATE POLICY "match_players_update_participants"
  ON match_players FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND m.user_id = auth.uid()
    )
  );
