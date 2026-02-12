-- ============================================
-- FIX: Match Signals RLS - Allow All Authenticated Inserts
-- ============================================

-- 1. First, disable RLS to ensure the table is accessible
ALTER TABLE public.match_signals DISABLE ROW LEVEL SECURITY;

-- 2. Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view signals addressed to them" ON public.match_signals;
DROP POLICY IF EXISTS "Users can insert signals" ON public.match_signals;
DROP POLICY IF EXISTS "System can insert signals" ON public.match_signals;
DROP POLICY IF EXISTS "Enable read access for users" ON public.match_signals;
DROP POLICY IF EXISTS "Enable insert access for users" ON public.match_signals;
DROP POLICY IF EXISTS "match_signals_select" ON public.match_signals;
DROP POLICY IF EXISTS "match_signals_insert" ON public.match_signals;

-- 3. Enable RLS again
ALTER TABLE public.match_signals ENABLE ROW LEVEL SECURITY;

-- 4. Create a permissive SELECT policy - users can only see signals sent TO them
CREATE POLICY "match_signals_select"
  ON public.match_signals
  FOR SELECT
  TO authenticated
  USING (to_user_id = auth.uid());

-- 5. Create a permissive INSERT policy - authenticated users can send signals to anyone
-- This allows the app to send WebRTC signals
CREATE POLICY "match_signals_insert"
  ON public.match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 6. Grant full permissions to authenticated users
GRANT ALL ON public.match_signals TO authenticated;
GRANT ALL ON public.match_signals TO anon;

-- 7. Also grant sequence permissions if needed
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 8. Ensure realtime publication is set up correctly
DO $$
BEGIN
  -- Check if table is in the publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'match_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_signals;
  END IF;
END $$;

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_match_signals_to_user 
  ON public.match_signals(to_user_id);

CREATE INDEX IF NOT EXISTS idx_match_signals_room 
  ON public.match_signals(room_id);

CREATE INDEX IF NOT EXISTS idx_match_signals_created 
  ON public.match_signals(created_at DESC);

-- 10. Verify setup
SELECT 
  'RLS Status' as check_name,
  relrowsecurity::text as rls_enabled
FROM pg_class 
WHERE relname = 'match_signals'

UNION ALL

SELECT 
  'Policy Count' as check_name,
  COUNT(*)::text as policy_count
FROM pg_policy
WHERE polrelid = 'match_signals'::regclass;
