-- ============================================
-- FINAL STATS SYSTEM SETUP
-- Consolidates all stats-related tables and functions
-- Run this to ensure everything works correctly
-- ============================================

-- ============================================
-- 1. ENSURE match_history TABLE HAS ALL NEEDED COLUMNS
-- ============================================

-- Add missing columns if they don't exist
ALTER TABLE public.match_history 
ADD COLUMN IF NOT EXISTS game_mode INTEGER DEFAULT 501,
ADD COLUMN IF NOT EXISTS match_format TEXT DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0;

-- Update any NULL values to defaults
UPDATE public.match_history SET game_mode = 501 WHERE game_mode IS NULL;
UPDATE public.match_history SET match_format = 'quick' WHERE match_format IS NULL;
UPDATE public.match_history SET total_checkouts = 0 WHERE total_checkouts IS NULL;
UPDATE public.match_history SET checkout_attempts = 0 WHERE checkout_attempts IS NULL;
UPDATE public.match_history SET total_score = 0 WHERE total_score IS NULL;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_match_history_user_game_mode 
ON public.match_history(user_id, game_mode);

CREATE INDEX IF NOT EXISTS idx_match_history_user_match_format 
ON public.match_history(user_id, match_format);

CREATE INDEX IF NOT EXISTS idx_match_history_combined_filters 
ON public.match_history(user_id, game_mode, match_format);

-- ============================================
-- 2. ENSURE player_stats TABLE HAS ALL COLUMNS
-- ============================================

ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0;

UPDATE public.player_stats SET total_score = 0 WHERE total_score IS NULL;
UPDATE public.player_stats SET total_checkouts = 0 WHERE total_checkouts IS NULL;
UPDATE public.player_stats SET checkout_attempts = 0 WHERE checkout_attempts IS NULL;

-- ============================================
-- 3. ENSURE player_quick_match_stats TABLE HAS ALL COLUMNS
-- ============================================

ALTER TABLE public.player_quick_match_stats
ADD COLUMN IF NOT EXISTS total_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0;

UPDATE public.player_quick_match_stats SET total_score = 0 WHERE total_score IS NULL;
UPDATE public.player_quick_match_stats SET total_checkouts = 0 WHERE total_checkouts IS NULL;
UPDATE public.player_quick_match_stats SET checkout_attempts = 0 WHERE checkout_attempts IS NULL;

