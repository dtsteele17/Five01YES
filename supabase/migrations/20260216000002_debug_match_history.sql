-- ============================================================================
-- DEBUG: Check match_history and fix any issues
-- ============================================================================

-- 1. Check if match_history has RLS enabled
SELECT 
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class
WHERE relname = 'match_history';

-- 2. Check RLS policies on match_history
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'match_history';

-- 3. Check if there are any recent match_history entries
SELECT 
  'Recent match_history entries' as info,
  COUNT(*) as count,
  MAX(played_at) as latest_entry
FROM match_history
WHERE played_at >= NOW() - INTERVAL '24 hours';

-- 4. Check for any errors in the function execution
-- (This would be in the application logs, but we can verify the function works)

-- 5. Ensure match_history has correct columns for quick matches
DO $$
BEGIN
  -- Check if match_format column exists and has proper constraints
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_history' AND column_name = 'match_format'
  ) THEN
    ALTER TABLE match_history ADD COLUMN match_format TEXT DEFAULT 'quick';
  END IF;

  -- Ensure match_format has proper default
  ALTER TABLE match_history ALTER COLUMN match_format SET DEFAULT 'quick';
END $$;

-- 6. Verify the unique constraint for upsert
SELECT 
  tc.constraint_name,
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'match_history' 
  AND tc.constraint_type = 'UNIQUE';

-- 7. Create or replace the function with better error handling
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
  v_history_id UUID;
BEGIN
  -- Get room details
  SELECT * INTO v_room FROM match_rooms WHERE id = p_room_id;
  IF v_room IS NULL THEN
    RAISE WARNING 'Room not found: %', p_room_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  -- Determine match format from room - try source first (more reliable), then match_type
  v_match_format := COALESCE(v_room.source, v_room.match_type, 'quick');
  
  RAISE NOTICE 'Processing match stats for room: %, format: %, user: %, opponent: %', 
    p_room_id, v_match_format, p_user_id, p_opponent_id;
  
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
  
  RAISE NOTICE 'User stats - darts: %, score: %, avg: %, checkouts: %', 
    v_match_darts, v_match_score, v_match_avg, v_match_checkouts;
  
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
    opponent_visits_180 = v_opp_180s
  RETURNING id INTO v_history_id;
  
  RAISE NOTICE 'Inserted/Updated match_history record: %', v_history_id;
  
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
    RAISE NOTICE 'Created new player_stats for user: %', p_user_id;
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
    
    RAISE NOTICE 'Updated player_stats for user: %', p_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'match_avg', v_match_avg,
    'opponent_avg', v_opp_avg,
    'history_id', v_history_id
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

-- Ensure RLS allows inserts
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "match_history_select" ON match_history;
DROP POLICY IF EXISTS "match_history_insert" ON match_history;
DROP POLICY IF EXISTS "match_history_update" ON match_history;
DROP POLICY IF EXISTS "Users can view their own match history" ON match_history;
DROP POLICY IF EXISTS "System can insert match history" ON match_history;

-- Create permissive policies
CREATE POLICY "match_history_select" ON match_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "match_history_insert" ON match_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "match_history_update" ON match_history
  FOR UPDATE USING (true);

-- Verify everything is set up correctly
SELECT 'Match history debugging complete' as status;

-- Enable realtime for match_history
ALTER PUBLICATION supabase_realtime ADD TABLE match_history;

-- Grant access to authenticated users for realtime
GRANT SELECT ON match_history TO authenticated;
GRANT INSERT ON match_history TO authenticated;
GRANT UPDATE ON match_history TO authenticated;
