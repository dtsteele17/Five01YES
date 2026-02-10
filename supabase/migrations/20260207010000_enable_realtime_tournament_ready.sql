/*
  # Enable Realtime for Tournament Ready System

  ## Purpose
  Fix the tournament ready system so both players see real-time updates when someone
  clicks "Ready". Currently, when Player A clicks ready, Player B doesn't see the
  update until they refresh the page.

  ## Changes
  1. Set REPLICA IDENTITY FULL for tournament_match_ready
  2. Set REPLICA IDENTITY FULL for tournament_matches (for match_room_id updates)
  3. Add both tables to supabase_realtime publication

  ## Impact
  - When Player A clicks "Ready", Player B instantly sees "1/2 players ready"
  - When Player B clicks "Ready", both players instantly see "2/2 players ready"
  - The match starts immediately when both are ready (countdown stops)
  - No need to refresh the page to see ready status updates
*/

-- Set REPLICA IDENTITY FULL so realtime includes all columns
ALTER TABLE tournament_match_ready REPLICA IDENTITY FULL;
ALTER TABLE tournament_matches REPLICA IDENTITY FULL;

-- Add to realtime publication if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'tournament_match_ready'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_match_ready;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'tournament_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;
  END IF;
END $$;
