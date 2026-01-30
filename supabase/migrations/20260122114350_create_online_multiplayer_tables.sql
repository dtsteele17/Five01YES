/*
  # Create Online Multiplayer Tables

  ## Overview
  This migration creates the infrastructure for online multiplayer including
  quick match lobbies and online match rooms.

  ## New Tables
  1. quick_match_lobbies - Server-visible lobbies for matchmaking
  2. online_matches - Real-time online match state and turn management
  3. tournament_admins - Tournament administrative roles

  ## Updates
  - Extend notifications type constraint for new notification types
  - Add metadata column to notifications if not exists
*/

-- ============================================================
-- 1. QUICK MATCH LOBBIES
-- ============================================================

CREATE TABLE IF NOT EXISTS quick_match_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_game', 'closed')),
  game_type int NOT NULL CHECK (game_type IN (301, 501)),
  best_of int NOT NULL DEFAULT 3 CHECK (best_of IN (1, 3, 5, 7, 9)),
  double_out boolean NOT NULL DEFAULT true,
  region text,
  host_player_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  guest_player_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  match_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_status ON quick_match_lobbies(status);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_created_at ON quick_match_lobbies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_game_type ON quick_match_lobbies(game_type);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_guest ON quick_match_lobbies(guest_player_id);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_host ON quick_match_lobbies(host_player_id);

ALTER TABLE quick_match_lobbies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view open lobbies or their own" ON quick_match_lobbies;
CREATE POLICY "Users can view open lobbies or their own"
  ON quick_match_lobbies FOR SELECT
  TO authenticated
  USING (
    status = 'open' OR
    created_by = auth.uid() OR
    guest_player_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can create lobbies" ON quick_match_lobbies;
CREATE POLICY "Authenticated users can create lobbies"
  ON quick_match_lobbies FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    host_player_id = auth.uid()
  );

DROP POLICY IF EXISTS "Host can update their lobby" ON quick_match_lobbies;
CREATE POLICY "Host can update their lobby"
  ON quick_match_lobbies FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Host can delete their lobby" ON quick_match_lobbies;
CREATE POLICY "Host can delete their lobby"
  ON quick_match_lobbies FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ============================================================
-- 2. ONLINE MATCHES
-- ============================================================

CREATE TABLE IF NOT EXISTS online_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid REFERENCES quick_match_lobbies(id) ON DELETE SET NULL,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  game_type int NOT NULL CHECK (game_type IN (301, 501)),
  best_of int NOT NULL DEFAULT 3 CHECK (best_of IN (1, 3, 5, 7, 9)),
  double_out boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  player1_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_turn_player_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_online_matches_status ON online_matches(status);
CREATE INDEX IF NOT EXISTS idx_online_matches_player1 ON online_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_online_matches_player2 ON online_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_online_matches_tournament ON online_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_online_matches_lobby ON online_matches(lobby_id);

ALTER TABLE online_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can view their matches" ON online_matches;
CREATE POLICY "Players can view their matches"
  ON online_matches FOR SELECT
  TO authenticated
  USING (
    player1_id = auth.uid() OR
    player2_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can create matches" ON online_matches;
CREATE POLICY "Authenticated users can create matches"
  ON online_matches FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND
    player1_id = auth.uid()
  );

DROP POLICY IF EXISTS "Players can update their matches" ON online_matches;
CREATE POLICY "Players can update their matches"
  ON online_matches FOR UPDATE
  TO authenticated
  USING (
    player1_id = auth.uid() OR
    player2_id = auth.uid()
  );

-- ============================================================
-- 3. TOURNAMENT ADMINS
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_admins (
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  PRIMARY KEY (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_admins_user ON tournament_admins(user_id);

ALTER TABLE tournament_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view admins of visible tournaments" ON tournament_admins;
CREATE POLICY "Users can view admins of visible tournaments"
  ON tournament_admins FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = tournament_admins.tournament_id
      AND (tournaments.status IN ('open', 'active', 'completed') OR tournaments.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tournament owners can manage admins" ON tournament_admins;
CREATE POLICY "Tournament owners can manage admins"
  ON tournament_admins FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = tournament_admins.tournament_id
      AND tournaments.created_by = auth.uid()
    )
  );

-- ============================================================
-- 4. UPDATE NOTIFICATIONS TABLE
-- ============================================================

-- Drop existing type constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint with extended types
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'league_announcement',
    'match_reminder',
    'achievement',
    'app_update',
    'tournament_invite',
    'league_invite',
    'match_invite',
    'quick_match_ready',
    'system'
  ));
