-- ============================================================================
-- COMPLETE MATCH RECORDING FIX
-- ============================================================================

-- 1. Add opponent stats columns to match_history if they don't exist
-- ============================================================================
DO $$
BEGIN
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

-- 2. Add unique constraint to prevent duplicate entries
-- ============================================================================
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

-- 3. Create/Replace the main stats function for QuickMatch recording
-- ============================================================================
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
  
  -- Determine match format from room - try source first (more reliable), then match_type
  v_match_format := COALESCE(v_room.source, v_room.match_type, 'quick');
  
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

-- Grant execute permissions for QuickMatch function
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- 4. Create/Replace DartBot match recording function
-- ============================================================================
CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_dartbot_level INTEGER,
  p_player_legs_won INTEGER,
  p_bot_legs_won INTEGER,
  p_winner TEXT,
  p_player_three_dart_avg NUMERIC DEFAULT 0,
  p_player_first9_avg NUMERIC DEFAULT 0,
  p_player_checkout_pct NUMERIC DEFAULT 0,
  p_player_highest_checkout INTEGER DEFAULT 0,
  p_player_darts_at_double INTEGER DEFAULT 0,
  p_player_total_darts INTEGER DEFAULT 0,
  p_player_100_plus INTEGER DEFAULT 0,
  p_player_140_plus INTEGER DEFAULT 0,
  p_player_180s INTEGER DEFAULT 0,
  p_bot_three_dart_avg NUMERIC DEFAULT 0,
  p_bot_first9_avg NUMERIC DEFAULT 0,
  p_bot_checkout_pct NUMERIC DEFAULT 0,
  p_bot_highest_checkout INTEGER DEFAULT 0,
  p_bot_darts_at_double INTEGER DEFAULT 0,
  p_bot_total_darts INTEGER DEFAULT 0,
  p_bot_100_plus INTEGER DEFAULT 0,
  p_bot_140_plus INTEGER DEFAULT 0,
  p_bot_180s INTEGER DEFAULT 0,
  p_bot_total_score INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room_id UUID;
  v_result TEXT;
  v_player_legs INTEGER;
  v_bot_legs INTEGER;
  v_total_score INTEGER;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_player_legs := p_player_legs_won;
  v_bot_legs := p_bot_legs_won;
  v_result := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;
  
  IF p_player_total_darts > 0 THEN
    v_total_score := ROUND((p_player_three_dart_avg / 3) * p_player_total_darts);
  ELSE
    v_total_score := 0;
  END IF;
  
  v_room_id := gen_random_uuid();
  
  INSERT INTO dartbot_match_rooms (
    id, player_id, dartbot_level, game_mode, match_format,
    status, player_legs, dartbot_legs, winner_id, completed_at
  ) VALUES (
    v_room_id, v_user_id, p_dartbot_level, p_game_mode, p_match_format,
    'finished', v_player_legs, v_bot_legs,
    CASE WHEN p_winner = 'player' THEN v_user_id ELSE NULL END,
    now()
  );
  
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, bot_level, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    v_room_id, v_user_id, NULL, p_game_mode, 'dartbot', p_dartbot_level, v_result,
    v_player_legs, v_bot_legs, p_player_three_dart_avg, p_player_first9_avg, p_player_highest_checkout,
    p_player_checkout_pct, p_player_total_darts, v_total_score,
    p_player_100_plus, p_player_140_plus, p_player_180s, now()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'result', v_result
  );
END;
$$;

-- Grant execute permissions for DartBot function
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- 5. Create view for easier querying of recent matches
-- ============================================================================
CREATE OR REPLACE VIEW match_history_recent AS
SELECT 
  mh.*,
  p.username as opponent_username
FROM match_history mh
LEFT JOIN profiles p ON mh.opponent_id = p.user_id
ORDER BY mh.played_at DESC;

GRANT SELECT ON match_history_recent TO authenticated;
GRANT SELECT ON match_history_recent TO service_role;

-- 6. Verify match_history accepts all match formats
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE match_history 
  DROP CONSTRAINT IF EXISTS match_history_match_format_check;
  
  ALTER TABLE match_history 
  ADD CONSTRAINT match_history_match_format_check 
  CHECK (match_format IN (
    'quick',
    'ranked',
    'private',
    'local',
    'tournament',
    'league',
    'training',
    'dartbot'
  ));
END $$;

-- 7. Create index for today's stats query
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_match_history_today_stats 
ON match_history(user_id, played_at, match_format) 
WHERE match_format IN ('quick', 'dartbot');

-- 8. Verify the setup
-- ============================================================================
SELECT 
  'Match recording system fully configured!' AS status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'match_history') AS column_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'match_history') AS index_count;
