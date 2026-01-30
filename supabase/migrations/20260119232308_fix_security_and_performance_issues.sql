/*
  # Fix Security and Performance Issues

  ## Overview
  This migration addresses critical security and performance issues identified by Supabase's
  security scanner, including unindexed foreign keys, RLS policy optimization, and function
  search path vulnerabilities.

  ## Changes

  ### 1. Add Missing Foreign Key Indexes
  Foreign keys without indexes cause poor query performance when joining tables or checking
  referential integrity. This migration adds indexes for all unindexed foreign keys:
  
  - fixtures: away_user_id, home_user_id
  - leagues: created_by
  - matches: winner_id
  - messages: user_id
  - quick_games: host_user_id, opponent_user_id, winner_user_id
  - results: reported_by_user_id, winner_user_id
  - tournament_entries: user_id
  - tournaments: created_by

  ### 2. Optimize RLS Policies (Auth RLS Initialization)
  Replace direct `auth.uid()` calls with `(select auth.uid())` to prevent re-evaluation
  for each row, which significantly improves performance at scale. This affects 27 policies
  across all tables.

  ### 3. Fix Function Search Paths
  Add explicit schema prefixes to functions to prevent security vulnerabilities from
  role-mutable search paths.

  ## Security Notes
  - All changes are non-breaking and backward compatible
  - Policies maintain the same security constraints with improved performance
  - Functions are secured against search path manipulation attacks
*/

-- ============================================================================
-- PART 1: Add Missing Foreign Key Indexes
-- ============================================================================

-- Fixtures table indexes
CREATE INDEX IF NOT EXISTS idx_fixtures_away_user_id ON fixtures(away_user_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_home_user_id ON fixtures(home_user_id);

-- Leagues table indexes
CREATE INDEX IF NOT EXISTS idx_leagues_created_by ON leagues(created_by);

-- Matches table indexes
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON matches(winner_id);

-- Messages table indexes
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

-- Quick games table indexes
CREATE INDEX IF NOT EXISTS idx_quick_games_host_user_id ON quick_games(host_user_id);
CREATE INDEX IF NOT EXISTS idx_quick_games_opponent_user_id ON quick_games(opponent_user_id);
CREATE INDEX IF NOT EXISTS idx_quick_games_winner_user_id ON quick_games(winner_user_id);

-- Results table indexes
CREATE INDEX IF NOT EXISTS idx_results_reported_by_user_id ON results(reported_by_user_id);
CREATE INDEX IF NOT EXISTS idx_results_winner_user_id ON results(winner_user_id);

-- Tournament entries table indexes
CREATE INDEX IF NOT EXISTS idx_tournament_entries_user_id ON tournament_entries(user_id);

-- Tournaments table indexes
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);

-- ============================================================================
-- PART 2: Optimize RLS Policies for Performance
-- ============================================================================

-- Drop and recreate all policies with optimized auth.uid() calls

-- Profiles table policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

-- Leagues table policies
DROP POLICY IF EXISTS "Admins can create leagues" ON leagues;
CREATE POLICY "Admins can create leagues"
  ON leagues FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update leagues" ON leagues;
CREATE POLICY "Admins can update leagues"
  ON leagues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- League members table policies
DROP POLICY IF EXISTS "Users can join leagues" ON league_members;
CREATE POLICY "Users can join leagues"
  ON league_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can leave leagues" ON league_members;
CREATE POLICY "Users can leave leagues"
  ON league_members FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Fixtures table policies
DROP POLICY IF EXISTS "Admins can create fixtures" ON fixtures;
CREATE POLICY "Admins can create fixtures"
  ON fixtures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- Results table policies
DROP POLICY IF EXISTS "Players can report results" ON results;
CREATE POLICY "Players can report results"
  ON results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fixtures
      WHERE fixtures.id = results.fixture_id
      AND (fixtures.home_user_id = (select auth.uid()) OR fixtures.away_user_id = (select auth.uid()))
    )
  );

-- Tournaments table policies
DROP POLICY IF EXISTS "Admins can create tournaments" ON tournaments;
CREATE POLICY "Admins can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- Tournament entries table policies
DROP POLICY IF EXISTS "Users can enter tournaments" ON tournament_entries;
CREATE POLICY "Users can enter tournaments"
  ON tournament_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can withdraw from tournaments" ON tournament_entries;
CREATE POLICY "Users can withdraw from tournaments"
  ON tournament_entries FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Quick games table policies
DROP POLICY IF EXISTS "Users can create quick games" ON quick_games;
CREATE POLICY "Users can create quick games"
  ON quick_games FOR INSERT
  TO authenticated
  WITH CHECK (host_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their quick games" ON quick_games;
CREATE POLICY "Users can update their quick games"
  ON quick_games FOR UPDATE
  TO authenticated
  USING (host_user_id = (select auth.uid()) OR opponent_user_id = (select auth.uid()))
  WITH CHECK (host_user_id = (select auth.uid()) OR opponent_user_id = (select auth.uid()));

-- Chat rooms table policies
DROP POLICY IF EXISTS "Admins can create chat rooms" ON chat_rooms;
CREATE POLICY "Admins can create chat rooms"
  ON chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- Messages table policies
DROP POLICY IF EXISTS "Users can create messages" ON messages;
CREATE POLICY "Users can create messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Matches table policies
DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
CREATE POLICY "Users can view their own matches"
  ON matches FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
CREATE POLICY "Users can insert their own matches"
  ON matches FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can update their own active matches" ON matches;
CREATE POLICY "Users can update their own active matches"
  ON matches FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()) AND status = 'active')
  WITH CHECK (user_id = (select auth.uid()));

-- Match legs table policies
DROP POLICY IF EXISTS "Users can view legs from their matches" ON match_legs;
CREATE POLICY "Users can view legs from their matches"
  ON match_legs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert legs to their matches" ON match_legs;
CREATE POLICY "Users can insert legs to their matches"
  ON match_legs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update legs in their matches" ON match_legs;
CREATE POLICY "Users can update legs in their matches"
  ON match_legs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_legs.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

-- Match visits table policies
DROP POLICY IF EXISTS "Users can view visits from their matches" ON match_visits;
CREATE POLICY "Users can view visits from their matches"
  ON match_visits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_legs
      JOIN matches ON matches.id = match_legs.match_id
      WHERE match_legs.id = match_visits.leg_id
      AND matches.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert visits to their matches" ON match_visits;
CREATE POLICY "Users can insert visits to their matches"
  ON match_visits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM match_legs
      JOIN matches ON matches.id = match_legs.match_id
      WHERE match_legs.id = match_visits.leg_id
      AND matches.user_id = (select auth.uid())
    )
  );

-- Match stats table policies
DROP POLICY IF EXISTS "Users can view stats from their matches" ON match_stats;
CREATE POLICY "Users can view stats from their matches"
  ON match_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert stats to their matches" ON match_stats;
CREATE POLICY "Users can insert stats to their matches"
  ON match_stats FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update stats in their matches" ON match_stats;
CREATE POLICY "Users can update stats in their matches"
  ON match_stats FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_stats.match_id
      AND matches.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- PART 3: Fix Function Search Paths
-- ============================================================================

-- Recreate update_updated_at function with secure search path
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Recreate add_creator_as_member function with secure search path
CREATE OR REPLACE FUNCTION public.add_creator_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.league_members (league_id, user_id, rank, role)
  VALUES (NEW.id, NEW.created_by, 1, 'admin')
  ON CONFLICT (league_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;
