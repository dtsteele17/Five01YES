/*
  # Enable Realtime for Quick Match Tables

  ## Changes
  1. Set REPLICA IDENTITY FULL for quick_match_lobbies, online_matches, online_match_visits
  2. Enable realtime for these tables so changes are broadcast instantly to all connected clients

  ## Important Notes
  - REPLICA IDENTITY FULL ensures all columns are included in realtime events
  - This allows proper INSERT/UPDATE/DELETE subscriptions
  - Required for DartCounter-style live lobby updates
*/

-- Set REPLICA IDENTITY FULL so realtime includes all columns
ALTER TABLE quick_match_lobbies REPLICA IDENTITY FULL;
ALTER TABLE online_matches REPLICA IDENTITY FULL;
ALTER TABLE online_match_visits REPLICA IDENTITY FULL;

-- These tables should already be in the realtime publication,
-- but we'll explicitly ensure they're published
DO $$
BEGIN
  -- Add tables to realtime publication if not already there
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'quick_match_lobbies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quick_match_lobbies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'online_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE online_matches;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'online_match_visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE online_match_visits;
  END IF;
END $$;
