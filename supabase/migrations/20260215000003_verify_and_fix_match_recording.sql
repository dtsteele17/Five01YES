-- ============================================================================
-- VERIFY AND FIX MATCH RECORDING SYSTEM
-- ============================================================================

-- 1. First, let's check the match_history table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'match_history'
ORDER BY ordinal_position;

-- 2. Check if the required columns exist for opponent stats
SELECT 
  column_name
FROM information_schema.columns 
WHERE table_name = 'match_history'
  AND column_name IN (
    'opponent_three_dart_avg', 'opponent_first9_avg', 'opponent_highest_checkout',
    'opponent_checkout_percentage', 'opponent_darts_thrown',
    'opponent_visits_100_plus', 'opponent_visits_140_plus', 'opponent_visits_180',
    'bot_level'
  );

-- 3. Add opponent stats columns if they don't exist
DO $$
BEGIN
  -- Add opponent stats columns
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'bot_level') THEN
    ALTER TABLE match_history ADD COLUMN bot_level INTEGER;
  END IF;
END $$;

-- 4. Check unique constraints
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'match_history';

-- 5. Add unique constraint on room_id, user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_match_history_room_user_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_match_history_room_user_unique 
    ON match_history(room_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- 6. Create or replace the main stats function with opponent stats
CREATE OR REPLACE FUNCTION fn_update_player_match_stats(
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
  
  v_existing RECORD;
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
  SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  v_match_format := COALESCE(v_room.match_type, v_room.source, 'quick');
  
  -- Calculate USER stats
  FOR v_visit IN 
    SELECT * FROM quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_user_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_match_darts := v_match_darts + v_visit.darts_thrown;
    v_match_score := v_match_score + v_visit.score;
    
    IF v_visit_count <= 3 THEN
      v_match_first9_score := v_match_first9_score + v_visit.score;
      v_match_first9_darts := v_match_first9_darts + v_visit.darts_thrown;
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
  
  -- Calculate OPPONENT stats
  FOR v_opp_visit IN 
    SELECT * FROM quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_opponent_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_opp_visit_count := v_opp_visit_count + 1;
    v_opp_darts := v_opp_darts + v_opp_visit.darts_thrown;
    v_opp_score := v_opp_score + v_opp_visit.score;
    
    IF v_opp_visit_count <= 3 THEN
      v_opp_first9_score := v_opp_first9_score + v_opp_visit.score;
      v_opp_first9_darts := v_opp_first9_darts + v_opp_visit.darts_thrown;
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
  
  -- Insert match history with OPPONENT stats
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at,
    opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
    opponent_checkout_percentage, opponent_darts_thrown,
    opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
    v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
    v_match_100_plus, v_match_140_plus, v_match_180s, now(),
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
    opponent_three_dart_avg = v_opp_avg,
    opponent_first9_avg = v_opp_first9_avg,
    opponent_highest_checkout = v_opp_highest_checkout,
    opponent_checkout_percentage = v_opp_checkout_pct,
    opponent_darts_thrown = v_opp_darts,
    opponent_visits_100_plus = v_opp_100_plus,
    opponent_visits_140_plus = v_opp_140_plus,
    opponent_visits_180 = v_opp_180s;
  
  -- Update player_stats aggregate
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
    v_new_total_matches := v_existing.total_matches + 1;
    v_new_total_darts := v_existing.total_darts_thrown + v_match_darts;
    v_new_total_score := v_existing.total_score + v_match_score;
    v_new_total_checkouts := v_existing.total_checkouts + v_match_checkouts;
    v_new_checkout_attempts := v_existing.checkout_attempts + v_match_checkout_attempts;
    v_new_highest_checkout := GREATEST(v_existing.highest_checkout, v_match_highest_checkout);
    
    IF v_new_total_darts > 0 THEN
      v_new_overall_avg := ROUND(((v_new_total_score::DECIMAL / v_new_total_darts) * 3)::DECIMAL, 2);
    END IF;
    
    IF v_new_checkout_attempts > 0 THEN
      v_new_checkout_pct := ROUND(((v_new_total_checkouts::DECIMAL / v_new_checkout_attempts) * 100)::DECIMAL, 2);
    END IF;
    
    UPDATE player_stats SET
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
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- 7. Create DartBot match recording function
CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_user_id UUID,
  p_bot_level INTEGER,
  p_game_mode INTEGER,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_three_dart_avg DECIMAL DEFAULT 0,
  p_first9_avg DECIMAL DEFAULT 0,
  p_highest_checkout INTEGER DEFAULT 0,
  p_darts_thrown INTEGER DEFAULT 0,
  p_total_score INTEGER DEFAULT 0,
  p_visits_100_plus INTEGER DEFAULT 0,
  p_visits_140_plus INTEGER DEFAULT 0,
  p_visits_180 INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id UUID;
  v_result TEXT;
BEGIN
  -- Generate a unique room ID for DartBot matches
  v_room_id := gen_random_uuid();
  v_result := CASE WHEN p_legs_won > p_legs_lost THEN 'win' ELSE 'loss' END;
  
  -- Create a dartbot_match_rooms entry
  INSERT INTO dartbot_match_rooms (
    id, player_id, dartbot_level, game_mode, match_format,
    status, player_legs, dartbot_legs, winner_id, completed_at
  ) VALUES (
    v_room_id, p_user_id, p_bot_level, p_game_mode, 
    CASE WHEN p_legs_won + p_legs_lost <= 1 THEN 'best-of-1'
         WHEN p_legs_won + p_legs_lost <= 3 THEN 'best-of-3'
         WHEN p_legs_won + p_legs_lost <= 5 THEN 'best-of-5'
         ELSE 'best-of-7' END,
    'finished', p_legs_won, p_legs_lost,
    CASE WHEN p_legs_won > p_legs_lost THEN p_user_id ELSE NULL END,
    now()
  );
  
  -- Insert into match_history
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, bot_level, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    v_room_id, p_user_id, NULL, p_game_mode, 'dartbot', p_bot_level, v_result,
    p_legs_won, p_legs_lost, p_three_dart_avg, p_first9_avg, p_highest_checkout,
    0, p_darts_thrown, p_total_score,
    p_visits_100_plus, p_visits_140_plus, p_visits_180, now()
  );
  
  RETURN jsonb_build_object(
    'ok', true,
    'room_id', v_room_id,
    'result', v_result
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(UUID, INTEGER, INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(UUID, INTEGER, INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- 8. Check recent match_history entries
SELECT 'Recent match_history entries:' AS info;
SELECT 
  mh.id,
  mh.room_id,
  mh.user_id,
  mh.opponent_id,
  mh.match_format,
  mh.result,
  mh.legs_won,
  mh.legs_lost,
  mh.three_dart_avg,
  mh.bot_level,
  mh.played_at
FROM match_history mh
ORDER BY mh.played_at DESC
LIMIT 10;

-- 9. Create a view for easier querying
CREATE OR REPLACE VIEW match_history_recent AS
SELECT 
  mh.*,
  p.username as opponent_username
FROM match_history mh
LEFT JOIN profiles p ON mh.opponent_id = p.user_id
ORDER BY mh.played_at DESC;

-- Grant select on view
GRANT SELECT ON match_history_recent TO authenticated;
GRANT SELECT ON match_history_recent TO service_role;

SELECT 'Match recording system verified and fixed!' AS status;
