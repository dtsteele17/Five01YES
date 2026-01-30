/*
  # Add metadata field to notifications table

  ## Changes
  - Add `metadata` jsonb column to notifications table for storing additional achievement/notification data
  - This allows storing achievementId, achievementName, category, and other contextual information

  ## Notes
  - Nullable field with default null
  - Can store achievement details, league IDs, tournament info, etc.
*/

-- Add metadata column to notifications table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE notifications ADD COLUMN metadata jsonb DEFAULT NULL;
  END IF;
END $$;
