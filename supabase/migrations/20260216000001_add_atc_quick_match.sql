-- ============================================
-- Add Around The Clock Quick Match Support
-- ============================================

-- Create ATC Matches table
CREATE TABLE IF NOT EXISTS atc_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id UUID REFERENCES quick_match_lobbies(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'completed')),
  game_mode VARCHAR(20) DEFAULT 'atc',
  atc_settings JSONB NOT NULL DEFAULT '{
    "order": "sequential",
    "mode": "singles",
    "player_count": 2
  }'::jsonb,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  targets JSONB NOT NULL DEFAULT '[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,"bull"]'::jsonb,
  current_player_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  winner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE atc_matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Add atc_settings column to quick_match_lobbies if not exists
ALTER TABLE quick_match_lobbies 
ADD COLUMN IF NOT EXISTS atc_settings JSONB,
ADD COLUMN IF NOT EXISTS players JSONB DEFAULT '[]'::jsonb;

-- Update realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE atc_matches;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON atc_matches TO authenticated;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_atc_matches_lobby ON atc_matches(lobby_id);
CREATE INDEX IF NOT EXISTS idx_atc_matches_status ON atc_matches(status);
CREATE INDEX IF NOT EXISTS idx_atc_matches_created_by ON atc_matches(created_by);

-- ============================================
-- DONE!
-- ============================================
SELECT 'ATC Quick Match support added!' as status;
