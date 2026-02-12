-- ============================================================================
-- FIX BOTH QUICK MATCH AND DARTBOT STATS RECORDING
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix fn_update_player_match_stats (for quick matches)
-- This version ensures player_stats is updated correctly
-- ============================================================================

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

  -- Calculate stats from visits (including busts for accurate dart count)
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
  )
  ON CONFLICT ON CONSTRAINT unique_room_user_match_history 
  DO UPDATE SET
    result = EXCLUDED.result,
    legs_won = EXCLUDED.legs_won,
    legs_lost = EXCLUDED.legs_lost,
    three_dart_avg = EXCLUDED.three_dart_avg,
    first9_avg = EXCLUDED.first9_avg,
    highest_checkout = EXCLUDED.highest_checkout,
    checkout_percentage = EXCLUDED.checkout_percentage,
    darts_thrown = EXCLUDED.darts_thrown,
    total_score = EXCLUDED.total_score,
    total_checkouts = EXCLUDED.total_checkouts,
    checkout_attempts = EXCLUDED.checkout_attempts,
    visits_100_plus = EXCLUDED.visits_100_plus,
    visits_140_plus = EXCLUDED.visits_140_plus,
    visits_180 = EXCLUDED.visits_180,
    played_at = EXCLUDED.played_at;

  -- Update player_stats aggregate table
  INSERT INTO public.player_stats (
    user_id, total_matches, wins, losses, draws,
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- STEP 2: Fix update_player_stats_from_dartbot (helper function)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_from_dartbot(
  p_user_id uuid,
  p_game_mode integer,
  p_result text,
  p_darts_thrown integer,
  p_total_score integer,
  p_count_100_plus integer,
  p_count_140_plus integer,
  p_count_180 integer,
  p_checkouts_made integer,
  p_checkout_attempts integer,
  p_highest_checkout integer
)
RETURNS void AS $$
DECLARE
  v_current record;
  v_new_avg numeric;
  v_new_checkout_pct numeric;
BEGIN
  -- Try to get existing player stats
  SELECT * INTO v_current
  FROM player_stats
  WHERE user_id = p_user_id;
  
  -- If no stats exist, create a default row
  IF NOT FOUND THEN
    INSERT INTO player_stats (
      user_id, total_matches, wins, losses, draws,
      matches_301, matches_501,
      total_darts_thrown, total_score,
      overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180, updated_at
    ) VALUES (
      p_user_id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NOW()
    );
    SELECT * INTO v_current FROM player_stats WHERE user_id = p_user_id;
  END IF;
  
  -- Calculate new 3-dart average (cumulative)
  IF (COALESCE(v_current.total_darts_thrown, 0) + p_darts_thrown) > 0 THEN
    v_new_avg := ROUND(
      ((COALESCE(v_current.total_score, 0) + p_total_score)::numeric / 
       (COALESCE(v_current.total_darts_thrown, 0) + p_darts_thrown)) * 3, 
      2
    );
  ELSE
    v_new_avg := 0;
  END IF;
  
  -- Calculate new checkout percentage
  IF (COALESCE(v_current.checkout_attempts, 0) + p_checkout_attempts) > 0 THEN
    v_new_checkout_pct := ROUND(
      ((COALESCE(v_current.total_checkouts, 0) + p_checkouts_made)::numeric / 
       (COALESCE(v_current.checkout_attempts, 0) + p_checkout_attempts)) * 100,
      2
    );
  ELSE
    v_new_checkout_pct := 0;
  END IF;
  
  -- Update player_stats
  UPDATE player_stats
  SET 
    total_matches = COALESCE(total_matches, 0) + 1,
    wins = CASE WHEN p_result = 'win' THEN COALESCE(wins, 0) + 1 ELSE COALESCE(wins, 0) END,
    losses = CASE WHEN p_result = 'loss' THEN COALESCE(losses, 0) + 1 ELSE COALESCE(losses, 0) END,
    draws = CASE WHEN p_result = 'draw' THEN COALESCE(draws, 0) + 1 ELSE COALESCE(draws, 0) END,
    matches_301 = CASE WHEN p_game_mode = 301 THEN COALESCE(matches_301, 0) + 1 ELSE COALESCE(matches_301, 0) END,
    matches_501 = CASE WHEN p_game_mode = 501 THEN COALESCE(matches_501, 0) + 1 ELSE COALESCE(matches_501, 0) END,
    total_darts_thrown = COALESCE(total_darts_thrown, 0) + p_darts_thrown,
    total_score = COALESCE(total_score, 0) + p_total_score,
    overall_3dart_avg = v_new_avg,
    overall_first9_avg = v_new_avg,
    highest_checkout = GREATEST(COALESCE(highest_checkout, 0), p_highest_checkout),
    total_checkouts = COALESCE(total_checkouts, 0) + p_checkouts_made,
    checkout_attempts = COALESCE(checkout_attempts, 0) + p_checkout_attempts,
    checkout_percentage = v_new_checkout_pct,
    visits_100_plus = COALESCE(visits_100_plus, 0) + p_count_100_plus,
    visits_140_plus = COALESCE(visits_140_plus, 0) + p_count_140_plus,
    visits_180 = COALESCE(visits_180, 0) + p_count_180,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_player_stats_from_dartbot(
  uuid, integer, text, integer, integer, integer, integer, integer, integer, integer, integer
) TO authenticated;

-- ============================================================================
-- STEP 3: Backfill player_stats from all match_history
-- ============================================================================

-- First, ensure all users who have played matches have a player_stats record
INSERT INTO player_stats (
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
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
  total_matches = EXCLUDED.total_matches,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  draws = EXCLUDED.draws,
  matches_301 = EXCLUDED.matches_301,
  matches_501 = EXCLUDED.matches_501,
  total_darts_thrown = EXCLUDED.total_darts_thrown,
  total_score = EXCLUDED.total_score,
  overall_3dart_avg = EXCLUDED.overall_3dart_avg,
  overall_first9_avg = EXCLUDED.overall_first9_avg,
  highest_checkout = EXCLUDED.highest_checkout,
  total_checkouts = EXCLUDED.total_checkouts,
  checkout_attempts = EXCLUDED.checkout_attempts,
  checkout_percentage = EXCLUDED.checkout_percentage,
  visits_100_plus = EXCLUDED.visits_100_plus,
  visits_140_plus = EXCLUDED.visits_140_plus,
  visits_180 = EXCLUDED.visits_180,
  updated_at = NOW();

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'Quick match and dartbot stats recording fixed!' as status;
