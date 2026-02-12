-- ============================================================================
-- FIX STATS RECORDING FOR QUICK MATCHES AND DARTBOT GAMES
-- ============================================================================

-- ============================================================================
-- 1. FIX: Ensure quick match stats are recorded properly
-- The trigger might not be firing, so let's also add a direct function
-- ============================================================================

-- Function to manually record quick match stats (can be called from client)
CREATE OR REPLACE FUNCTION record_quick_match_stats(
  p_room_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_opponent_id uuid DEFAULT NULL,
  p_game_mode integer DEFAULT 501,
  p_match_format text DEFAULT 'quick',
  p_result text DEFAULT 'loss',
  p_legs_won integer DEFAULT 0,
  p_legs_lost integer DEFAULT 0,
  p_three_dart_avg numeric DEFAULT 0,
  p_first9_avg numeric DEFAULT 0,
  p_highest_checkout integer DEFAULT 0,
  p_checkout_percentage numeric DEFAULT 0,
  p_darts_thrown integer DEFAULT 0,
  p_total_score integer DEFAULT 0,
  p_total_checkouts integer DEFAULT 0,
  p_checkout_attempts integer DEFAULT 0,
  p_visits_100_plus integer DEFAULT 0,
  p_visits_140_plus integer DEFAULT 0,
  p_visits_180 integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user if not provided
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Insert into match_history
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
    checkout_percentage,
    darts_thrown,
    total_score,
    total_checkouts,
    checkout_attempts,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    played_at
  ) VALUES (
    p_room_id,
    v_user_id,
    p_opponent_id,
    p_game_mode,
    p_match_format,
    p_result,
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_checkout_percentage,
    p_darts_thrown,
    p_total_score,
    p_total_checkouts,
    p_checkout_attempts,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    NOW()
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates

  -- Also update player_stats
  INSERT INTO player_stats (
    user_id,
    total_matches,
    wins,
    losses,
    total_darts_thrown,
    total_score,
    overall_3dart_avg,
    overall_first9_avg,
    highest_checkout,
    total_checkouts,
    checkout_attempts,
    checkout_percentage,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    updated_at
  )
  VALUES (
    v_user_id,
    1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    p_darts_thrown,
    p_total_score,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_total_checkouts,
    p_checkout_attempts,
    p_checkout_percentage,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + p_darts_thrown,
    total_score = player_stats.total_score + p_total_score,
    overall_3dart_avg = ((player_stats.overall_3dart_avg * player_stats.total_darts_thrown) + (p_three_dart_avg * p_darts_thrown)) / (player_stats.total_darts_thrown + p_darts_thrown),
    overall_first9_avg = ((player_stats.overall_first9_avg * (player_stats.total_matches * 9)) + (p_first9_avg * 9)) / ((player_stats.total_matches + 1) * 9),
    highest_checkout = GREATEST(player_stats.highest_checkout, p_highest_checkout),
    total_checkouts = player_stats.total_checkouts + p_total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + p_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (player_stats.checkout_attempts + p_checkout_attempts) > 0 
      THEN ((player_stats.total_checkouts + p_total_checkouts)::numeric / (player_stats.checkout_attempts + p_checkout_attempts)) * 100
      ELSE 0 
    END,
    visits_100_plus = player_stats.visits_100_plus + p_visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + p_visits_140_plus,
    visits_180 = player_stats.visits_180 + p_visits_180,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'message', 'Stats recorded successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION record_quick_match_stats TO authenticated;

-- ============================================================================
-- 2. FIX: Update the dartbot match completion to properly map difficulty to level
-- ============================================================================

-- First, let's update any existing dartbot records that have wrong bot_level
UPDATE match_history
SET bot_level = CASE 
  WHEN bot_level BETWEEN 25 AND 35 THEN 1  -- Beginner
  WHEN bot_level BETWEEN 36 AND 50 THEN 2  -- Intermediate
  WHEN bot_level BETWEEN 51 AND 65 THEN 3  -- Advanced
  WHEN bot_level BETWEEN 66 AND 80 THEN 4  -- Expert
  WHEN bot_level BETWEEN 81 AND 100 THEN 5 -- Professional
  ELSE bot_level
END
WHERE match_format = 'dartbot' 
  AND bot_level IS NOT NULL 
  AND bot_level > 5;

-- ============================================================================
-- 3. FIX: Ensure the finalize function handles NULL source properly
-- ============================================================================

CREATE OR REPLACE FUNCTION finalize_quick_match_to_history(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_p1_visits RECORD;
  v_p2_visits RECORD;
  v_p1_first9_score INTEGER := 0;
  v_p1_first9_darts INTEGER := 0;
  v_p2_first9_score INTEGER := 0;
  v_p2_first9_darts INTEGER := 0;
  v_p1_highest_checkout INTEGER := 0;
  v_p2_highest_checkout INTEGER := 0;
BEGIN
  -- Get room details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND OR v_room.status != 'finished' THEN
    RETURN false;
  END IF;

  -- Calculate Player 1 stats from visits
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_bust THEN score ELSE 0 END), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts,
    COALESCE(SUM(CASE WHEN is_checkout THEN darts_thrown ELSE 0 END), 0) as checkout_darts
  INTO v_p1_visits
  FROM quick_match_visits
  WHERE room_id = p_room_id AND player_id = v_room.player1_id;

  -- Calculate Player 2 stats from visits
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_bust THEN score ELSE 0 END), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts,
    COALESCE(SUM(CASE WHEN is_checkout THEN darts_thrown ELSE 0 END), 0) as checkout_darts
  INTO v_p2_visits
  FROM quick_match_visits
  WHERE room_id = p_room_id AND player_id = v_room.player2_id;

  -- Calculate first 9 for player 1 (first 3 visits per leg)
  WITH p1_first9 AS (
    SELECT score, darts_thrown, 
           ROW_NUMBER() OVER (PARTITION BY leg ORDER BY turn_no) as rn
    FROM quick_match_visits
    WHERE room_id = p_room_id 
      AND player_id = v_room.player1_id
      AND NOT is_bust
  )
  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(darts_thrown), 0)
  INTO v_p1_first9_score, v_p1_first9_darts
  FROM p1_first9 WHERE rn <= 3;

  -- Calculate first 9 for player 2
  WITH p2_first9 AS (
    SELECT score, darts_thrown,
           ROW_NUMBER() OVER (PARTITION BY leg ORDER BY turn_no) as rn
    FROM quick_match_visits
    WHERE room_id = p_room_id 
      AND player_id = v_room.player2_id
      AND NOT is_bust
  )
  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(darts_thrown), 0)
  INTO v_p2_first9_score, v_p2_first9_darts
  FROM p2_first9 WHERE rn <= 3;

  -- Get highest checkout for each player
  SELECT COALESCE(MAX(remaining_before), 0)
  INTO v_p1_highest_checkout
  FROM quick_match_visits
  WHERE room_id = p_room_id 
    AND player_id = v_room.player1_id 
    AND is_checkout;

  SELECT COALESCE(MAX(remaining_before), 0)
  INTO v_p2_highest_checkout
  FROM quick_match_visits
  WHERE room_id = p_room_id 
    AND player_id = v_room.player2_id 
    AND is_checkout;

  -- Insert for Player 1
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg,
    highest_checkout, checkout_percentage, darts_thrown, total_score,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id,
    v_room.player1_id,
    v_room.player2_id,
    v_room.game_mode,
    COALESCE(v_room.source, v_room.match_type, 'quick'),
    CASE WHEN v_room.winner_id = v_room.player1_id THEN 'win' ELSE 'loss' END,
    v_room.player1_legs,
    v_room.player2_legs,
    CASE WHEN v_p1_visits.total_darts > 0 THEN ROUND((v_p1_visits.total_score::numeric / v_p1_visits.total_darts) * 3, 2) ELSE 0 END,
    CASE WHEN v_p1_first9_darts > 0 THEN ROUND((v_p1_first9_score::numeric / v_p1_first9_darts) * 3, 2) ELSE 0 END,
    v_p1_highest_checkout,
    CASE WHEN v_p1_visits.checkout_darts > 0 THEN ROUND((v_p1_visits.checkouts::numeric / v_p1_visits.checkout_darts) * 100, 2) ELSE 0 END,
    v_p1_visits.total_darts,
    v_p1_visits.total_score,
    v_p1_visits.checkouts,
    v_p1_visits.checkout_darts,
    v_p1_visits.count_100_plus,
    v_p1_visits.count_140_plus,
    v_p1_visits.count_180,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- Insert for Player 2
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg,
    highest_checkout, checkout_percentage, darts_thrown, total_score,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id,
    v_room.player2_id,
    v_room.player1_id,
    v_room.game_mode,
    COALESCE(v_room.source, v_room.match_type, 'quick'),
    CASE WHEN v_room.winner_id = v_room.player2_id THEN 'win' ELSE 'loss' END,
    v_room.player2_legs,
    v_room.player1_legs,
    CASE WHEN v_p2_visits.total_darts > 0 THEN ROUND((v_p2_visits.total_score::numeric / v_p2_visits.total_darts) * 3, 2) ELSE 0 END,
    CASE WHEN v_p2_first9_darts > 0 THEN ROUND((v_p2_first9_score::numeric / v_p2_first9_darts) * 3, 2) ELSE 0 END,
    v_p2_highest_checkout,
    CASE WHEN v_p2_visits.checkout_darts > 0 THEN ROUND((v_p2_visits.checkouts::numeric / v_p2_visits.checkout_darts) * 100, 2) ELSE 0 END,
    v_p2_visits.total_darts,
    v_p2_visits.total_score,
    v_p2_visits.checkouts,
    v_p2_visits.checkout_darts,
    v_p2_visits.count_100_plus,
    v_p2_visits.count_140_plus,
    v_p2_visits.count_180,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- Also update player_stats for Player 1
  INSERT INTO player_stats (
    user_id, total_matches, wins, losses, total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg, highest_checkout, total_checkouts,
    checkout_attempts, checkout_percentage, visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    v_room.player1_id, 1,
    CASE WHEN v_room.winner_id = v_room.player1_id THEN 1 ELSE 0 END,
    CASE WHEN v_room.winner_id != v_room.player1_id THEN 1 ELSE 0 END,
    v_p1_visits.total_darts, v_p1_visits.total_score,
    CASE WHEN v_p1_visits.total_darts > 0 THEN (v_p1_visits.total_score::numeric / v_p1_visits.total_darts) * 3 ELSE 0 END,
    CASE WHEN v_p1_first9_darts > 0 THEN (v_p1_first9_score::numeric / v_p1_first9_darts) * 3 ELSE 0 END,
    v_p1_highest_checkout, v_p1_visits.checkouts, v_p1_visits.checkout_darts,
    CASE WHEN v_p1_visits.checkout_darts > 0 THEN (v_p1_visits.checkouts::numeric / v_p1_visits.checkout_darts) * 100 ELSE 0 END,
    v_p1_visits.count_100_plus, v_p1_visits.count_140_plus, v_p1_visits.count_180, NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_room.winner_id = v_room.player1_id THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_room.winner_id != v_room.player1_id THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + v_p1_visits.total_darts,
    total_score = player_stats.total_score + v_p1_visits.total_score,
    overall_3dart_avg = ((player_stats.overall_3dart_avg * player_stats.total_darts_thrown) + (CASE WHEN v_p1_visits.total_darts > 0 THEN (v_p1_visits.total_score::numeric / v_p1_visits.total_darts) * 3 ELSE 0 END * v_p1_visits.total_darts)) / (player_stats.total_darts_thrown + v_p1_visits.total_darts),
    overall_first9_avg = ((player_stats.overall_first9_avg * (player_stats.total_matches * 9)) + (CASE WHEN v_p1_first9_darts > 0 THEN (v_p1_first9_score::numeric / v_p1_first9_darts) * 3 ELSE 0 END * 9)) / ((player_stats.total_matches + 1) * 9),
    highest_checkout = GREATEST(player_stats.highest_checkout, v_p1_highest_checkout),
    total_checkouts = player_stats.total_checkouts + v_p1_visits.checkouts,
    checkout_attempts = player_stats.checkout_attempts + v_p1_visits.checkout_darts,
    checkout_percentage = CASE WHEN (player_stats.checkout_attempts + v_p1_visits.checkout_darts) > 0 THEN ((player_stats.total_checkouts + v_p1_visits.checkouts)::numeric / (player_stats.checkout_attempts + v_p1_visits.checkout_darts)) * 100 ELSE 0 END,
    visits_100_plus = player_stats.visits_100_plus + v_p1_visits.count_100_plus,
    visits_140_plus = player_stats.visits_140_plus + v_p1_visits.count_140_plus,
    visits_180 = player_stats.visits_180 + v_p1_visits.count_180,
    updated_at = NOW();

  -- Also update player_stats for Player 2
  INSERT INTO player_stats (
    user_id, total_matches, wins, losses, total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg, highest_checkout, total_checkouts,
    checkout_attempts, checkout_percentage, visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    v_room.player2_id, 1,
    CASE WHEN v_room.winner_id = v_room.player2_id THEN 1 ELSE 0 END,
    CASE WHEN v_room.winner_id != v_room.player2_id THEN 1 ELSE 0 END,
    v_p2_visits.total_darts, v_p2_visits.total_score,
    CASE WHEN v_p2_visits.total_darts > 0 THEN (v_p2_visits.total_score::numeric / v_p2_visits.total_darts) * 3 ELSE 0 END,
    CASE WHEN v_p2_first9_darts > 0 THEN (v_p2_first9_score::numeric / v_p2_first9_darts) * 3 ELSE 0 END,
    v_p2_highest_checkout, v_p2_visits.checkouts, v_p2_visits.checkout_darts,
    CASE WHEN v_p2_visits.checkout_darts > 0 THEN (v_p2_visits.checkouts::numeric / v_p2_visits.checkout_darts) * 100 ELSE 0 END,
    v_p2_visits.count_100_plus, v_p2_visits.count_140_plus, v_p2_visits.count_180, NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_room.winner_id = v_room.player2_id THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_room.winner_id != v_room.player2_id THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + v_p2_visits.total_darts,
    total_score = player_stats.total_score + v_p2_visits.total_score,
    overall_3dart_avg = ((player_stats.overall_3dart_avg * player_stats.total_darts_thrown) + (CASE WHEN v_p2_visits.total_darts > 0 THEN (v_p2_visits.total_score::numeric / v_p2_visits.total_darts) * 3 ELSE 0 END * v_p2_visits.total_darts)) / (player_stats.total_darts_thrown + v_p2_visits.total_darts),
    overall_first9_avg = ((player_stats.overall_first9_avg * (player_stats.total_matches * 9)) + (CASE WHEN v_p2_first9_darts > 0 THEN (v_p2_first9_score::numeric / v_p2_first9_darts) * 3 ELSE 0 END * 9)) / ((player_stats.total_matches + 1) * 9),
    highest_checkout = GREATEST(player_stats.highest_checkout, v_p2_highest_checkout),
    total_checkouts = player_stats.total_checkouts + v_p2_visits.checkouts,
    checkout_attempts = player_stats.checkout_attempts + v_p2_visits.checkout_darts,
    checkout_percentage = CASE WHEN (player_stats.checkout_attempts + v_p2_visits.checkout_darts) > 0 THEN ((player_stats.total_checkouts + v_p2_visits.checkouts)::numeric / (player_stats.checkout_attempts + v_p2_visits.checkout_darts)) * 100 ELSE 0 END,
    visits_100_plus = player_stats.visits_100_plus + v_p2_visits.count_100_plus,
    visits_140_plus = player_stats.visits_140_plus + v_p2_visits.count_140_plus,
    visits_180 = player_stats.visits_180 + v_p2_visits.count_180,
    updated_at = NOW();

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in finalize_quick_match_to_history: %', SQLERRM;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_quick_match_to_history TO authenticated;

-- ============================================================================
-- 4. FIX: Update the trigger to also call player_stats update
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_match_finished_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process when status changes to 'finished'
  IF NEW.status = 'finished' AND (OLD.status IS NULL OR OLD.status != 'finished') THEN
    -- Skip dartbot matches (they use their own function)
    IF NEW.source = 'dartbot' OR NEW.match_type = 'dartbot' THEN
      RETURN NEW;
    END IF;
    
    -- Call the finalize function for quick/private matches
    PERFORM finalize_quick_match_to_history(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_match_finished_to_history ON match_rooms;
CREATE TRIGGER trg_match_finished_to_history
  AFTER UPDATE OF status ON match_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'finished')
  EXECUTE FUNCTION trigger_match_finished_to_history();

-- ============================================================================
-- 5. BACKFILL: Process any finished matches that don't have history entries
-- ============================================================================

DO $$
DECLARE
  v_room RECORD;
BEGIN
  FOR v_room IN 
    SELECT mr.id 
    FROM match_rooms mr
    LEFT JOIN match_history mh ON mh.room_id = mr.id
    WHERE mr.status = 'finished'
      AND mh.id IS NULL
      AND mr.source != 'dartbot'
      AND mr.match_type != 'dartbot'
    LIMIT 100
  LOOP
    PERFORM finalize_quick_match_to_history(v_room.id);
  END LOOP;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================
