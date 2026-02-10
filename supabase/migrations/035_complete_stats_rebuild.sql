-- ============================================
-- COMPLETE STATS SYSTEM REBUILD
-- Based on DartCounter-style stats tracking
-- All games accumulate into player_stats table
-- ============================================

-- 1. DROP AND RECREATE player_stats TABLE WITH PROPER STRUCTURE
DROP TABLE IF EXISTS public.player_stats CASCADE;

CREATE TABLE public.player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Match counts
  total_matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  
  -- Game mode specific counts
  matches_301 INTEGER NOT NULL DEFAULT 0,
  matches_501 INTEGER NOT NULL DEFAULT 0,
  
  -- Cumulative stats (these accumulate across ALL games)
  total_darts_thrown INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  
  -- Averages (calculated from cumulative totals)
  overall_3dart_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
  overall_first9_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
  
  -- Checkouts
  highest_checkout INTEGER NOT NULL DEFAULT 0,
  total_checkouts INTEGER NOT NULL DEFAULT 0,
  checkout_attempts INTEGER NOT NULL DEFAULT 0,
  checkout_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  
  -- Visit milestones (cumulative)
  visits_100_plus INTEGER NOT NULL DEFAULT 0,
  visits_140_plus INTEGER NOT NULL DEFAULT 0,
  visits_180 INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure one row per user
  CONSTRAINT player_stats_user_id_key UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own stats" 
  ON public.player_stats FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats" 
  ON public.player_stats FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert stats" 
  ON public.player_stats FOR INSERT 
  WITH CHECK (true);

-- ============================================
-- 2. DROP AND RECREATE match_history TABLE
-- This stores EVERY match played (one row per player per match)
-- ============================================

DROP TABLE IF EXISTS public.match_history CASCADE;

CREATE TABLE public.match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES auth.users(id),
  
  -- Game settings
  game_mode INTEGER NOT NULL DEFAULT 501, -- 301, 501, etc.
  match_format TEXT NOT NULL DEFAULT 'quick', -- quick, ranked, private, local
  
  -- Result
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  legs_won INTEGER NOT NULL DEFAULT 0,
  legs_lost INTEGER NOT NULL DEFAULT 0,
  
  -- Stats for THIS match only
  three_dart_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
  first9_avg DECIMAL(5,2) NOT NULL DEFAULT 0,
  highest_checkout INTEGER NOT NULL DEFAULT 0,
  checkout_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  darts_thrown INTEGER NOT NULL DEFAULT 0,
  total_score INTEGER NOT NULL DEFAULT 0,
  total_checkouts INTEGER NOT NULL DEFAULT 0,
  checkout_attempts INTEGER NOT NULL DEFAULT 0,
  visits_100_plus INTEGER NOT NULL DEFAULT 0,
  visits_140_plus INTEGER NOT NULL DEFAULT 0,
  visits_180 INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  played_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own match history" 
  ON public.match_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert match history" 
  ON public.match_history FOR INSERT 
  WITH CHECK (true);

-- Indexes for fast filtering
CREATE INDEX idx_match_history_user_id ON public.match_history(user_id);
CREATE INDEX idx_match_history_user_game_mode ON public.match_history(user_id, game_mode);
CREATE INDEX idx_match_history_user_match_format ON public.match_history(user_id, match_format);
CREATE INDEX idx_match_history_played_at ON public.match_history(played_at DESC);

