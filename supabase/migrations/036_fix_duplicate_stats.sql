-- ============================================
-- FIX DUPLICATE STATS ISSUE
-- ============================================

-- 1. First, let's see if there are duplicates
SELECT 'Checking for duplicate stats...' as status;

-- Check match_history for duplicates (same room_id, same user)
SELECT room_id, user_id, COUNT(*) as count
FROM public.match_history
GROUP BY room_id, user_id
HAVING COUNT(*) > 1;

-- 2. Add unique constraint to prevent duplicates
-- This ensures only one record per room per user
ALTER TABLE public.match_history 
ADD CONSTRAINT unique_room_user UNIQUE (room_id, user_id);

-- 3. Update the stats function to handle duplicates gracefully
-- Use ON CONFLICT to update instead of insert duplicate

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
  
  -- Current match stats
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
  
  -- Check if already processed
  v_existing_record RECORD;
  v_already_processed BOOLEAN := false;
BEGIN
  -- Check if this match was already recorded for this user
  SELECT id, darts_thrown, total_score INTO v_existing_record
  FROM public.match_history
  WHERE room_id = p_room_id AND user_id = p_user_id
  LIMIT 1;
  
  IF v_existing_record.id IS NOT NULL THEN
    -- Already recorded this match - return early
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Match already recorded',
      'existing_id', v_existing_record.id
    );
  END IF;
  
  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Determine match format from room
  -- match_type is stored in match_rooms table
  v_match_format := COALESCE(v_room.match_type, v_room.source, 'quick');
  
  -- ========================================
  -- Calculate stats from THIS match
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
  -- Insert match history record (ONE TIME ONLY)
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
  )
  ON CONFLICT (room_id, user_id) DO NOTHING; -- Prevent duplicates
  
  -- Only update player_stats if we actually inserted
  IF FOUND THEN
    -- ========================================
    -- Update cumulative player_stats
    -- ========================================
    INSERT INTO public.player_stats (
      user_id, total_matches, wins, losses, draws,
      total_darts_thrown, total_score,
      overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180
    )
    SELECT 
      p_user_id, 1,
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      v_match_darts, v_match_score,
      v_match_avg, v_match_first9_avg,
      v_match_highest_checkout, v_match_checkouts, v_match_checkout_attempts, v_match_checkout_pct,
      v_match_100_plus, v_match_140_plus, v_match_180s
    WHERE NOT EXISTS (SELECT 1 FROM public.player_stats WHERE user_id = p_user_id)
    
    ON CONFLICT (user_id) DO UPDATE SET
      total_matches = public.player_stats.total_matches + 1,
      wins = public.player_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = public.player_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = public.player_stats.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      total_darts_thrown = public.player_stats.total_darts_thrown + v_match_darts,
      total_score = public.player_stats.total_score + v_match_score,
      overall_3dart_avg = CASE 
        WHEN (public.player_stats.total_darts_thrown + v_match_darts) > 0 
        THEN ROUND(((public.player_stats.total_score + v_match_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_match_darts)) * 3, 2)
        ELSE 0 
      END,
      overall_first9_avg = CASE 
        WHEN (public.player_stats.total_darts_thrown + v_match_darts) > 0 
        THEN ROUND(((public.player_stats.total_score + v_match_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_match_darts)) * 3, 2)
        ELSE 0 
      END,
      highest_checkout = GREATEST(public.player_stats.highest_checkout, v_match_highest_checkout),
      total_checkouts = public.player_stats.total_checkouts + v_match_checkouts,
      checkout_attempts = public.player_stats.checkout_attempts + v_match_checkout_attempts,
      checkout_percentage = CASE 
        WHEN (public.player_stats.checkout_attempts + v_match_checkout_attempts) > 0 
        THEN ROUND(((public.player_stats.total_checkouts + v_match_checkouts)::DECIMAL / (public.player_stats.checkout_attempts + v_match_checkout_attempts)) * 100, 2)
        ELSE 0 
      END,
      visits_100_plus = public.player_stats.visits_100_plus + v_match_100_plus,
      visits_140_plus = public.player_stats.visits_140_plus + v_match_140_plus,
      visits_180 = public.player_stats.visits_180 + v_match_180s,
      updated_at = now();
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Stats recorded',
    'match_avg', v_match_avg,
    'game_mode', p_game_mode,
    'match_format', v_match_format
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO anon;

-- ============================================
-- CREATE FUNCTION TO DELETE DUPLICATE STATS
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_duplicate_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete duplicate match_history records, keeping only the first one
  DELETE FROM public.match_history
  WHERE id IN (
    SELECT id FROM (
      SELECT id, room_id, user_id,
        ROW_NUMBER() OVER (PARTITION BY room_id, user_id ORDER BY created_at) as rn
      FROM public.match_history
    ) t
    WHERE rn > 1
  );
  
  -- Recalculate player_stats from match_history
  -- This ensures cumulative stats are correct
  TRUNCATE public.player_stats;
  
  -- Re-insert calculated stats
  INSERT INTO public.player_stats (
    user_id, total_matches, wins, losses, draws,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180
  )
  SELECT 
    user_id,
    COUNT(*) as total_matches,
    COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN result = 'draw' THEN 1 END) as draws,
    SUM(darts_thrown) as total_darts_thrown,
    SUM(total_score) as total_score,
    CASE WHEN SUM(darts_thrown) > 0 
      THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3), 2)
      ELSE 0 
    END as overall_3dart_avg,
    CASE WHEN SUM(darts_thrown) > 0 
      THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3), 2)
      ELSE 0 
    END as overall_first9_avg,
    MAX(highest_checkout) as highest_checkout,
    SUM(total_checkouts) as total_checkouts,
    SUM(checkout_attempts) as checkout_attempts,
    CASE WHEN SUM(checkout_attempts) > 0 
      THEN ROUND(((SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100), 2)
      ELSE 0 
    END as checkout_percentage,
    SUM(visits_100_plus) as visits_100_plus,
    SUM(visits_140_plus) as visits_140_plus,
    SUM(visits_180) as visits_180
  FROM public.match_history
  GROUP BY user_id;
  
END;
$$;

-- Run cleanup
SELECT cleanup_duplicate_stats();

-- ============================================
-- CREATE VIEW FOR EASY FILTERING
-- ============================================

CREATE OR REPLACE VIEW public.v_player_stats_by_filter AS
SELECT 
  user_id,
  game_mode,
  match_format,
  COUNT(*) as total_matches,
  COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
  COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
  COUNT(CASE WHEN result = 'draw' THEN 1 END) as draws,
  ROUND(((SUM(total_score)::DECIMAL / NULLIF(SUM(darts_thrown), 0)) * 3), 2) as avg_3dart,
  MAX(highest_checkout) as highest_checkout,
  SUM(total_checkouts) as total_checkouts,
  SUM(checkout_attempts) as checkout_attempts,
  CASE WHEN SUM(checkout_attempts) > 0 
    THEN ROUND(((SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100), 2)
    ELSE 0 
  END as checkout_pct,
  SUM(visits_100_plus) as visits_100_plus,
  SUM(visits_140_plus) as visits_140_plus,
  SUM(visits_180) as visits_180,
  SUM(darts_thrown) as total_darts,
  SUM(total_score) as total_score
FROM public.match_history
GROUP BY user_id, game_mode, match_format;

GRANT SELECT ON public.v_player_stats_by_filter TO authenticated;
GRANT SELECT ON public.v_player_stats_by_filter TO anon;

-- ============================================
-- DONE!
-- ============================================
SELECT 'Duplicate stats fixed! Constraint added to prevent future duplicates.' as status;
