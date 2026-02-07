/*
  # Enable Realtime for Tournament Participants

  ## Purpose
  Fix the issue where tournament participant count doesn't update in real-time
  when players register. This allows all viewers of a tournament page to see
  the participant count update instantly when someone joins.

  ## Changes
  1. Set REPLICA IDENTITY FULL for tournament_participants
  2. Add tournament_participants to supabase_realtime publication
  3. This enables postgres_changes subscriptions to work properly

  ## Impact
  - Tournament pages will show live participant count updates
  - When a player registers, all viewers see "1/16" become "2/16" instantly
  - No need to refresh the page to see updated participant counts
*/

-- Set REPLICA IDENTITY FULL so realtime includes all columns
ALTER TABLE tournament_participants REPLICA IDENTITY FULL;

-- Add to realtime publication if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'tournament_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_participants;
  END IF;
END $$;
