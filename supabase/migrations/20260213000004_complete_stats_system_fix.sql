-- ============================================================================
-- COMPLETE STATS SYSTEM FIX
-- Fixes quick match, dartbot stats, and ensures proper player_stats updates
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix fn_update_player_match_stats for quick matches
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER);

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
BEGIN
  -- Check if already recorded
  IF EXISTS (
    SELECT 1 FROM public.match_history
    WHERE room_id = p_room_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Match already recorded',
      'duplicate', true
    );
  END IF;

  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  v_match_format := COALESCE(v_room.match_type, 'quick');

  -- Calculate stats from visits (count ALL darts for accurate totals)
  FOR v_visit IN 
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id 
      AND player_id = p_user_id
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_match_darts := v_match_darts + COALESCE(v_visit.darts_thrown, 3);
    
    -- Only count score for non-bust visits
    IF NOT v_visit.is_bust THEN
      v_match_score := v_match_score + v_visit.score;
      
      IF v_visit_count <= 3 THEN
        v_match_first9_score := v_match_first9_score + v_visit.score;
        v_match_first9_darts := v_match_first9_darts + COALESCE(v_visit.darts_thrown, 3);
      END IF;
      
      IF v_visit.is_checkout THEN
        v_match_checkouts := v_match_checkouts + 1;
        IF v_visit.score > v_match_highest_checkout THEN
          v_match_highest_checkout := v_visit.score;
        END IF;
      END IF;
      
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
    END IF;
    
    -- Count checkout attempts (including on bust visits)
    IF v_visit.remaining_before <= 170 AND v_visit.remaining_before > 0 THEN
      v_match_checkout_attempts := v_match_checkout_attempts + 1;
    END IF;
  END LOOP;

  IF v_match_darts > 0 THEN
    v_match_avg := ROUND(((v_match_score::DECIMAL / v_match_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_first9_darts > 0 THEN
    v_match_first9_avg := ROUND(((v_match_first9_score::DECIMAL / v_match_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_checkout_attempts > 0 THEN
    v_match_checkout_pct := ROUND(((v_match_checkouts::DECIMAL / v_match_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;

  -- Insert into match_history
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

  -- UPDATE PLAYER_STATS AGGREGATE TABLE
  INSERT INTO public.player_stats (
    user_id, total_matches, wins, losses, draws,
    matches_301, matches_501,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    p_user_id, 1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
    v_match_darts, v_match_score,
    v_match_avg, v_match_first9_avg,
    v_match_highest_checkout, v_match_checkouts, v_match_checkout_attempts, v_match_checkout_pct,
    v_match_100_plus, v_match_140_plus, v_match_180s, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = public.player_stats.total_matches + 1,
    wins = public.player_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    losses = public.player_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    draws = public.player_stats.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    matches_301 = public.player_stats.matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    matches_501 = public.player_stats.matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
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
  
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Stats recorded',
    'match_avg', v_match_avg,
    'first9_avg', v_match_first9_avg,
    'game_mode', p_game_mode,
    'match_format', v_match_format
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- STEP 2: Fix record_dartbot_match_completion
-- ============================================================================

-- Drop all versions first
DO $$
DECLARE
  func_record TEXT;
BEGIN
  FOR func_record IN 
    SELECT oid::regprocedure::text 
    FROM pg_proc 
    WHERE proname = 'record_dartbot_match_completion'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode integer,
  p_match_format text,
  p_dartbot_level integer,
  p_player_legs integer,
  p_dartbot_legs integer,
  p_winner text,
  p_started_at timestamp with time zone,
  p_completed_at timestamp with time zone,
  p_three_dart_avg numeric,
  p_first9_avg numeric,
  p_highest_checkout integer,
  p_checkout_percentage numeric,
  p_darts_thrown integer,
  p_total_score integer,
  p_total_checkouts integer,
  p_checkout_attempts integer,
  p_visits_100_plus integer,
  p_visits_140_plus integer,
  p_visits_180 integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_room_id uuid;
  v_result text;
  v_checkout_pct_calc numeric;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_result := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;
  
  IF p_checkout_percentage > 0 THEN
    v_checkout_pct_calc := p_checkout_percentage;
  ELSIF p_checkout_attempts > 0 THEN
    v_checkout_pct_calc := ROUND((p_total_checkouts::numeric / p_checkout_attempts) * 100, 2);
  ELSE
    v_checkout_pct_calc := 0;
  END IF;

  v_room_id := gen_random_uuid();

  -- Insert into match_history
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, bot_level, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    v_room_id, v_user_id, NULL, p_game_mode, 'dartbot', p_dartbot_level, v_result,
    p_player_legs, p_dartbot_legs, p_three_dart_avg, p_first9_avg, p_highest_checkout,
    v_checkout_pct_calc, p_darts_thrown, p_total_score, p_total_checkouts, p_checkout_attempts,
    p_visits_100_plus, p_visits_140_plus, p_visits_180, p_completed_at
  );

  -- UPDATE PLAYER_STATS
  INSERT INTO player_stats (
    user_id, total_matches, wins, losses, draws,
    matches_301, matches_501,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    v_user_id, 1,
    CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    0,
    CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
    p_darts_thrown, p_total_score,
    p_three_dart_avg, p_first9_avg,
    p_highest_checkout, p_total_checkouts, p_checkout_attempts, v_checkout_pct_calc,
    p_visits_100_plus, p_visits_140_plus, p_visits_180, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_301 = player_stats.matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    matches_501 = player_stats.matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + p_darts_thrown,
    total_score = player_stats.total_score + p_total_score,
    overall_3dart_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + p_total_score)::DECIMAL / (player_stats.total_darts_thrown + p_darts_thrown)) * 3, 2)
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + p_total_score)::DECIMAL / (player_stats.total_darts_thrown + p_darts_thrown)) * 3, 2)
      ELSE 0 
    END,
    highest_checkout = GREATEST(player_stats.highest_checkout, p_highest_checkout),
    total_checkouts = player_stats.total_checkouts + p_total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + p_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (player_stats.checkout_attempts + p_checkout_attempts) > 0 
      THEN ROUND(((player_stats.total_checkouts + p_total_checkouts)::DECIMAL / (player_stats.checkout_attempts + p_checkout_attempts)) * 100, 2)
      ELSE 0 
    END,
    visits_100_plus = player_stats.visits_100_plus + p_visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + p_visits_140_plus,
    visits_180 = player_stats.visits_180 + p_visits_180,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Dartbot match recorded'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  integer, text, integer, integer, integer, text, timestamp with time zone, 
  timestamp with time zone, numeric, numeric, integer, numeric, integer, 
  integer, integer, integer, integer, integer
) TO authenticated;

-- ============================================================================
-- STEP 3: Backfill player_stats from ALL match_history
-- ============================================================================

-- Clear and rebuild player_stats from scratch
TRUNCATE public.player_stats;

INSERT INTO public.player_stats (
  user_id, total_matches, wins, losses, draws,
  matches_301, matches_501,
  total_darts_thrown, total_score,
  overall_3dart_avg, overall_first9_avg,
  highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
  visits_100_plus, visits_140_plus, visits_180, updated_at
)
SELECT 
  user_id,
  COUNT(*)::INTEGER as total_matches,
  COUNT(*) FILTER (WHERE result = 'win')::INTEGER as wins,
  COUNT(*) FILTER (WHERE result = 'loss')::INTEGER as losses,
  COUNT(*) FILTER (WHERE result = 'draw')::INTEGER as draws,
  COUNT(*) FILTER (WHERE game_mode = 301)::INTEGER as matches_301,
  COUNT(*) FILTER (WHERE game_mode = 501)::INTEGER as matches_501,
  SUM(darts_thrown)::INTEGER as total_darts_thrown,
  SUM(total_score)::INTEGER as total_score,
  ROUND(
    CASE WHEN SUM(darts_thrown) > 0 
    THEN (SUM(total_score)::numeric / SUM(darts_thrown)) * 3
    ELSE 0 END, 2
  ) as overall_3dart_avg,
  ROUND(
    CASE WHEN SUM(darts_thrown) > 0 
    THEN (SUM(total_score)::numeric / SUM(darts_thrown)) * 3
    ELSE 0 END, 2
  ) as overall_first9_avg,
  MAX(highest_checkout) as highest_checkout,
  SUM(total_checkouts)::INTEGER as total_checkouts,
  SUM(checkout_attempts)::INTEGER as checkout_attempts,
  ROUND(
    CASE WHEN SUM(checkout_attempts) > 0 
    THEN (SUM(total_checkouts)::numeric / SUM(checkout_attempts)) * 100
    ELSE 0 END, 2
  ) as checkout_percentage,
  SUM(visits_100_plus)::INTEGER as visits_100_plus,
  SUM(visits_140_plus)::INTEGER as visits_140_plus,
  SUM(visits_180)::INTEGER as visits_180,
  NOW() as updated_at
FROM match_history
GROUP BY user_id;

-- ============================================================================
-- STEP 4: Fix RLS policies
-- ============================================================================

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own match history" ON public.match_history;
DROP POLICY IF EXISTS "System can insert match history" ON public.match_history;
DROP POLICY IF EXISTS "Users can view their own stats" ON public.player_stats;
DROP POLICY IF EXISTS "Users can update their own stats" ON public.player_stats;

-- Create policies
CREATE POLICY "Users can view their own match history" 
  ON public.match_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert match history" 
  ON public.match_history FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Users can view their own stats" 
  ON public.player_stats FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "System can update stats" 
  ON public.player_stats FOR UPDATE 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "System can insert stats"
  ON public.player_stats FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'Complete stats system fix applied!' as status;
