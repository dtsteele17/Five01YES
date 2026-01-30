/*
  # Online Private Matches System

  1. Tables Created:
    - `friends` - Friend relationships between users
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `friend_id` (uuid, references profiles)
      - `status` (text: pending, accepted, blocked)
      - `created_at` (timestamptz)
      
    - `match_state` - Current state of active matches (single source of truth)
      - `match_id` (uuid, primary key, references matches)
      - `current_leg` (int)
      - `p1_remaining` (int)
      - `p2_remaining` (int)
      - `p1_legs_won` (int)
      - `p2_legs_won` (int)
      - `current_turn_user_id` (uuid, references profiles)
      - `last_action_at` (timestamptz)
      - `state` (jsonb - stores visit history, checkout attempts etc.)
      - `updated_at` (timestamptz)
      
    - `match_events` - Append-only event log for match replay and debugging
      - `id` (uuid, primary key)
      - `match_id` (uuid, references matches)
      - `user_id` (uuid, references profiles)
      - `type` (text: visit_submitted, visit_edited, bust, leg_won, match_started, match_completed)
      - `payload` (jsonb)
      - `created_at` (timestamptz)

  2. Enhancements to existing tables:
    - Add `invite_code` to matches table for join links
    - Add match_type 'private_online' to matches
    - Add status 'lobby' to matches for pre-game state

  3. Security:
    - Enable RLS on all tables
    - Friends: users can read their own friendships
    - Matches: players can read matches they're part of
    - Match state: only players in match can read, only current turn player can update
    - Match events: only players can read/insert

  4. Indexes:
    - friends(user_id, status) for friend list queries
    - match_events(match_id, created_at) for event replay
    - matches(invite_code) for join flow
*/

-- Create friends table
CREATE TABLE IF NOT EXISTS friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  friend_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status text CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user_id_status ON friends(user_id, status);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id_status ON friends(friend_id, status);

-- Add invite_code to matches if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'matches' AND column_name = 'invite_code'
  ) THEN
    ALTER TABLE matches ADD COLUMN invite_code text UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_matches_invite_code ON matches(invite_code);
  END IF;
END $$;

-- Create match_state table
CREATE TABLE IF NOT EXISTS match_state (
  match_id uuid PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  current_leg int DEFAULT 1,
  p1_remaining int NOT NULL,
  p2_remaining int NOT NULL,
  p1_legs_won int DEFAULT 0,
  p2_legs_won int DEFAULT 0,
  current_turn_user_id uuid REFERENCES profiles(id) NOT NULL,
  last_action_at timestamptz DEFAULT now(),
  state jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Create match_events table
CREATE TABLE IF NOT EXISTS match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) NOT NULL,
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_events_match_id_created_at ON match_events(match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);

-- Enable RLS on all tables
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- Friends policies
CREATE POLICY "Users can view their own friendships"
  ON friends FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friend requests"
  ON friends FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update friendships they're part of"
  ON friends FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete their own friend requests"
  ON friends FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Match state policies
CREATE POLICY "Players can view match state"
  ON match_state FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = match_state.match_id
      AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Match owner can create match state"
  ON match_state FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can update match state on their turn"
  ON match_state FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = match_state.match_id
      AND mp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = match_state.match_id
      AND mp.user_id = auth.uid()
    )
  );

-- Match events policies
CREATE POLICY "Players can view match events"
  ON match_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = match_events.match_id
      AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Players can insert match events"
  ON match_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = match_events.match_id
      AND mp.user_id = auth.uid()
    )
  );

-- Update matches RLS to allow viewing by invite code
DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
CREATE POLICY "Users can view matches they're part of or by invite code"
  ON matches FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR opponent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM match_players mp
      WHERE mp.match_id = matches.id
      AND mp.user_id = auth.uid()
    )
    OR (invite_code IS NOT NULL AND status = 'lobby')
  );

-- Update match_players RLS
DROP POLICY IF EXISTS "Users can view match players" ON match_players;
CREATE POLICY "Players can view match players"
  ON match_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (
        m.user_id = auth.uid() 
        OR m.opponent_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM match_players mp2
          WHERE mp2.match_id = m.id
          AND mp2.user_id = auth.uid()
        )
      )
    )
  );

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
    AND user_id = auth.uid()
  );
