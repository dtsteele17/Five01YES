-- ============================================================================
-- FIX: Match History Structure and Foreign Keys
-- ============================================================================

-- 1. Ensure match_history table exists with all required columns
CREATE TABLE IF NOT EXISTS public.match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  game_mode INTEGER DEFAULT 501,
  match_format TEXT DEFAULT 'quick',
  result TEXT NOT NULL,
  legs_won INTEGER DEFAULT 0,
  legs_lost INTEGER DEFAULT 0,
  three_dart_avg DECIMAL(5,2) DEFAULT 0,
  first9_avg DECIMAL(5,2) DEFAULT 0,
  highest_checkout INTEGER DEFAULT 0,
  checkout_percentage DECIMAL(5,2) DEFAULT 0,
  darts_thrown INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  total_checkouts INTEGER DEFAULT 0,
  checkout_attempts INTEGER DEFAULT 0,
  visits_100_plus INTEGER DEFAULT 0,
  visits_140_plus INTEGER DEFAULT 0,
  visits_180 INTEGER DEFAULT 0,
  bot_level INTEGER,
  xp_earned INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add missing columns (if table already exists)
ALTER TABLE public.match_history 
ADD COLUMN IF NOT EXISTS room_id UUID,
ADD COLUMN IF NOT EXISTS opponent_id UUID,
ADD COLUMN IF NOT EXISTS game_mode INTEGER DEFAULT 501,
ADD COLUMN IF NOT EXISTS match_format TEXT DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS result TEXT,
ADD COLUMN IF NOT EXISTS legs_won INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS legs_lost INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS three_dart_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS first9_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS highest_checkout INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS darts_thrown INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visits_100_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visits_140_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS visits_180 INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bot_level INTEGER,
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Fix game_mode column type (ensure it's INTEGER)
ALTER TABLE public.match_history 
ALTER COLUMN game_mode TYPE INTEGER USING game_mode::INTEGER;

-- 4. Add foreign key constraint for opponent_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'match_history_opponent_id_fkey' 
    AND table_name = 'match_history'
  ) THEN
    ALTER TABLE public.match_history 
    ADD CONSTRAINT match_history_opponent_id_fkey 
    FOREIGN KEY (opponent_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Add foreign key constraint for user_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'match_history_user_id_fkey' 
    AND table_name = 'match_history'
  ) THEN
    ALTER TABLE public.match_history 
    ADD CONSTRAINT match_history_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6. Create unique constraint for room_id + user_id
ALTER TABLE public.match_history 
DROP CONSTRAINT IF EXISTS unique_room_user_match_history;

ALTER TABLE public.match_history 
ADD CONSTRAINT unique_room_user_match_history 
UNIQUE (room_id, user_id);

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON public.match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_opponent_id ON public.match_history(opponent_id);
CREATE INDEX IF NOT EXISTS idx_match_history_room_id ON public.match_history(room_id);
CREATE INDEX IF NOT EXISTS idx_match_history_game_mode ON public.match_history(game_mode);
CREATE INDEX IF NOT EXISTS idx_match_history_match_format ON public.match_history(match_format);
CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON public.match_history(played_at DESC);

-- 8. Enable RLS
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- 9. Drop existing policies
DROP POLICY IF EXISTS "match_history_select_policy" ON public.match_history;
DROP POLICY IF EXISTS "match_history_insert_policy" ON public.match_history;
DROP POLICY IF EXISTS "match_history_update_policy" ON public.match_history;
DROP POLICY IF EXISTS "Users can view their own match history" ON public.match_history;
DROP POLICY IF EXISTS "System can insert match history" ON public.match_history;

-- 10. Create clean policies
CREATE POLICY "match_history_select_policy" ON public.match_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "match_history_insert_policy" ON public.match_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "match_history_update_policy" ON public.match_history
  FOR UPDATE USING (user_id = auth.uid());

-- 11. Grant permissions
GRANT ALL ON public.match_history TO authenticated;
GRANT ALL ON public.match_history TO anon;

-- 12. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_history;

-- 13. Create function to get opponent username safely
CREATE OR REPLACE FUNCTION get_opponent_username(opponent_uuid UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT;
BEGIN
  SELECT username INTO v_username 
  FROM public.profiles 
  WHERE user_id = opponent_uuid;
  
  RETURN COALESCE(v_username, 'Unknown');
END;
$$;

-- Verify
SELECT 'Match history structure fixed!' as status;
