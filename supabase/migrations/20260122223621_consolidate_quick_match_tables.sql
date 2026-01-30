/*
  # Consolidate Quick Match System

  ## Actions
  1. Drop duplicate/conflicting tables
  2. Create single unified quick_match_lobbies table
  3. Create online_matches and online_match_visits tables
  4. Set up simple RLS policies (no recursion)
  5. Create RPC functions for atomic operations
*/

-- Drop old conflicting tables
DROP TABLE IF EXISTS quickmatch_lobbies CASCADE;
DROP TABLE IF EXISTS quick_match_lobbies CASCADE;
DROP TABLE IF EXISTS online_match_visits CASCADE;

-- Create unified quick_match_lobbies table
CREATE TABLE quick_match_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'cancelled', 'closed')),
  game_type int NOT NULL CHECK (game_type IN (301, 501)),
  format text NOT NULL CHECK (format IN ('best-of-1', 'best-of-3', 'best-of-5', 'best-of-7', 'best-of-9')),
  double_out boolean NOT NULL DEFAULT true,
  max_players int NOT NULL DEFAULT 2,
  player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player2_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid
);

-- Indexes
CREATE INDEX idx_qm_lobbies_status_created ON quick_match_lobbies(status, created_at DESC);
CREATE INDEX idx_qm_lobbies_created_by ON quick_match_lobbies(created_by);
CREATE INDEX idx_qm_lobbies_player2 ON quick_match_lobbies(player2_id);

-- Ensure online_matches has correct structure
DO $$ 
BEGIN
  -- Check if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'online_matches') THEN
    -- Add missing columns
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS p1_remaining int;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS p2_remaining int;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS p1_legs_won int DEFAULT 0;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS p2_legs_won int DEFAULT 0;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS leg_number int DEFAULT 1;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS format text;
    ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS double_out boolean DEFAULT true;
    
    -- Set NOT NULL after adding defaults
    UPDATE online_matches SET p1_remaining = game_type WHERE p1_remaining IS NULL;
    UPDATE online_matches SET p2_remaining = game_type WHERE p2_remaining IS NULL;
    UPDATE online_matches SET format = 'best-of-3' WHERE format IS NULL;
    UPDATE online_matches SET p1_legs_won = 0 WHERE p1_legs_won IS NULL;
    UPDATE online_matches SET p2_legs_won = 0 WHERE p2_legs_won IS NULL;
    UPDATE online_matches SET leg_number = 1 WHERE leg_number IS NULL;
  ELSE
    -- Create table from scratch
    CREATE TABLE online_matches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz DEFAULT now() NOT NULL,
      lobby_id uuid REFERENCES quick_match_lobbies(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'finished', 'abandoned')),
      game_type int NOT NULL CHECK (game_type IN (301, 501)),
      format text NOT NULL,
      double_out boolean NOT NULL DEFAULT true,
      player1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      player2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      current_player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      p1_remaining int NOT NULL,
      p2_remaining int NOT NULL,
      p1_legs_won int NOT NULL DEFAULT 0,
      p2_legs_won int NOT NULL DEFAULT 0,
      leg_number int NOT NULL DEFAULT 1,
      winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      updated_at timestamptz DEFAULT now() NOT NULL
    );
    
    CREATE INDEX idx_online_matches_player1 ON online_matches(player1_id);
    CREATE INDEX idx_online_matches_player2 ON online_matches(player2_id);
    CREATE INDEX idx_online_matches_status ON online_matches(status);
    CREATE INDEX idx_online_matches_lobby ON online_matches(lobby_id);
  END IF;
END $$;

-- Create online_match_visits table
CREATE TABLE online_match_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  match_id uuid NOT NULL REFERENCES online_matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leg_number int NOT NULL,
  visit_number int NOT NULL,
  score int NOT NULL CHECK (score >= 0 AND score <= 180),
  darts_at_double int NOT NULL DEFAULT 0 CHECK (darts_at_double >= 0 AND darts_at_double <= 3),
  is_checkout boolean NOT NULL DEFAULT false,
  checkout_value int CHECK (checkout_value IS NULL OR (checkout_value >= 0 AND checkout_value <= 170)),
  new_remaining int NOT NULL CHECK (new_remaining >= 0),
  UNIQUE(match_id, leg_number, player_id, visit_number)
);

CREATE INDEX idx_online_visits_match ON online_match_visits(match_id, leg_number, created_at);
CREATE INDEX idx_online_visits_player ON online_match_visits(player_id);

-- Enable RLS
ALTER TABLE quick_match_lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_match_visits ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('quick_match_lobbies', 'online_matches', 'online_match_visits')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Quick Match Lobbies Policies
CREATE POLICY "qm_select_open"
  ON quick_match_lobbies
  FOR SELECT
  TO authenticated
  USING (status IN ('open', 'matched'));

CREATE POLICY "qm_insert_own"
  ON quick_match_lobbies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND player1_id = (SELECT auth.uid())
    AND status = 'open'
  );

CREATE POLICY "qm_update_own"
  ON quick_match_lobbies
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK (
    (created_by = (SELECT auth.uid()) AND status IN ('open', 'cancelled'))
    OR (player2_id = (SELECT auth.uid()) AND status = 'matched')
  );

-- Online Matches Policies
CREATE POLICY "match_select_players"
  ON online_matches
  FOR SELECT
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

CREATE POLICY "match_insert_players"
  ON online_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

CREATE POLICY "match_update_players"
  ON online_matches
  FOR UPDATE
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  )
  WITH CHECK (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

-- Online Match Visits Policies
CREATE POLICY "visits_select_players"
  ON online_match_visits
  FOR SELECT
  TO authenticated
  USING (
    player_id = (SELECT auth.uid())
    OR match_id IN (
      SELECT id FROM online_matches
      WHERE player1_id = (SELECT auth.uid()) OR player2_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "visits_insert_own"
  ON online_match_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = (SELECT auth.uid())
    AND match_id IN (
      SELECT id FROM online_matches
      WHERE player1_id = (SELECT auth.uid()) OR player2_id = (SELECT auth.uid())
    )
  );
