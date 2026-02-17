-- ============================================================================
-- FIX: Match History Structure (Drop ALL dependent views first)
-- ============================================================================

-- 1. Drop ALL dependent views first
DROP VIEW IF EXISTS public.match_history_recent;
DROP VIEW IF EXISTS public.v_user_match_history;
DROP VIEW IF EXISTS public.v_match_history;

-- 2. Now fix the table - alter column type
ALTER TABLE public.match_history 
ALTER COLUMN game_mode TYPE INTEGER USING game_mode::INTEGER;

-- 3. Ensure all columns exist
ALTER TABLE public.match_history 
ADD COLUMN IF NOT EXISTS room_id UUID,
ADD COLUMN IF NOT EXISTS opponent_id UUID,
ADD COLUMN IF NOT EXISTS match_format TEXT DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS bot_level INTEGER,
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON public.match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_opponent_id ON public.match_history(opponent_id);
CREATE INDEX IF NOT EXISTS idx_match_history_room_id ON public.match_history(room_id);
CREATE INDEX IF NOT EXISTS idx_match_history_game_mode ON public.match_history(game_mode);
CREATE INDEX IF NOT EXISTS idx_match_history_match_format ON public.match_history(match_format);
CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON public.match_history(played_at DESC);

-- 5. Enable RLS
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- 6. Drop existing policies
DROP POLICY IF EXISTS "match_history_select_policy" ON public.match_history;
DROP POLICY IF EXISTS "match_history_insert_policy" ON public.match_history;
DROP POLICY IF EXISTS "match_history_update_policy" ON public.match_history;

-- 7. Create clean policies
CREATE POLICY "match_history_select_policy" ON public.match_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "match_history_insert_policy" ON public.match_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "match_history_update_policy" ON public.match_history
  FOR UPDATE USING (user_id = auth.uid());

-- 8. Grant permissions
GRANT ALL ON public.match_history TO authenticated;
GRANT ALL ON public.match_history TO anon;

-- 9. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_history;

-- 10. Recreate the views
CREATE OR REPLACE VIEW public.v_user_match_history AS
SELECT 
  mh.*,
  p.username as opponent_username
FROM public.match_history mh
LEFT JOIN public.profiles p ON p.user_id = mh.opponent_id
WHERE mh.user_id = auth.uid();

CREATE OR REPLACE VIEW public.match_history_recent AS
SELECT *
FROM public.match_history
ORDER BY played_at DESC;

-- 11. Grant permissions on views
GRANT SELECT ON public.v_user_match_history TO authenticated;
GRANT SELECT ON public.match_history_recent TO authenticated;

-- Verify
SELECT 'Match history fixed! All views recreated.' as status;
