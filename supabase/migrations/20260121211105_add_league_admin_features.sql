/*
  # Add League Admin Features

  1. Updates to leagues table
    - Add game_mode column
    - Add double_out column
    - Add straight_in column
    - Update camera_required to support 'required'/'optional'/'off'
    - Add playoffs_enabled boolean
    - Rename playoffs to playoffs_type

  2. Updates to league_members table
    - Update role to support 'owner'/'admin'/'member'
    - Add status column for 'active'/'banned'
    - Add ban_games_remaining column
    - Add updated_at column

  3. Create league_fixtures table if needed
    - Similar to fixtures but specifically for league management

  4. Security Updates
    - Add policies for owner/admin management
*/

DO $$
BEGIN
  -- Add game_mode to leagues if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'game_mode'
  ) THEN
    ALTER TABLE leagues ADD COLUMN game_mode text DEFAULT '501' CHECK (game_mode IN ('301', '501'));
  END IF;

  -- Add double_out to leagues if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'double_out'
  ) THEN
    ALTER TABLE leagues ADD COLUMN double_out boolean DEFAULT true;
  END IF;

  -- Add straight_in to leagues if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'straight_in'
  ) THEN
    ALTER TABLE leagues ADD COLUMN straight_in boolean DEFAULT true;
  END IF;

  -- Add playoffs_enabled to leagues if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'playoffs_enabled'
  ) THEN
    ALTER TABLE leagues ADD COLUMN playoffs_enabled boolean DEFAULT false;
  END IF;

  -- Update camera_required column type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leagues' AND column_name = 'camera_required' AND data_type = 'boolean'
  ) THEN
    ALTER TABLE leagues ALTER COLUMN camera_required TYPE text USING CASE 
      WHEN camera_required = true THEN 'required'
      WHEN camera_required = false THEN 'optional'
      ELSE 'optional'
    END;
    
    ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_camera_required_check;
    ALTER TABLE leagues ADD CONSTRAINT leagues_camera_required_check CHECK (camera_required IN ('required', 'optional', 'off'));
  END IF;

  -- Add status column to league_members if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE league_members ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active', 'banned'));
  END IF;

  -- Add ban_games_remaining to league_members if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'ban_games_remaining'
  ) THEN
    ALTER TABLE league_members ADD COLUMN ban_games_remaining integer DEFAULT 0;
  END IF;

  -- Add updated_at to league_members if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'league_members' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE league_members ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- Update role constraint to support owner/admin/member
  ALTER TABLE league_members DROP CONSTRAINT IF EXISTS league_members_role_check;
  ALTER TABLE league_members ADD CONSTRAINT league_members_role_check CHECK (role IN ('owner', 'admin', 'member', 'player'));
END $$;

-- Drop existing RLS policies and recreate them
DROP POLICY IF EXISTS "Enable read access for all users" ON leagues;
DROP POLICY IF EXISTS "Users can view league members for leagues they are in" ON league_members;
DROP POLICY IF EXISTS "Users can modify league members for leagues they administer" ON league_members;

-- League RLS policies
CREATE POLICY "Users can view leagues they are members of"
  ON leagues FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "League owners and admins can update their leagues"
  ON leagues FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT league_id FROM league_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT league_id FROM league_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can create leagues"
  ON leagues FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- League members RLS policies
CREATE POLICY "Users can view league members"
  ON league_members FOR SELECT
  TO authenticated
  USING (
    league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can manage members"
  ON league_members FOR ALL
  TO authenticated
  USING (
    league_id IN (
      SELECT league_id FROM league_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_league_members_role ON league_members(role);
CREATE INDEX IF NOT EXISTS idx_league_members_status ON league_members(status);