-- ============================================
-- 3. CREATE THE MAIN STATS UPDATE FUNCTION
-- This properly accumulates stats across ALL games
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_update_player_match_stats(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_result TEXT,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_game_mode INTEGER DEFAULT 501
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_match_format TEXT;
  
  -- Current match stats (calculated from visits)
  v_match_darts INTEGER := 0;
  v_match_score INTEGER := 0;
  v_match_avg DECIMAL(5,2) := 0;
  v_match_first9_avg DECIMAL(5,2) := 0;
  v_match_highest_checkout INTEGER := 0;
  v_match_checkouts INTEGER := 0;
  v_match_checkout_attempts INTEGER := 0;
  v_match_checkout_pct DECIMAL(5,2) := 0;
  v_match_100_plus INTEGER := 0;
  v_match_140_plus INTEGER := 0;
  v_match_180s INTEGER := 0;
  v_match_first9_score INTEGER := 0;
  v_match_first9_darts INTEGER := 0;
  v_visit_count INTEGER := 0;
  v_visit RECORD;
  
  -- Existing player stats
  v_existing RECORD;
  
  -- New cumulative totals
  v_new_total_matches INTEGER;
  v_new_total_darts INTEGER;
  v_new_total_score INTEGER;
  v_new_overall_avg DECIMAL(5,2);
  v_new_total_checkouts INTEGER;
  v_new_checkout_attempts INTEGER;
  v_new_checkout_pct DECIMAL(5,2);
  v_new_highest_checkout INTEGER;
BEGIN
  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Determine match format
  v_match_format := COALESCE(v_room.match_type, v_room.source, 'quick');
  
  -- ========================================
  -- STEP 1: Calculate stats from THIS match
  -- ========================================
  FOR v_visit IN 
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_user_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_match_darts := v_match_darts + v_visit.darts_thrown;
    v_match_score := v_match_score + v_visit.score;
    
    -- First 9 calculation
    IF v_visit_count <= 3 THEN
      v_match_first9_score := v_match_first9_score + v_visit.score;
      v_match_first9_darts := v_match_first9_darts + v_visit.darts_thrown;
    END IF;
    
    -- Checkouts
    IF v_visit.is_checkout THEN
      v_match_checkouts := v_match_checkouts + 1;
      IF v_visit.score > v_match_highest_checkout THEN
        v_match_highest_checkout := v_visit.score;
      END IF;
    END IF;
    
    -- Checkout attempts
    IF v_visit.remaining_before <= 170 AND v_visit.remaining_before > 0 THEN
      v_match_checkout_attempts := v_match_checkout_attempts + 1;
    END IF;
    
    -- Visit milestones
    IF v_visit.score >= 180 THEN
      v_match_180s := v_match_180s + 1;
      v_match_140_plus := v_match_140_plus + 1;
      v_match_100_plus := v_match_100_plus + 1;
    ELSIF v_visit.score >= 140 THEN
      v_match_140_plus := v_match_140_plus + 1;
      v_match_100_plus := v_match_100_plus + 1;
    ELSIF v_visit.score >= 100 THEN
      v_match_100_plus := v_match_100_plus + 1;
    END IF;
  END LOOP;
  
  -- Calculate averages for THIS match
  IF v_match_darts > 0 THEN
    v_match_avg := ROUND(((v_match_score::DECIMAL / v_match_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_first9_darts > 0 THEN
    v_match_first9_avg := ROUND(((v_match_first9_score::DECIMAL / v_match_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_checkout_attempts > 0 THEN
    v_match_checkout_pct := ROUND(((v_match_checkouts::DECIMAL / v_match_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;
  
  -- ========================================
  -- STEP 2: Insert match history record
  -- ========================================
  INSERT INTO public.match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
    v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
    v_match_100_plus, v_match_140_plus, v_match_180s, now()
  );
  
  -- ========================================
  -- STEP 3: Get existing player stats
  -- ========================================
  SELECT * INTO v_existing FROM public.player_stats WHERE user_id = p_user_id;
  
  IF v_existing IS NULL THEN
    -- First game - insert new record
    INSERT INTO public.player_stats (
      user_id, total_matches, wins, losses, draws,
      matches_301, matches_501,
      total_darts_thrown, total_score,
      overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180
    ) VALUES (
      p_user_id, 1,
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      v_match_darts, v_match_score,
      v_match_avg, v_match_first9_avg,
      v_match_highest_checkout, v_match_checkouts, v_match_checkout_attempts, v_match_checkout_pct,
      v_match_100_plus, v_match_140_plus, v_match_180s
    );
    
  ELSE
    -- Update existing stats by ADDING this match's stats
    v_new_total_matches := v_existing.total_matches + 1;
    v_new_total_darts := v_existing.total_darts_thrown + v_match_darts;
    v_new_total_score := v_existing.total_score + v_match_score;
    v_new_total_checkouts := v_existing.total_checkouts + v_match_checkouts;
    v_new_checkout_attempts := v_existing.checkout_attempts + v_match_checkout_attempts;
    v_new_highest_checkout := GREATEST(v_existing.highest_checkout, v_match_highest_checkout);
    
    -- Calculate new cumulative averages
    IF v_new_total_darts > 0 THEN
      v_new_overall_avg := ROUND(((v_new_total_score::DECIMAL / v_new_total_darts) * 3)::DECIMAL, 2);
    ELSE
      v_new_overall_avg := 0;
    END IF;
    
    IF v_new_checkout_attempts > 0 THEN
      v_new_checkout_pct := ROUND(((v_new_total_checkouts::DECIMAL / v_new_checkout_attempts) * 100)::DECIMAL, 2);
    ELSE
      v_new_checkout_pct := 0;
    END IF;
    
    UPDATE public.player_stats SET
      total_matches = v_new_total_matches,
      wins = v_existing.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = v_existing.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = v_existing.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      matches_301 = v_existing.matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = v_existing.matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = v_new_total_darts,
      total_score = v_new_total_score,
      overall_3dart_avg = v_new_overall_avg,
      overall_first9_avg = v_new_overall_avg, -- Using same calc
      highest_checkout = v_new_highest_checkout,
      total_checkouts = v_new_total_checkouts,
      checkout_attempts = v_new_checkout_attempts,
      checkout_percentage = v_new_checkout_pct,
      visits_100_plus = v_existing.visits_100_plus + v_match_100_plus,
      visits_140_plus = v_existing.visits_140_plus + v_match_140_plus,
      visits_180 = v_existing.visits_180 + v_match_180s,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'match_avg', v_match_avg,
    'cumulative_avg', v_new_overall_avg,
    'total_matches', COALESCE(v_new_total_matches, 1),
    'total_darts', COALESCE(v_new_total_darts, v_match_darts)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO anon;

-- ============================================
-- 4. CREATE FILTERED STATS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_get_filtered_player_stats(
  p_user_id UUID,
  p_game_mode INTEGER DEFAULT NULL,
  p_match_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_matches INTEGER,
  wins INTEGER,
  losses INTEGER,
  draws INTEGER,
  overall_3dart_avg DECIMAL(5,2),
  overall_first9_avg DECIMAL(5,2),
  highest_checkout INTEGER,
  checkout_percentage DECIMAL(5,2),
  total_checkouts INTEGER,
  checkout_attempts INTEGER,
  visits_100_plus INTEGER,
  visits_140_plus INTEGER,
  visits_180 INTEGER,
  total_darts_thrown INTEGER,
  total_score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(COUNT(*)::INTEGER, 0),
    COALESCE(COUNT(CASE WHEN result = 'win' THEN 1 END)::INTEGER, 0),
    COALESCE(COUNT(CASE WHEN result = 'loss' THEN 1 END)::INTEGER, 0),
    COALESCE(COUNT(CASE WHEN result = 'draw' THEN 1 END)::INTEGER, 0),
    COALESCE(
      CASE WHEN SUM(darts_thrown) > 0 
      THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
      ELSE 0::DECIMAL END, 0::DECIMAL
    ),
    COALESCE(
      CASE WHEN SUM(darts_thrown) > 0 
      THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
      ELSE 0::DECIMAL END, 0::DECIMAL
    ),
    COALESCE(MAX(highest_checkout)::INTEGER, 0),
    COALESCE(
      CASE WHEN SUM(checkout_attempts) > 0 
      THEN ROUND(((SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100)::DECIMAL, 2)
      ELSE 0::DECIMAL END, 0::DECIMAL
    ),
    COALESCE(SUM(total_checkouts)::INTEGER, 0),
    COALESCE(SUM(checkout_attempts)::INTEGER, 0),
    COALESCE(SUM(visits_100_plus)::INTEGER, 0),
    COALESCE(SUM(visits_140_plus)::INTEGER, 0),
    COALESCE(SUM(visits_180)::INTEGER, 0),
    COALESCE(SUM(darts_thrown)::INTEGER, 0),
    COALESCE(SUM(total_score)::INTEGER, 0)
  FROM public.match_history
  WHERE user_id = p_user_id
    AND (p_game_mode IS NULL OR game_mode = p_game_mode)
    AND (p_match_type IS NULL OR match_format = p_match_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO anon;

-- ============================================
-- 5. ENABLE REALTIME FOR STATS TABLES
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.player_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_history;

-- ============================================
-- 6. DONE!
-- ============================================
SELECT 'Stats system completely rebuilt!' as status;
