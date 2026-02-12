-- ============================================
-- FIX: Match Signals RLS for WebRTC
-- Ensures players only receive signals addressed to them
-- ============================================

-- 1. Ensure match_signals table has proper RLS
ALTER TABLE public.match_signals ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view signals addressed to them" ON public.match_signals;
DROP POLICY IF EXISTS "Users can insert signals" ON public.match_signals;
DROP POLICY IF EXISTS "System can insert signals" ON public.match_signals;

-- 3. Create SELECT policy - users can only see signals sent TO them
CREATE POLICY "Users can view signals addressed to them"
  ON public.match_signals
  FOR SELECT
  USING (to_user_id = auth.uid());

-- 4. Create INSERT policy - authenticated users can send signals
CREATE POLICY "Users can insert signals"
  ON public.match_signals
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid() AND
    to_user_id IS NOT NULL
  );

-- 5. Ensure realtime is enabled for match_signals
-- First, check if table is in the publication
DO $$
BEGIN
  -- Remove from publication if exists (to avoid errors)
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.match_signals;
  END IF;
  
  -- Add back to publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.match_signals;
END $$;

-- 6. Grant proper permissions
GRANT SELECT, INSERT ON public.match_signals TO authenticated;
GRANT SELECT, INSERT ON public.match_signals TO anon;

-- 7. Create index for better performance on to_user_id lookups
CREATE INDEX IF NOT EXISTS idx_match_signals_to_user 
  ON public.match_signals(to_user_id);

-- 8. Create index for room_id + to_user_id combined lookups
CREATE INDEX IF NOT EXISTS idx_match_signals_room_to 
  ON public.match_signals(room_id, to_user_id);

SELECT 'Match signals RLS fixed!' as status;
