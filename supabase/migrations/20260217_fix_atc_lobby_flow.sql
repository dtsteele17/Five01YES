-- ============================================================================
-- FIX: ATC Lobby Flow - Ensure proper realtime and data structure
-- ============================================================================

-- 1. Ensure quick_match_lobbies has proper columns for ATC
ALTER TABLE quick_match_lobbies 
ADD COLUMN IF NOT EXISTS atc_settings JSONB,
ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb;

-- 2. Enable realtime for quick_match_lobbies (if not already)
ALTER PUBLICATION supabase_realtime ADD TABLE quick_match_lobbies;

-- 3. Enable realtime for atc_matches (if not already)
ALTER PUBLICATION supabase_realtime ADD TABLE atc_matches;

-- 4. Ensure atc_matches has proper RLS
ALTER TABLE atc_matches ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they work
DROP POLICY IF EXISTS "Players can view their ATC matches" ON atc_matches;
CREATE POLICY "Players can view their ATC matches"
  ON atc_matches FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(players) AS player
      WHERE (player->>'id')::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Players can update their ATC matches" ON atc_matches;
CREATE POLICY "Players can update their ATC matches"
  ON atc_matches FOR UPDATE
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(players) AS player
      WHERE (player->>'id')::uuid = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Players can insert ATC matches" ON atc_matches;
CREATE POLICY "Players can insert ATC matches"
  ON atc_matches FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE ON atc_matches TO authenticated;
GRANT ALL ON quick_match_lobbies TO authenticated;

-- 6. Verify indexes exist
CREATE INDEX IF NOT EXISTS idx_atc_matches_lobby ON atc_matches(lobby_id);
CREATE INDEX IF NOT EXISTS idx_atc_matches_status ON atc_matches(status);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_status ON quick_match_lobbies(status);
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_game_type ON quick_match_lobbies(game_type);

-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT 'ATC Lobby flow fixed!' as status;