-- ============================================
-- 4. CREATE/OR REPLACE THE STATS UPDATE FUNCTION
-- This is the main function that records stats after each match
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_update_player_match_stats(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_result TEXT, -- 'win', 'loss', 'draw'
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
  v_total_darts INTEGER := 0;
  v_total_score INTEGER := 0;
  v_three_dart_avg DECIMAL(5,2) := 0;
  v_first9_score INTEGER := 0;
  v_first9_darts INTEGER := 0;
  v_first9_avg DECIMAL(5,2) := 0;
  v_highest_checkout INTEGER := 0;
  v_checkout_attempts INTEGER := 0;
  v_successful_checkouts INTEGER := 0;
  v_checkout_percentage DECIMAL(5,2) := 0;
  v_visits_100_plus INTEGER := 0;
  v_visits_140_plus INTEGER := 0;
  v_visits_180 INTEGER := 0;
  v_visit_count INTEGER := 0;
  v_visit RECORD;
  v_match_format TEXT;
BEGIN
  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Determine match format from room
  -- match_type in match_rooms: 'quick', 'ranked', 'private', etc.
  v_match_format := COALESCE(v_room.match_type, v_room.source, 'quick');
  
  -- Get all visits for this player in this match
  FOR v_visit IN 
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_user_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_total_darts := v_total_darts + v_visit.darts_thrown;
    v_total_score := v_total_score + v_visit.score;
    
    -- First 9 darts calculation (first 3 visits max)
    IF v_visit_count <= 3 THEN
      v_first9_score := v_first9_score + v_visit.score;
      v_first9_darts := v_first9_darts + v_visit.darts_thrown;
    END IF;
    
    -- Check for checkout
    IF v_visit.is_checkout THEN
      v_successful_checkouts := v_successful_checkouts + 1;
      IF v_visit.score > v_highest_checkout THEN
        v_highest_checkout := v_visit.score;
      END IF;
    END IF;
    
    -- Checkout attempts (when remaining was <= 170)
    IF v_visit.remaining_before <= 170 AND v_visit.remaining_before > 0 THEN
      v_checkout_attempts := v_checkout_attempts + 1;
    END IF;
    
    -- Visit milestones
    IF v_visit.score >= 180 THEN
      v_visits_180 := v_visits_180 + 1;
      v_visits_140_plus := v_visits_140_plus + 1;
      v_visits_100_plus := v_visits_100_plus + 1;
    ELSIF v_visit.score >= 140 THEN
      v_visits_140_plus := v_visits_140_plus + 1;
      v_visits_100_plus := v_visits_100_plus + 1;
    ELSIF v_visit.score >= 100 THEN
      v_visits_100_plus := v_visits_100_plus + 1;
    END IF;
  END LOOP;
  
  -- Calculate averages
  IF v_total_darts > 0 THEN
    v_three_dart_avg := ROUND(((v_total_score::DECIMAL / v_total_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_first9_darts > 0 THEN
    v_first9_avg := ROUND(((v_first9_score::DECIMAL / v_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_checkout_attempts > 0 THEN
    v_checkout_percentage := ROUND(((v_successful_checkouts::DECIMAL / v_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;
  
  -- Insert into match_history WITH match_format
  INSERT INTO public.match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score,
    visits_100_plus, visits_140_plus, visits_180, played_at,
    total_checkouts, checkout_attempts
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_three_dart_avg, v_first9_avg, v_highest_checkout,
    v_checkout_percentage, v_total_darts, v_total_score,
    v_visits_100_plus, v_visits_140_plus, v_visits_180, now(),
    v_successful_checkouts, v_checkout_attempts
  );
  
  -- Update player_stats (OVERALL cumulative stats across ALL match types)
  INSERT INTO public.player_stats (
    user_id, total_matches, wins, losses, draws,
    overall_3dart_avg, overall_first9_avg, highest_checkout,
    total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180,
    total_darts_thrown, total_score, updated_at
  )
  SELECT 
    p_user_id, 1, 
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    v_three_dart_avg, v_first9_avg, v_highest_checkout,
    v_successful_checkouts, v_checkout_attempts, v_checkout_percentage,
    v_visits_100_plus, v_visits_140_plus, v_visits_180,
    v_total_darts, v_total_score, now()
  WHERE NOT EXISTS (SELECT 1 FROM public.player_stats WHERE user_id = p_user_id)
  
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = public.player_stats.total_matches + 1,
    wins = public.player_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    losses = public.player_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    draws = public.player_stats.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    -- Cumulative averages based on total darts
    overall_3dart_avg = CASE 
      WHEN (public.player_stats.total_darts_thrown + v_total_darts) > 0 
      THEN ROUND(((public.player_stats.total_score + v_total_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_total_darts)) * 3, 2)
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (public.player_stats.total_darts_thrown + v_total_darts) > 0 
      THEN ROUND(((public.player_stats.total_score + v_total_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_total_darts)) * 3, 2)
      ELSE 0 
    END,
    highest_checkout = GREATEST(public.player_stats.highest_checkout, v_highest_checkout),
    total_checkouts = public.player_stats.total_checkouts + v_successful_checkouts,
    checkout_attempts = public.player_stats.checkout_attempts + v_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (public.player_stats.checkout_attempts + v_checkout_attempts) > 0 
      THEN ROUND(((public.player_stats.total_checkouts + v_successful_checkouts)::DECIMAL / (public.player_stats.checkout_attempts + v_checkout_attempts)) * 100, 2)
      ELSE 0 
    END,
    visits_100_plus = public.player_stats.visits_100_plus + v_visits_100_plus,
    visits_140_plus = public.player_stats.visits_140_plus + v_visits_140_plus,
    visits_180 = public.player_stats.visits_180 + v_visits_180,
    total_darts_thrown = public.player_stats.total_darts_thrown + v_total_darts,
    total_score = public.player_stats.total_score + v_total_score,
    updated_at = now();
  
  -- Update quick match specific stats (only for quick matches)
  IF v_match_format = 'quick' THEN
    INSERT INTO public.player_quick_match_stats (
      user_id, total_matches, wins, losses, draws,
      overall_3dart_avg, overall_first9_avg, highest_checkout,
      total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180,
      total_darts_thrown, total_score, updated_at
    )
    SELECT 
      p_user_id, 1, 
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      v_three_dart_avg, v_first9_avg, v_highest_checkout,
      v_successful_checkouts, v_checkout_attempts, v_checkout_percentage,
      v_visits_100_plus, v_visits_140_plus, v_visits_180,
      v_total_darts, v_total_score, now()
    WHERE NOT EXISTS (SELECT 1 FROM public.player_quick_match_stats WHERE user_id = p_user_id)
    
    ON CONFLICT (user_id) DO UPDATE SET
      total_matches = public.player_quick_match_stats.total_matches + 1,
      wins = public.player_quick_match_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = public.player_quick_match_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = public.player_quick_match_stats.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      overall_3dart_avg = CASE 
        WHEN (public.player_quick_match_stats.total_darts_thrown + v_total_darts) > 0 
        THEN ROUND(((public.player_quick_match_stats.total_score + v_total_score)::DECIMAL / (public.player_quick_match_stats.total_darts_thrown + v_total_darts)) * 3, 2)
        ELSE 0 
      END,
      overall_first9_avg = CASE 
        WHEN (public.player_quick_match_stats.total_darts_thrown + v_total_darts) > 0 
        THEN ROUND(((public.player_quick_match_stats.total_score + v_total_score)::DECIMAL / (public.player_quick_match_stats.total_darts_thrown + v_total_darts)) * 3, 2)
        ELSE 0 
      END,
      highest_checkout = GREATEST(public.player_quick_match_stats.highest_checkout, v_highest_checkout),
      total_checkouts = public.player_quick_match_stats.total_checkouts + v_successful_checkouts,
      checkout_attempts = public.player_quick_match_stats.checkout_attempts + v_checkout_attempts,
      checkout_percentage = CASE 
        WHEN (public.player_quick_match_stats.checkout_attempts + v_checkout_attempts) > 0 
        THEN ROUND(((public.player_quick_match_stats.total_checkouts + v_successful_checkouts)::DECIMAL / (public.player_quick_match_stats.checkout_attempts + v_checkout_attempts)) * 100, 2)
        ELSE 0 
      END,
      visits_100_plus = public.player_quick_match_stats.visits_100_plus + v_visits_100_plus,
      visits_140_plus = public.player_quick_match_stats.visits_140_plus + v_visits_140_plus,
      visits_180 = public.player_quick_match_stats.visits_180 + v_visits_180,
      total_darts_thrown = public.player_quick_match_stats.total_darts_thrown + v_total_darts,
      total_score = public.player_quick_match_stats.total_score + v_total_score,
      updated_at = now();
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'three_dart_avg', v_three_dart_avg,
    'first9_avg', v_first9_avg,
    'highest_checkout', v_highest_checkout,
    'visits_100_plus', v_visits_100_plus,
    'visits_140_plus', v_visits_140_plus,
    'visits_180', v_visits_180,
    'total_darts', v_total_darts,
    'total_score', v_total_score,
    'match_format', v_match_format
  );
END;
$$;

-- ============================================
-- 5. CREATE FILTERED STATS FUNCTION
-- This function gets stats filtered by game mode AND match type
-- ============================================

DROP FUNCTION IF EXISTS public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT);

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
    COALESCE(COUNT(*)::INTEGER, 0) as total_matches,
    COALESCE(COUNT(CASE WHEN result = 'win' THEN 1 END)::INTEGER, 0) as wins,
    COALESCE(COUNT(CASE WHEN result = 'loss' THEN 1 END)::INTEGER, 0) as losses,
    COALESCE(COUNT(CASE WHEN result = 'draw' THEN 1 END)::INTEGER, 0) as draws,
    -- Weighted 3-dart average based on total darts
    COALESCE(
      CASE 
        WHEN SUM(darts_thrown) > 0 
        THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as overall_3dart_avg,
    -- Same calculation for first9 
    COALESCE(
      CASE 
        WHEN SUM(darts_thrown) > 0 
        THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as overall_first9_avg,
    COALESCE(MAX(highest_checkout)::INTEGER, 0) as highest_checkout,
    COALESCE(
      CASE 
        WHEN SUM(checkout_attempts) > 0 
        THEN ROUND(((SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as checkout_percentage,
    COALESCE(SUM(total_checkouts)::INTEGER, 0) as total_checkouts,
    COALESCE(SUM(checkout_attempts)::INTEGER, 0) as checkout_attempts,
    COALESCE(SUM(visits_100_plus)::INTEGER, 0) as visits_100_plus,
    COALESCE(SUM(visits_140_plus)::INTEGER, 0) as visits_140_plus,
    COALESCE(SUM(visits_180)::INTEGER, 0) as visits_180,
    COALESCE(SUM(darts_thrown)::INTEGER, 0) as total_darts_thrown,
    COALESCE(SUM(total_score)::INTEGER, 0) as total_score
  FROM public.match_history
  WHERE user_id = p_user_id
    AND (p_game_mode IS NULL OR game_mode = p_game_mode)
    AND (p_match_type IS NULL OR match_format = p_match_type);
END;
$$;

-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO anon;

-- ============================================
-- 7. VERIFY SETUP
-- ============================================

-- Check match_history columns
SELECT 'match_history columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'match_history' 
ORDER BY ordinal_position;

-- Check player_stats columns  
SELECT 'player_stats columns:' as info;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'player_stats'
ORDER BY ordinal_position;

-- ============================================
-- DONE!
-- ============================================
SELECT 'Stats system setup complete!' as status;
