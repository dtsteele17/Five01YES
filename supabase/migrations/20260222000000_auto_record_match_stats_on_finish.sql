-- ============================================================================
-- AUTO RECORD MATCH STATS ON FINISH
-- ============================================================================
-- This migration creates a trigger that automatically records match stats
-- when a match room's status changes to 'finished' or 'forfeited'
--
-- This ensures match_history is always populated with both player and opponent stats
-- ============================================================================

-- 1. First, ensure the match completion function exists with opponent stats support
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
  -- ============================================
  -- Calculate USER stats from quick_match_visits
  -- Include ALL visits (checkouts are not busts)
  -- ============================================
  SELECT COUNT(*) INTO v_user_visits_count
  FROM quick_match_visits 
  WHERE room_id = p_room_id AND player_id = p_user_id AND (is_bust = false OR is_bust IS NULL);
  
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
  
  -- ============================================
  -- Calculate OPPONENT stats from quick_match_visits
  -- ============================================
  SELECT COUNT(*) INTO v_opp_visits_count
  FROM quick_match_visits 
  WHERE room_id = p_room_id AND player_id = p_opponent_id AND (is_bust = false OR is_bust IS NULL);
  
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

-- 2. Create the wrapper function
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

-- 3. Create the trigger function that auto-records stats when match finishes
-- ============================================================================
DROP FUNCTION IF EXISTS trg_record_match_completion() CASCADE;

CREATE OR REPLACE FUNCTION trg_record_match_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winner_id UUID;
  v_loser_id UUID;
  v_winner_legs INTEGER;
  v_loser_legs INTEGER;
  v_result JSONB;
BEGIN
  -- Only proceed if status changed to 'finished' or 'forfeited'
  IF NEW.status IN ('finished', 'forfeited') AND OLD.status NOT IN ('finished', 'forfeited') THEN
    -- Determine winner and loser
    IF NEW.winner_id = NEW.player1_id THEN
      v_winner_id := NEW.player1_id;
      v_loser_id := NEW.player2_id;
      v_winner_legs := COALESCE(NEW.player1_legs, 0);
      v_loser_legs := COALESCE(NEW.player2_legs, 0);
    ELSIF NEW.winner_id = NEW.player2_id THEN
      v_winner_id := NEW.player2_id;
      v_loser_id := NEW.player1_id;
      v_winner_legs := COALESCE(NEW.player2_legs, 0);
      v_loser_legs := COALESCE(NEW.player1_legs, 0);
    ELSE
      -- No winner (draw or error), skip recording
      RETURN NEW;
    END IF;
    
    -- Record the match completion
    v_result := fn_record_quick_match_complete(
      NEW.id,
      v_winner_id,
      v_loser_id,
      v_winner_legs,
      v_loser_legs,
      NEW.game_mode
    );
    
    -- Log result for debugging
    IF (v_result->>'success')::BOOLEAN THEN
      RAISE NOTICE '[MATCH_TRIGGER] Recorded match completion for room %, winner %, loser %', 
        NEW.id, v_winner_id, v_loser_id;
    ELSE
      RAISE WARNING '[MATCH_TRIGGER] Failed to record match completion for room %: %', 
        NEW.id, v_result->>'error';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Create the trigger on match_rooms
-- ============================================================================
DROP TRIGGER IF EXISTS trg_match_rooms_completion ON match_rooms;

CREATE TRIGGER trg_match_rooms_completion
  AFTER UPDATE OF status ON match_rooms
  FOR EACH ROW
  WHEN (NEW.status IN ('finished', 'forfeited'))
  EXECUTE FUNCTION trg_record_match_completion();

-- 5. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO service_role;

-- 6. Verify the setup
-- ============================================================================
SELECT 
  'Match completion trigger installed' as status,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name = 'trg_match_rooms_completion') as trigger_count,
  (SELECT COUNT(*) FROM information_schema.columns 
   WHERE table_name = 'match_history' AND column_name LIKE 'opponent_%') as opponent_stats_columns;
