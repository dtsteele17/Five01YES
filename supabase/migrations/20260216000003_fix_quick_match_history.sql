-- ============================================================================
-- FIX: Quick Match History Recording
-- This migration ensures quick match results are properly saved to match_history
-- ============================================================================

-- 1. First, let's check current match_history state
SELECT 'Current match_history count' as check_type, COUNT(*) as count FROM match_history;

-- 2. Check if there are any records with match_format = 'quick'
SELECT 
  'Quick matches in history' as check_type, 
  COUNT(*) as count,
  MIN(played_at) as earliest,
  MAX(played_at) as latest
FROM match_history 
WHERE match_format = 'quick' OR match_format IS NULL;

-- 3. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'match_history';

-- 4. Create a simpler, more reliable function for recording quick match history
-- This function directly inserts to match_history without complex calculations
CREATE OR REPLACE FUNCTION record_quick_match_to_history(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_game_mode INTEGER,
  p_result TEXT,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_three_dart_avg DECIMAL DEFAULT 0,
  p_first9_avg DECIMAL DEFAULT 0,
  p_highest_checkout INTEGER DEFAULT 0,
  p_darts_thrown INTEGER DEFAULT 0,
  p_total_score INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_history_id UUID;
BEGIN
  -- Direct insert to match_history
  INSERT INTO match_history (
    room_id,
    user_id,
    opponent_id,
    game_mode,
    match_format,
    result,
    legs_won,
    legs_lost,
    three_dart_avg,
    first9_avg,
    highest_checkout,
    darts_thrown,
    total_score,
    played_at
  ) VALUES (
    p_room_id,
    p_user_id,
    p_opponent_id,
    p_game_mode,
    'quick',
    p_result,
    p_legs_won,
    p_legs_lost,
    COALESCE(p_three_dart_avg, 0),
    COALESCE(p_first9_avg, 0),
    COALESCE(p_highest_checkout, 0),
    COALESCE(p_darts_thrown, 0),
    COALESCE(p_total_score, 0),
    NOW()
  )
  ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = EXCLUDED.result,
    legs_won = EXCLUDED.legs_won,
    legs_lost = EXCLUDED.legs_lost,
    three_dart_avg = EXCLUDED.three_dart_avg,
    first9_avg = EXCLUDED.first9_avg,
    highest_checkout = EXCLUDED.highest_checkout,
    darts_thrown = EXCLUDED.darts_thrown,
    total_score = EXCLUDED.total_score,
    played_at = EXCLUDED.played_at
  RETURNING id INTO v_history_id;
  
  RETURN v_history_id;
END;
$$;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION record_quick_match_to_history TO authenticated;
GRANT EXECUTE ON FUNCTION record_quick_match_to_history TO service_role;

-- 6. Fix the main fn_update_player_match_stats function with better error handling
-- and ensure it always inserts to match_history
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
  
  v_history_id UUID;
  v_existing RECORD;
BEGIN
  -- Get room details (but don't fail if not found - use defaults)
  SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id;
  
  IF v_room IS NOT NULL THEN
    v_match_format := COALESCE(v_room.source, v_room.match_type, 'quick');
  END IF;
  
  -- Calculate USER stats from visits
  BEGIN
    FOR v_visit IN 
      SELECT * FROM quick_match_visits 
      WHERE room_id = p_room_id AND player_id = p_user_id AND is_bust = false
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
  EXCEPTION WHEN OTHERS THEN
    -- If visit calculation fails, use zeros
    RAISE WARNING 'Error calculating stats: %', SQLERRM;
  END;
  
  -- Insert to match_history - ALWAYS DO THIS regardless of player_stats
  BEGIN
    INSERT INTO match_history (
      room_id, user_id, opponent_id, game_mode, match_format, result,
      legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
      checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
      visits_100_plus, visits_140_plus, visits_180, played_at
    ) VALUES (
      p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
      p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
      v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
      v_match_100_plus, v_match_140_plus, v_match_180s, NOW()
    )
    ON CONFLICT ON CONSTRAINT unique_room_user_match_history DO UPDATE SET
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
      played_at = NOW()
    RETURNING id INTO v_history_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error inserting match_history: %', SQLERRM;
    v_history_id := NULL;
  END;
  
  -- Update player_stats (separate from match_history - don't let failures here stop match_history)
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error updating player_stats: %', SQLERRM;
  END;
  
  RETURN jsonb_build_object(
    'ok', true,
    'history_id', v_history_id,
    'match_avg', v_match_avg,
    'darts_thrown', v_match_darts,
    'match_format', v_match_format
  );
END;
$$;

-- 7. Ensure the unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_room_user_match_history'
  ) THEN
    ALTER TABLE match_history 
    ADD CONSTRAINT unique_room_user_match_history 
    UNIQUE (room_id, user_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint may already exist or error: %', SQLERRM;
END $$;

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- 9. Verify RLS is properly configured
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to ensure they're clean
DROP POLICY IF EXISTS "match_history_select_policy" ON match_history;
DROP POLICY IF EXISTS "match_history_insert_policy" ON match_history;
DROP POLICY IF EXISTS "match_history_update_policy" ON match_history;

CREATE POLICY "match_history_select_policy" ON match_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "match_history_insert_policy" ON match_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "match_history_update_policy" ON match_history
  FOR UPDATE USING (true);

-- 10. Add comment explaining the function
COMMENT ON FUNCTION fn_update_player_match_stats IS 'Records quick match results to match_history and updates player_stats. Called after match completion.';

-- Final verification
SELECT 'Quick match history fix applied successfully' as status;
