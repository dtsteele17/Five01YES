/*
  # Add League Settings Columns

  1. Changes to leagues table
    - Add `max_participants` (integer, renamed from max_players)
    - Add `access` (text, 'invite' or 'open')
    - Add `start_date` (date, when the league starts)
    - Add `match_days` (text[], days of week for matches)
    - Add `match_time` (time, time of day for matches)
    - Add `games_per_day` (integer, number of games per day)
    - Add `legs_per_game` (integer, number of legs per game)
    - Add `camera_required` (boolean, whether camera is required)
    - Add `playoffs` (text, playoff format: 'top4', 'top2', 'none')
    - Add `updated_at` (timestamptz, last update timestamp)

  2. Changes to league_members table
    - Add `rank` (integer, current rank in league)
    - Add `rating` (integer, current rating)
    - Add `wins` (integer, number of wins)
    - Add `losses` (integer, number of losses)

  3. Security
    - Update RLS policies to work with new columns
*/

-- Add new columns to leagues table
DO $$
BEGIN
  -- Add access column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'access'
  ) THEN
    ALTER TABLE leagues ADD COLUMN access text DEFAULT 'open' CHECK (access IN ('invite', 'open'));
  END IF;

  -- Add start_date column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE leagues ADD COLUMN start_date date;
  END IF;

  -- Add match_days column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'match_days'
  ) THEN
    ALTER TABLE leagues ADD COLUMN match_days text[];
  END IF;

  -- Add match_time column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'match_time'
  ) THEN
    ALTER TABLE leagues ADD COLUMN match_time time;
  END IF;

  -- Add games_per_day column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'games_per_day'
  ) THEN
    ALTER TABLE leagues ADD COLUMN games_per_day integer CHECK (games_per_day >= 1 AND games_per_day <= 10);
  END IF;

  -- Add legs_per_game column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'legs_per_game'
  ) THEN
    ALTER TABLE leagues ADD COLUMN legs_per_game integer CHECK (legs_per_game IN (3, 5, 7, 9, 11));
  END IF;

  -- Add camera_required column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'camera_required'
  ) THEN
    ALTER TABLE leagues ADD COLUMN camera_required boolean DEFAULT false;
  END IF;

  -- Add playoffs column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'playoffs'
  ) THEN
    ALTER TABLE leagues ADD COLUMN playoffs text CHECK (playoffs IN ('top4', 'top2', 'none'));
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE leagues ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- Rename max_players to max_participants (keep backward compatibility)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'max_players'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'max_participants'
  ) THEN
    ALTER TABLE leagues RENAME COLUMN max_players TO max_participants;
  END IF;
END $$;

-- Add new columns to league_members table
DO $$
BEGIN
  -- Add rank column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'rank'
  ) THEN
    ALTER TABLE league_members ADD COLUMN rank integer;
  END IF;

  -- Add rating column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'rating'
  ) THEN
    ALTER TABLE league_members ADD COLUMN rating integer DEFAULT 1000;
  END IF;

  -- Add wins column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'wins'
  ) THEN
    ALTER TABLE league_members ADD COLUMN wins integer DEFAULT 0;
  END IF;

  -- Add losses column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'losses'
  ) THEN
    ALTER TABLE league_members ADD COLUMN losses integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_leagues_start_date ON leagues(start_date);
CREATE INDEX IF NOT EXISTS idx_league_members_rank ON league_members(league_id, rank);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on leagues
DROP TRIGGER IF EXISTS update_leagues_updated_at ON leagues;
CREATE TRIGGER update_leagues_updated_at
  BEFORE UPDATE ON leagues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function to automatically add creator as member (if not exists)
CREATE OR REPLACE FUNCTION add_creator_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO league_members (league_id, user_id, rank, role)
  VALUES (NEW.id, NEW.created_by, 1, 'admin')
  ON CONFLICT (league_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to add creator as member
DROP TRIGGER IF EXISTS on_league_created ON leagues;
CREATE TRIGGER on_league_created
  AFTER INSERT ON leagues
  FOR EACH ROW
  EXECUTE FUNCTION add_creator_as_member();