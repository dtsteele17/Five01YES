/*
  # Update notifications to use read_at timestamp

  1. Changes
    - Add `read_at` timestamp column to notifications table
    - Migrate existing `read` boolean data to `read_at` timestamps
    - Keep `read` column for backwards compatibility but make it a computed column

  2. Rationale
    - Using timestamp allows tracking when notifications were read
    - Boolean can be derived from `read_at IS NOT NULL`
    - Provides more detailed audit trail
*/

-- Add read_at column
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- Migrate existing data: if read = true, set read_at to now (best effort)
UPDATE notifications
SET read_at = now()
WHERE read = true AND read_at IS NULL;

-- Create an index on read_at for performance
CREATE INDEX IF NOT EXISTS idx_notifications_read_at
  ON notifications(user_id, read_at)
  WHERE read_at IS NULL;

-- Note: We keep the 'read' boolean column for backwards compatibility
-- Frontend code will be updated to use read_at and derive read status from it
