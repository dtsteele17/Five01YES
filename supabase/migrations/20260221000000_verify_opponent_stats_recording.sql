-- ============================================================================
-- VERIFY AND FIX OPPONENT STATS RECORDING
-- ============================================================================
-- This migration ensures opponent stats are properly recorded in match_history

-- 1. Ensure all opponent stats columns exist in match_history
-- ============================================================================
DO $$
BEGIN
    -- Add opponent stats columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_three_dart_avg') THEN
        ALTER TABLE match_history ADD COLUMN opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_first9_avg') THEN
        ALTER TABLE match_history ADD COLUMN opponent_first9_avg DECIMAL(5,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_highest_checkout') THEN
        ALTER TABLE match_history ADD COLUMN opponent_highest_checkout INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_checkout_percentage') THEN
        ALTER TABLE match_history ADD COLUMN opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_darts_thrown') THEN
        ALTER TABLE match_history ADD COLUMN opponent_darts_thrown INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_100_plus') THEN
        ALTER TABLE match_history ADD COLUMN opponent_visits_100_plus INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_140_plus') THEN
        ALTER TABLE match_history ADD COLUMN opponent_visits_140_plus INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_180') THEN
        ALTER TABLE match_history ADD COLUMN opponent_visits_180 INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. Create or replace the function with detailed logging
-- ============================================================================
DROP FUNCTION IF EXISTS fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION fn_update_player_match_stats(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_result TEXT,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_game_mode INTEGER DEFAULT 501
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_format TEXT := 'quick';
  
  -- User stats
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
  
  -- Opponent stats
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
  
  v_history_id UUID;
  v_existing RECORD;
  v_user_visits_count INTEGER := 0;
  v_opp_visits_count INTEGER := 0;
BEGIN
  -- Log start
  RAISE NOTICE '[STATS] Starting stats calculation for user % vs opponent % in room %', p_user_id, p_opponent_id, p_room_id;
  
  -- ============================================
  -- Calculate USER stats from quick_match_visits
  -- Include ALL visits (checkouts are not busts)
  -- ============================================
  SELECT COUNT(*) INTO v_user_visits_count
  FROM quick_match_visits 
  WHERE room_id = p_room_id AND player_id = p_user_id AND (is_bust = false OR is_bust IS NULL);
  
  RAISE NOTICE '[STATS] Found % visits for user %', v_user_visits_count, p_user_id;
  
  FOR v_visit IN 
    SELECT * FROM quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_user_id AND (is_bust = false OR is_bust IS NULL)
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_match_darts := v_match_darts + COALESCE(v_visit.darts_thrown, 3);
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
    
    IF v_visit.remaining_before <= 170 AND v_visit.remaining_before > 0 THEN
      v_match_checkout_attempts := v_match_checkout_attempts + 1;
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
  
  RAISE NOTICE '[STATS] User stats: avg=%, first9=%, 180s=%, checkouts=%', v_match_avg, v_match_first9_avg, v_match_180s, v_match_checkouts;
  
  -- ============================================
  -- Calculate OPPONENT stats from quick_match_visits
  -- ============================================
  SELECT COUNT(*) INTO v_opp_visits_count
  FROM quick_match_visits 
  WHERE room_id = p_room_id AND player_id = p_opponent_id AND (is_bust = false OR is_bust IS NULL);
  
  RAISE NOTICE '[STATS] Found % visits for opponent %', v_opp_visits_count, p_opponent_id;
  
  FOR v_opp_visit IN 
    SELECT * FROM quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_opponent_id AND (is_bust = false OR is_bust IS NULL)
    ORDER BY created_at
  LOOP
    v_opp_visit_count := v_opp_visit_count + 1;
    v_opp_darts := v_opp_darts + COALESCE(v_opp_visit.darts_thrown, 3);
    v_opp_score := v_opp_score + v_opp_visit.score;
    
    IF v_opp_visit_count <= 3 THEN
      v_opp_first9_score := v_opp_first9_score + v_opp_visit.score;
      v_opp_first9_darts := v_opp_first9_darts + COALESCE(v_opp_visit.darts_thrown, 3);
    END IF;
    
    IF v_opp_visit.is_checkout THEN
      v_opp_checkouts := v_opp_checkouts + 1;
      IF v_opp_visit.score > v_opp_highest_checkout THEN
        v_opp_highest_checkout := v_opp_visit.score;
      END IF;
    END IF;
    
    IF v_opp_visit.remaining_before <= 170 AND v_opp_visit.remaining_before > 0 THEN
      v_opp_checkout_attempts := v_opp_checkout_attempts + 1;
    END IF;
    
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
  
  IF v_opp_darts > 0 THEN
    v_opp_avg := ROUND(((v_opp_score::DECIMAL / v_opp_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_opp_first9_darts > 0 THEN
    v_opp_first9_avg := ROUND(((v_opp_first9_score::DECIMAL / v_opp_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_opp_checkout_attempts > 0 THEN
    v_opp_checkout_pct := ROUND(((v_opp_checkouts::DECIMAL / v_opp_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;
  
  RAISE NOTICE '[STATS] Opponent stats: avg=%, first9=%, 180s=%, checkouts=%', v_opp_avg, v_opp_first9_avg, v_opp_180s, v_opp_checkouts;
  
  -- ============================================
  -- Insert to match_history WITH opponent stats
  -- ============================================
  INSERT INTO match_history (
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
    v_match_100_plus, v_match_140_plus, v_match_180s, NOW(),
    -- Opponent stats
    v_opp_avg, v_opp_first9_avg, v_opp_highest_checkout,
    v_opp_checkout_pct, v_opp_darts,
    v_opp_100_plus, v_opp_140_plus, v_opp_180s
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
    played_at = EXCLUDED.played_at,
    -- Update opponent stats too
    opponent_three_dart_avg = EXCLUDED.opponent_three_dart_avg,
    opponent_first9_avg = EXCLUDED.opponent_first9_avg,
    opponent_highest_checkout = EXCLUDED.opponent_highest_checkout,
    opponent_checkout_percentage = EXCLUDED.opponent_checkout_percentage,
    opponent_darts_thrown = EXCLUDED.opponent_darts_thrown,
    opponent_visits_100_plus = EXCLUDED.opponent_visits_100_plus,
    opponent_visits_140_plus = EXCLUDED.opponent_visits_140_plus,
    opponent_visits_180 = EXCLUDED.opponent_visits_180
  RETURNING id INTO v_history_id;
  
  RAISE NOTICE '[STATS] Saved match history id=% with opponent avg=%', v_history_id, v_opp_avg;
  
  -- ============================================
  -- Update player_stats aggregate
  -- ============================================
  SELECT * INTO v_existing FROM player_stats WHERE user_id = p_user_id;
  
  IF v_existing IS NULL THEN
    INSERT INTO player_stats (
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
    UPDATE player_stats SET
      total_matches = total_matches + 1,
      wins = wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = total_darts_thrown + v_match_darts,
      total_score = total_score + v_match_score,
      overall_3dart_avg = CASE 
        WHEN (total_darts_thrown + v_match_darts) > 0 
        THEN ROUND(((total_score + v_match_score)::DECIMAL / (total_darts_thrown + v_match_darts)) * 3, 2)
        ELSE 0 
      END,
      highest_checkout = GREATEST(highest_checkout, v_match_highest_checkout),
      total_checkouts = total_checkouts + v_match_checkouts,
      checkout_attempts = checkout_attempts + v_match_checkout_attempts,
      checkout_percentage = CASE 
        WHEN (checkout_attempts + v_match_checkout_attempts) > 0 
        THEN ROUND(((total_checkouts + v_match_checkouts)::DECIMAL / (checkout_attempts + v_match_checkout_attempts)) * 100, 2)
        ELSE 0 
      END,
      visits_100_plus = visits_100_plus + v_match_100_plus,
      visits_140_plus = visits_140_plus + v_match_140_plus,
      visits_180 = visits_180 + v_match_180s,
      last_played_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN v_history_id;
END;
$$;

-- 3. Create wrapper function
-- ============================================================================
DROP FUNCTION IF EXISTS fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION fn_record_quick_match_complete(
  p_room_id UUID,
  p_winner_id UUID,
  p_loser_id UUID,
  p_winner_legs INTEGER,
  p_loser_legs INTEGER,
  p_game_mode INTEGER DEFAULT 501
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_winner_history_id UUID;
  v_loser_history_id UUID;
BEGIN
  -- Record winner stats (includes opponent/loser stats)
  v_winner_history_id := fn_update_player_match_stats(
    p_room_id,
    p_winner_id,
    p_loser_id,
    'win',
    p_winner_legs,
    p_loser_legs,
    p_game_mode
  );
  
  -- Record loser stats (includes opponent/winner stats)
  v_loser_history_id := fn_update_player_match_stats(
    p_room_id,
    p_loser_id,
    p_winner_id,
    'loss',
    p_loser_legs,
    p_winner_legs,
    p_game_mode
  );
  
  v_result := jsonb_build_object(
    'success', true,
    'winner_history_id', v_winner_history_id,
    'loser_history_id', v_loser_history_id
  );
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 4. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- 5. Backfill any existing matches that are missing opponent stats
-- This will recalculate opponent stats for recent matches (last 7 days)
-- ============================================================================
DO $$
DECLARE
  v_record RECORD;
  v_opp_avg DECIMAL(5,2);
  v_opp_first9_avg DECIMAL(5,2);
  v_opp_highest_checkout INTEGER;
  v_opp_180s INTEGER;
BEGIN
  FOR v_record IN 
    SELECT DISTINCT room_id, user_id, opponent_id, game_mode
    FROM match_history
    WHERE played_at > NOW() - INTERVAL '7 days'
      AND (opponent_three_dart_avg IS NULL OR opponent_three_dart_avg = 0)
      AND match_format = 'quick'
    LIMIT 100
  LOOP
    -- Calculate opponent stats from visits
    SELECT 
      COALESCE(ROUND(((SUM(score)::DECIMAL / NULLIF(SUM(COALESCE(darts_thrown, 3)), 0)) * 3)::DECIMAL, 2), 0),
      COALESCE(SUM(CASE WHEN score >= 180 THEN 1 ELSE 0 END), 0)
    INTO v_opp_avg, v_opp_180s
    FROM quick_match_visits
    WHERE room_id = v_record.room_id 
      AND player_id = v_record.opponent_id
      AND (is_bust = false OR is_bust IS NULL);
    
    -- Update the record with calculated opponent stats
    IF v_opp_avg > 0 THEN
      UPDATE match_history
      SET opponent_three_dart_avg = v_opp_avg,
          opponent_visits_180 = v_opp_180s
      WHERE room_id = v_record.room_id 
        AND user_id = v_record.user_id;
    END IF;
  END LOOP;
END $$;

-- 6. Verify setup
-- ============================================================================
SELECT 
  'Opponent stats verification complete' as status,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'match_history' AND column_name LIKE 'opponent_%') as opponent_columns,
  (SELECT COUNT(*) FROM match_history WHERE played_at > NOW() - INTERVAL '1 day') as matches_today,
  (SELECT COUNT(*) FROM match_history 
   WHERE played_at > NOW() - INTERVAL '1 day' 
   AND opponent_three_dart_avg > 0) as matches_with_opp_stats;
