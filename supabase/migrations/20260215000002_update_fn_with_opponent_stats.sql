-- ============================================================================
-- UPDATE: fn_update_player_match_stats to include opponent stats
-- ============================================================================
-- This ensures opponent stats are stored directly in the user's match_history row
-- so the "Last 3 Games" section can display both player and opponent stats

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
  
  -- Current match stats for USER (calculated from visits)
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
  
  -- OPPONENT stats (calculated from visits)
  v_opp_darts INTEGER := 0;
  v_opp_score INTEGER := 0;
  v_opp_avg DECIMAL(5,2) := 0;
  v_opp_first9_avg DECIMAL(5,2) := 0;
  v_opp_highest_checkout INTEGER := 0;
  v_opp_checkouts INTEGER := 0;
  v_opp_checkout_attempts INTEGER := 0;
  v_opp_checkout_pct DECIMAL(5,2) := 0;
  v_opp_100_plus INTEGER := 0;
  v_opp_140_plus INTEGER := 0;
  v_opp_180s INTEGER := 0;
  v_opp_first9_score INTEGER := 0;
  v_opp_first9_darts INTEGER := 0;
  v_opp_visit_count INTEGER := 0;
  v_opp_visit RECORD;
  
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
  -- STEP 1: Calculate USER stats from visits
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
  
  -- Calculate USER averages
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
  -- STEP 2: Calculate OPPONENT stats from visits
  -- ========================================
  FOR v_opp_visit IN 
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_opponent_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_opp_visit_count := v_opp_visit_count + 1;
    v_opp_darts := v_opp_darts + v_opp_visit.darts_thrown;
    v_opp_score := v_opp_score + v_opp_visit.score;
    
    -- First 9 calculation
    IF v_opp_visit_count <= 3 THEN
      v_opp_first9_score := v_opp_first9_score + v_opp_visit.score;
      v_opp_first9_darts := v_opp_first9_darts + v_opp_visit.darts_thrown;
    END IF;
    
    -- Checkouts
    IF v_opp_visit.is_checkout THEN
      v_opp_checkouts := v_opp_checkouts + 1;
      IF v_opp_visit.score > v_opp_highest_checkout THEN
        v_opp_highest_checkout := v_opp_visit.score;
      END IF;
    END IF;
    
    -- Checkout attempts
    IF v_opp_visit.remaining_before <= 170 AND v_opp_visit.remaining_before > 0 THEN
      v_opp_checkout_attempts := v_opp_checkout_attempts + 1;
    END IF;
    
    -- Visit milestones
    IF v_opp_visit.score >= 180 THEN
      v_opp_180s := v_opp_180s + 1;
      v_opp_140_plus := v_opp_140_plus + 1;
      v_opp_100_plus := v_opp_100_plus + 1;
    ELSIF v_opp_visit.score >= 140 THEN
      v_opp_140_plus := v_opp_140_plus + 1;
      v_opp_100_plus := v_opp_100_plus + 1;
    ELSIF v_opp_visit.score >= 100 THEN
      v_opp_100_plus := v_opp_100_plus + 1;
    END IF;
  END LOOP;
  
  -- Calculate OPPONENT averages
  IF v_opp_darts > 0 THEN
    v_opp_avg := ROUND(((v_opp_score::DECIMAL / v_opp_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_opp_first9_darts > 0 THEN
    v_opp_first9_avg := ROUND(((v_opp_first9_score::DECIMAL / v_opp_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_opp_checkout_attempts > 0 THEN
    v_opp_checkout_pct := ROUND(((v_opp_checkouts::DECIMAL / v_opp_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;
  
  -- ========================================
  -- STEP 3: Insert match history record with OPPONENT stats
  -- ========================================
  INSERT INTO public.match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at,
    -- Opponent stats
    opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
    opponent_checkout_percentage, opponent_darts_thrown,
    opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
    v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
    v_match_100_plus, v_match_140_plus, v_match_180s, now(),
    -- Opponent stats
    v_opp_avg, v_opp_first9_avg, v_opp_highest_checkout,
    v_opp_checkout_pct, v_opp_darts,
    v_opp_100_plus, v_opp_140_plus, v_opp_180s
  )
  ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = p_result,
    legs_won = p_legs_won,
    legs_lost = p_legs_lost,
    three_dart_avg = v_match_avg,
    first9_avg = v_match_first9_avg,
    highest_checkout = v_match_highest_checkout,
    checkout_percentage = v_match_checkout_pct,
    darts_thrown = v_match_darts,
    total_score = v_match_score,
    total_checkouts = v_match_checkouts,
    checkout_attempts = v_match_checkout_attempts,
    visits_100_plus = v_match_100_plus,
    visits_140_plus = v_match_140_plus,
    visits_180 = v_match_180s,
    played_at = now(),
    -- Opponent stats
    opponent_three_dart_avg = v_opp_avg,
    opponent_first9_avg = v_opp_first9_avg,
    opponent_highest_checkout = v_opp_highest_checkout,
    opponent_checkout_percentage = v_opp_checkout_pct,
    opponent_darts_thrown = v_opp_darts,
    opponent_visits_100_plus = v_opp_100_plus,
    opponent_visits_140_plus = v_opp_140_plus,
    opponent_visits_180 = v_opp_180s;
  
  -- ========================================
  -- STEP 4: Get existing player stats
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
    -- Update existing stats
    v_new_total_matches := v_existing.total_matches + 1;
    v_new_total_darts := v_existing.total_darts_thrown + v_match_darts;
    v_new_total_score := v_existing.total_score + v_match_score;
    v_new_total_checkouts := v_existing.total_checkouts + v_match_checkouts;
    v_new_checkout_attempts := v_existing.checkout_attempts + v_match_checkout_attempts;
    v_new_highest_checkout := GREATEST(v_existing.highest_checkout, v_match_highest_checkout);
    
    -- Calculate new cumulative averages
    IF v_new_total_darts > 0 THEN
      v_new_overall_avg := ROUND(((v_new_total_score::DECIMAL / v_new_total_darts) * 3)::DECIMAL, 2);
    END IF;
    
    IF v_new_checkout_attempts > 0 THEN
      v_new_checkout_pct := ROUND(((v_new_total_checkouts::DECIMAL / v_new_checkout_attempts) * 100)::DECIMAL, 2);
    END IF;
    
    -- Update player_stats
    UPDATE public.player_stats SET
      total_matches = v_new_total_matches,
      wins = wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = v_new_total_darts,
      total_score = v_new_total_score,
      overall_3dart_avg = v_new_overall_avg,
      highest_checkout = v_new_highest_checkout,
      total_checkouts = v_new_total_checkouts,
      checkout_attempts = v_new_checkout_attempts,
      checkout_percentage = v_new_checkout_pct,
      visits_100_plus = visits_100_plus + v_match_100_plus,
      visits_140_plus = visits_140_plus + v_match_140_plus,
      visits_180 = visits_180 + v_match_180s,
      last_played_at = now()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'match_avg', v_match_avg,
    'opponent_avg', v_opp_avg
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- Also update the save_match_stats function for backward compatibility
CREATE OR REPLACE FUNCTION save_match_stats(
  p_room_id UUID,
  p_winner_id UUID,
  p_loser_id UUID,
  p_winner_legs INTEGER,
  p_loser_legs INTEGER,
  p_game_mode INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Save winner stats (includes opponent/loser stats)
  PERFORM fn_update_player_match_stats(
    p_room_id, p_winner_id, p_loser_id, 'win',
    p_winner_legs, p_loser_legs, p_game_mode
  );
  
  -- Save loser stats (includes opponent/winner stats)
  PERFORM fn_update_player_match_stats(
    p_room_id, p_loser_id, p_winner_id, 'loss',
    p_loser_legs, p_winner_legs, p_game_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION save_match_stats(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION save_match_stats(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO service_role;

SELECT 'fn_update_player_match_stats updated with opponent stats!' as status;
