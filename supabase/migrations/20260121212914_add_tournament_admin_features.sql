/*
  # Add Tournament Admin Features

  1. Updates to tournaments table
    - Add starting_score column (301 or 501)
    - Add double_out boolean
    - Add straight_in boolean
    - Add tournament_format text (single-elimination, double-elimination)
    - Add seeding_type text (random, by-rp, manual)
    - Add rules_text for custom rules
    - Add bracket_generated boolean
    - Add bracket_state jsonb for storing bracket data
    
  2. Updates to tournament_entries table (participants)
    - Add role column (owner, admin, participant)
    - Add status column (registered, invited, checked-in, eliminated, banned)
    - Add ban_rounds_remaining integer
    - Add updated_at timestamp
    
  3. Create tournament_matches table if needed
    - Track individual matches within tournaments
    - Round number
    - Match number within round
    - Player IDs
    - Scheduled date/time
    - Status and results
    
  4. Security
    - Only owner/admins can manage tournaments
    - Participants can view
*/

DO $$
BEGIN
  -- Add starting_score to tournaments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'starting_score'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN starting_score integer DEFAULT 501 CHECK (starting_score IN (301, 501));
  END IF;

  -- Add double_out to tournaments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'double_out'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN double_out boolean DEFAULT true;
  END IF;

  -- Add straight_in to tournaments
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'straight_in'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN straight_in boolean DEFAULT true;
  END IF;

  -- Add tournament_format
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'tournament_format'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN tournament_format text DEFAULT 'single-elimination' 
      CHECK (tournament_format IN ('single-elimination', 'double-elimination'));
  END IF;

  -- Add seeding_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'seeding_type'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN seeding_type text DEFAULT 'random' 
      CHECK (seeding_type IN ('random', 'by-rp', 'manual'));
  END IF;

  -- Add rules_text
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'rules_text'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN rules_text text;
  END IF;

  -- Add bracket_generated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'bracket_generated'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN bracket_generated boolean DEFAULT false;
  END IF;

  -- Add bracket_state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'bracket_state'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN bracket_state jsonb;
  END IF;

  -- Add description if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'description'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN description text;
  END IF;

  -- Add start_time if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'start_time'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN start_time time;
  END IF;

  -- Add entry_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'entry_type'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN entry_type text DEFAULT 'open' 
      CHECK (entry_type IN ('open', 'invite'));
  END IF;

  -- Add max_participants if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'max_participants'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN max_participants integer DEFAULT 16 
      CHECK (max_participants IN (4, 8, 16, 32, 64, 128));
  END IF;

  -- Add legs_per_match if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'legs_per_match'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN legs_per_match integer DEFAULT 5 
      CHECK (legs_per_match IN (1, 3, 5, 7, 9, 11));
  END IF;

  -- Add scheduling_mode if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournaments' AND column_name = 'scheduling_mode'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN scheduling_mode text DEFAULT 'one-day' 
      CHECK (scheduling_mode IN ('one-day', 'multi-day'));
  END IF;

  -- Update tournament_entries table
  -- Add role column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_entries' AND column_name = 'role'
  ) THEN
    ALTER TABLE tournament_entries ADD COLUMN role text DEFAULT 'participant' 
      CHECK (role IN ('owner', 'admin', 'participant'));
  END IF;

  -- Add status_type column (separate from tournament status)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_entries' AND column_name = 'status_type'
  ) THEN
    ALTER TABLE tournament_entries ADD COLUMN status_type text DEFAULT 'registered' 
      CHECK (status_type IN ('registered', 'invited', 'checked-in', 'eliminated', 'banned'));
  END IF;

  -- Add ban_rounds_remaining
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_entries' AND column_name = 'ban_rounds_remaining'
  ) THEN
    ALTER TABLE tournament_entries ADD COLUMN ban_rounds_remaining integer DEFAULT 0;
  END IF;

  -- Add updated_at to tournament_entries
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_entries' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tournament_entries ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create tournament_matches table
CREATE TABLE IF NOT EXISTS tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  match_number integer NOT NULL,
  round_name text,
  player1_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_date timestamptz,
  scheduled_time time,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'bye')),
  winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  player1_score integer DEFAULT 0,
  player2_score integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for tournament_matches
CREATE POLICY "Users can view tournament matches"
  ON tournament_matches FOR SELECT
  TO authenticated
  USING (
    tournament_id IN (
      SELECT tournament_id FROM tournament_entries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tournament owners and admins can manage matches"
  ON tournament_matches FOR ALL
  TO authenticated
  USING (
    tournament_id IN (
      SELECT tournament_id FROM tournament_entries 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Update RLS policies for tournaments
DROP POLICY IF EXISTS "Anyone can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators can update their tournaments" ON tournaments;

CREATE POLICY "Users can view tournaments"
  ON tournaments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tournament owners and admins can update tournaments"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT tournament_id FROM tournament_entries 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT tournament_id FROM tournament_entries 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Update RLS policies for tournament_entries
DROP POLICY IF EXISTS "Anyone can view tournament entries" ON tournament_entries;
DROP POLICY IF EXISTS "Users can register for tournaments" ON tournament_entries;

CREATE POLICY "Users can view tournament entries"
  ON tournament_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tournament owners and admins can manage entries"
  ON tournament_entries FOR ALL
  TO authenticated
  USING (
    tournament_id IN (
      SELECT tournament_id FROM tournament_entries 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_role ON tournament_entries(role);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_status ON tournament_entries(status_type);
