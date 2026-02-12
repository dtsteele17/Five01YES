-- ============================================
-- FIX: Dartbot Stats Recording & Win Streaks
-- ============================================

-- First, ensure player_stats has win streak columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_stats' AND column_name = 'current_win_streak'
  ) THEN
    ALTER TABLE player_stats ADD COLUMN current_win_streak INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_stats' AND column_name = 'best_win_streak'
  ) THEN
    ALTER TABLE player_stats ADD COLUMN best_win_streak INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- WIN STREAK CALCULATION FUNCTIONS
-- ============================================

-- Calculate current win streak from match_history
CREATE OR REPLACE FUNCTION calculate_win_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
  v_result RECORD;
BEGIN
  FOR v_result IN 
    SELECT result 
    FROM match_history 
    WHERE user_id = p_user_id 
    ORDER BY played_at DESC
  LOOP
    IF v_result.result = 'win' THEN
      v_streak := v_streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  RETURN v_streak;
END;
$$ LANGUAGE plpgsql;

-- Calculate best win streak from match_history
CREATE OR REPLACE FUNCTION calculate_best_win_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_current_streak INTEGER := 0;
  v_best_streak INTEGER := 0;
  v_result RECORD;
BEGIN
  FOR v_result IN 
    SELECT result 
    FROM match_history 
    WHERE user_id = p_user_id 
    ORDER BY played_at ASC
  LOOP
    IF v_result.result = 'win' THEN
      v_current_streak := v_current_streak + 1;
      IF v_current_streak > v_best_streak THEN
        v_best_streak := v_current_streak;
      END IF;
    ELSE
      v_current_streak := 0;
    END IF;
  END LOOP;
  RETURN v_best_streak;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIXED: Dartbot Match Completion RPC
-- ============================================

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_dartbot_level INTEGER,
  p_player_legs INTEGER,
  p_dartbot_legs INTEGER,
  p_winner TEXT,
  p_started_at TIMESTAMP WITH TIME ZONE,
  p_completed_at TIMESTAMP WITH TIME ZONE,
  p_three_dart_avg DECIMAL DEFAULT 0,
  p_first9_avg DECIMAL DEFAULT 0,
  p_highest_checkout INTEGER DEFAULT 0,
  p_checkout_percentage DECIMAL DEFAULT 0,
  p_darts_thrown INTEGER DEFAULT 0,
  p_total_score INTEGER DEFAULT 0,
  p_total_checkouts INTEGER DEFAULT 0,
  p_checkout_attempts INTEGER DEFAULT 0,
  p_visits_100_plus INTEGER DEFAULT 0,
  p_visits_140_plus INTEGER DEFAULT 0,
  p_visits_180 INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result TEXT := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;
  v_room_id UUID;
  v_existing RECORD;
BEGIN
  -- Validate user
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Generate a unique room_id for dartbot matches
  v_room_id := gen_random_uuid();

  -- ========================================
  -- STEP 1: Insert into match_history
  -- ========================================
  INSERT INTO match_history (
    room_id,
    user_id,
    opponent_id,
    game_mode,
    match_format,
    bot_level,
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
    v_room_id,
    v_user_id,
    NULL, -- dartbot has no user_id
    p_game_mode,
    'dartbot',
    p_dartbot_level,
    v_result,
    p_player_legs,
    p_dartbot_legs,
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
    p_completed_at
  );

  -- ========================================
  -- STEP 2: Update player_stats aggregate
  -- ========================================
  SELECT * INTO v_existing FROM player_stats WHERE user_id = v_user_id;
  
  IF v_existing IS NULL THEN
    -- First game ever - create new record
    INSERT INTO player_stats (
      user_id,
      total_matches,
      wins,
      losses,
      matches_301,
      matches_501,
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
      current_win_streak,
      best_win_streak
    ) VALUES (
      v_user_id,
      1,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
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
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END
    );
  ELSE
    -- Update existing stats
    UPDATE player_stats SET
      total_matches = total_matches + 1,
      wins = wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = total_darts_thrown + p_darts_thrown,
      total_score = total_score + p_total_score,
      overall_3dart_avg = CASE 
        WHEN (total_darts_thrown + p_darts_thrown) > 0 
        THEN ROUND(((total_score + p_total_score)::DECIMAL / (total_darts_thrown + p_darts_thrown) * 3)::DECIMAL, 2)
        ELSE 0 
      END,
      overall_first9_avg = CASE 
        WHEN (total_darts_thrown + p_darts_thrown) > 0 
        THEN ROUND(((total_score + p_total_score)::DECIMAL / (total_darts_thrown + p_darts_thrown) * 3)::DECIMAL, 2)
        ELSE 0 
      END,
      highest_checkout = GREATEST(highest_checkout, p_highest_checkout),
      total_checkouts = total_checkouts + p_total_checkouts,
      checkout_attempts = checkout_attempts + p_checkout_attempts,
      checkout_percentage = CASE 
        WHEN (checkout_attempts + p_checkout_attempts) > 0 
        THEN ROUND(((total_checkouts + p_total_checkouts)::DECIMAL / (checkout_attempts + p_checkout_attempts) * 100)::DECIMAL, 2)
        ELSE 0 
      END,
      visits_100_plus = visits_100_plus + p_visits_100_plus,
      visits_140_plus = visits_140_plus + p_visits_140_plus,
      visits_180 = visits_180 + p_visits_180,
      updated_at = NOW()
    WHERE user_id = v_user_id;
    
    -- Update win streaks separately
    UPDATE player_stats SET
      current_win_streak = calculate_win_streak(v_user_id),
      best_win_streak = GREATEST(COALESCE(best_win_streak, 0), calculate_best_win_streak(v_user_id))
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'result', v_result,
    'wins', (SELECT wins FROM player_stats WHERE user_id = v_user_id),
    'losses', (SELECT losses FROM player_stats WHERE user_id = v_user_id),
    'current_streak', (SELECT current_win_streak FROM player_stats WHERE user_id = v_user_id),
    'best_streak', (SELECT best_win_streak FROM player_stats WHERE user_id = v_user_id)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion TO anon;

-- ============================================
-- DASHBOARD STATS RPC
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_stats RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT 
    COALESCE(total_matches, 0) as total_matches,
    COALESCE(wins, 0) as wins,
    COALESCE(losses, 0) as losses,
    COALESCE(current_win_streak, 0) as current_streak,
    COALESCE(best_win_streak, 0) as best_streak,
    COALESCE(overall_3dart_avg, 0) as avg,
    COALESCE(highest_checkout, 0) as highest_checkout,
    COALESCE(visits_180, 0) as one_eighties
  INTO v_stats
  FROM player_stats 
  WHERE user_id = v_user_id;

  IF v_stats IS NULL THEN
    RETURN jsonb_build_object(
      'total_matches', 0,
      'wins', 0,
      'losses', 0,
      'current_streak', 0,
      'best_streak', 0,
      'avg', 0,
      'highest_checkout', 0,
      'one_eighties', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'total_matches', v_stats.total_matches,
    'wins', v_stats.wins,
    'losses', v_stats.losses,
    'current_streak', v_stats.current_streak,
    'best_streak', v_stats.best_streak,
    'avg', v_stats.avg,
    'highest_checkout', v_stats.highest_checkout,
    'one_eighties', v_stats.one_eighties
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO anon;

-- ============================================
-- BACKFILL: Update all existing player_stats
-- ============================================

UPDATE player_stats ps
SET 
  current_win_streak = calculate_win_streak(ps.user_id),
  best_win_streak = calculate_best_win_streak(ps.user_id);

SELECT 'Dartbot stats and win streaks fixed!' as status;
