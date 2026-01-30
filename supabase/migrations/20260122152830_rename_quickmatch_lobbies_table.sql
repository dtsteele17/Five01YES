/*
  # Rename Quick Match Lobbies Table

  1. Changes
    - Rename quickmatch_lobbies_v2 to quickmatch_lobbies (as per requirements)
    - Update all foreign key references
    - Maintain all indexes and constraints

  2. Notes
    - This ensures the table name matches the specification exactly
*/

-- Rename the table
ALTER TABLE IF EXISTS quickmatch_lobbies_v2 RENAME TO quickmatch_lobbies;

-- Rename indexes to match new table name
ALTER INDEX IF EXISTS idx_quickmatch_lobbies_v2_status RENAME TO idx_quickmatch_lobbies_status;
ALTER INDEX IF EXISTS idx_quickmatch_lobbies_v2_created_at RENAME TO idx_quickmatch_lobbies_created_at;
ALTER INDEX IF EXISTS idx_quickmatch_lobbies_v2_expires_at RENAME TO idx_quickmatch_lobbies_expires_at;
ALTER INDEX IF EXISTS idx_quickmatch_lobbies_v2_host_user RENAME TO idx_quickmatch_lobbies_host_user;

-- Rename the trigger
DROP TRIGGER IF EXISTS quickmatch_lobbies_v2_updated_at ON quickmatch_lobbies;
CREATE TRIGGER quickmatch_lobbies_updated_at
  BEFORE UPDATE ON quickmatch_lobbies
  FOR EACH ROW
  EXECUTE FUNCTION update_quickmatch_lobbies_v2_updated_at();

-- Rename the trigger function for clarity
DROP FUNCTION IF EXISTS update_quickmatch_lobbies_v2_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION update_quickmatch_lobbies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger with correct function name
DROP TRIGGER IF EXISTS quickmatch_lobbies_updated_at ON quickmatch_lobbies;
CREATE TRIGGER quickmatch_lobbies_updated_at
  BEFORE UPDATE ON quickmatch_lobbies
  FOR EACH ROW
  EXECUTE FUNCTION update_quickmatch_lobbies_updated_at();

-- Update the foreign key constraint name in match_rooms if needed
ALTER TABLE match_rooms 
  DROP CONSTRAINT IF EXISTS match_rooms_lobby_id_fkey;

ALTER TABLE match_rooms
  ADD CONSTRAINT match_rooms_lobby_id_fkey
  FOREIGN KEY (lobby_id)
  REFERENCES quickmatch_lobbies(id)
  ON DELETE SET NULL;
