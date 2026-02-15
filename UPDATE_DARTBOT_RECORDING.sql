-- ============================================
-- UPDATE: Ensure DartBot match recording updates all stats
-- ============================================

-- Update the record_dartbot_match_with_xp function to also update streaks
CREATE OR REPLACE FUNCTION record_dartbot_match_with_xp(
  p_player_id UUID,
  p_game_mode INTEGER,
  p_match_format VARCHAR(50),
  p_dartbot_level INTEGER,
  p_player_legs_won INTEGER,
  p_bot_legs_won INTEGER,
  p_winner VARCHAR(10),
  p_player_stats JSONB,
  p_bot_stats JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_xp_earned INTEGER := 0;
  v_base_xp INTEGER := 100;
  v_performance_bonus INTEGER := 0;
  v_win_bonus INTEGER := 0;
  v_avg NUMERIC;
  v_room_id TEXT;
  v_is_win BOOLEAN;
  v_current_streak INTEGER;
  v_best_streak INTEGER;
  v_last_5 TEXT[];
BEGIN
  v_is_win := p_winner = 'player';
  
  -- Calculate base XP based on game mode
  v_base_xp := CASE p_game_mode
    WHEN 301 THEN 90
    WHEN 501 THEN 100
    ELSE 100
  END;

  -- Get player average
  v_avg := COALESCE((p_player_stats->>'threeDartAverage')::numeric, 0);

  -- Performance bonus based on average
  IF v_avg >= 90 THEN
    v_performance_bonus := v_base_xp * 0.5;
  ELSIF v_avg >= 75 THEN
    v_performance_bonus := v_base_xp * 0.25;
  ELSIF v_avg >= 60 THEN
    v_performance_bonus := v_base_xp * 0.1;
  ELSIF v_avg < 30 THEN
    v_performance_bonus := -v_base_xp * 0.25;
  END IF;

  -- Win bonus
  IF v_is_win THEN
    v_win_bonus := v_base_xp * 0.15;
  END IF;

  -- Calculate total XP (minimum 10)
  v_xp_earned := GREATEST(10, v_base_xp + v_performance_bonus + v_win_bonus);

  v_room_id := 'dartbot_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6);

  -- Record to match_history
  INSERT INTO match_history (
    user_id,
    room_id,
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
    visits_100_plus,
    visits_140_plus,
    visits_180,
    bot_level,
    xp_earned,
    played_at,
    metadata
  ) VALUES (
    p_player_id,
    v_room_id,
    'dartbot',
    p_game_mode,
    'dartbot',
    CASE WHEN v_is_win THEN 'win' ELSE 'loss' END,
    p_player_legs_won,
    p_bot_legs_won,
    (p_player_stats->>'threeDartAverage')::numeric,
    (p_player_stats->>'first9Average')::numeric,
    (p_player_stats->>'highestCheckout')::integer,
    (p_player_stats->>'checkoutPercentage')::numeric,
    (p_player_stats->>'totalDartsThrown')::integer,
    COALESCE((p_bot_stats->>'totalScore')::integer, 0),
    (p_player_stats->>'visits100Plus')::integer,
    (p_player_stats->>'visits140Plus')::integer,
    (p_player_stats->>'visits180')::integer,
    p_dartbot_level,
    v_xp_earned,
    NOW(),
    jsonb_build_object(
      'bot_stats', p_bot_stats,
      'xp_breakdown', jsonb_build_object(
        'base', v_base_xp,
        'performance_bonus', v_performance_bonus,
        'win_bonus', v_win_bonus,
        'total', v_xp_earned
      )
    )
  );

  -- Also record to matches table for consistency
  INSERT INTO matches (
    user_id, match_type, game_mode, match_format, status,
    winner_id, winner_name, player1_name, player2_name,
    player1_legs_won, player2_legs_won,
    opponent_id, opponent_type, dartbot_level,
    user_avg, opponent_avg, user_first9_avg, opponent_first9_avg,
    user_checkout_pct, opponent_checkout_pct,
    started_at, completed_at
  ) VALUES (
    p_player_id, 'dartbot', p_game_mode::TEXT, p_match_format, 'completed',
    CASE WHEN v_is_win THEN p_player_id ELSE NULL END,
    CASE WHEN v_is_win THEN 'You' ELSE 'DartBot' END,
    'You', 'DartBot',
    p_player_legs_won, p_bot_legs_won,
    NULL, 'dartbot', p_dartbot_level,
    (p_player_stats->>'threeDartAverage')::numeric, (p_bot_stats->>'threeDartAverage')::numeric,
    (p_player_stats->>'first9Average')::numeric, (p_bot_stats->>'first9Average')::numeric,
    (p_player_stats->>'checkoutPercentage')::numeric, (p_bot_stats->>'checkoutPercentage')::numeric,
    NOW(), NOW()
  );

  -- Update or insert user_stats
  INSERT INTO user_stats (
    user_id, total_matches, wins, losses, total_180s,
    total_checkout_attempts, total_checkouts_made, highest_checkout,
    best_average, best_first9_average, total_100_plus, total_140_plus,
    total_points_scored, total_darts_thrown, updated_at
  )
  SELECT
    p_player_id,
    COALESCE(us.total_matches, 0) + 1,
    COALESCE(us.wins, 0) + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    COALESCE(us.losses, 0) + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    COALESCE(us.total_180s, 0) + (p_player_stats->>'visits180')::INTEGER,
    COALESCE(us.total_checkout_attempts, 0) + COALESCE((p_player_stats->>'dartsAtDouble')::INTEGER, 0),
    COALESCE(us.total_checkouts_made, 0) + COALESCE((p_player_stats->>'checkoutsMade')::INTEGER, 0),
    GREATEST(COALESCE(us.highest_checkout, 0), COALESCE((p_player_stats->>'highestCheckout')::INTEGER, 0)),
    GREATEST(COALESCE(us.best_average, 0), (p_player_stats->>'threeDartAverage')::NUMERIC),
    GREATEST(COALESCE(us.best_first9_average, 0), (p_player_stats->>'first9Average')::NUMERIC),
    COALESCE(us.total_100_plus, 0) + (p_player_stats->>'visits100Plus')::INTEGER,
    COALESCE(us.total_140_plus, 0) + (p_player_stats->>'visits140Plus')::INTEGER,
    COALESCE(us.total_points_scored, 0) + COALESCE((p_player_stats->>'totalScore')::INTEGER, 0),
    COALESCE(us.total_darts_thrown, 0) + COALESCE((p_player_stats->>'totalDartsThrown')::INTEGER, 0),
    NOW()
  FROM (SELECT * FROM user_stats WHERE user_id = p_player_id) us
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = user_stats.total_matches + 1,
    wins = user_stats.wins + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    losses = user_stats.losses + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    total_180s = user_stats.total_180s + (p_player_stats->>'visits180')::INTEGER,
    total_checkout_attempts = user_stats.total_checkout_attempts + COALESCE((p_player_stats->>'dartsAtDouble')::INTEGER, 0),
    total_checkouts_made = user_stats.total_checkouts_made + COALESCE((p_player_stats->>'checkoutsMade')::INTEGER, 0),
    highest_checkout = GREATEST(user_stats.highest_checkout, COALESCE((p_player_stats->>'highestCheckout')::INTEGER, 0)),
    best_average = GREATEST(user_stats.best_average, (p_player_stats->>'threeDartAverage')::NUMERIC),
    best_first9_average = GREATEST(user_stats.best_first9_average, (p_player_stats->>'first9Average')::NUMERIC),
    total_100_plus = user_stats.total_100_plus + (p_player_stats->>'visits100Plus')::INTEGER,
    total_140_plus = user_stats.total_140_plus + (p_player_stats->>'visits140Plus')::INTEGER,
    total_points_scored = user_stats.total_points_scored + COALESCE((p_player_stats->>'totalScore')::INTEGER, 0),
    total_darts_thrown = user_stats.total_darts_thrown + COALESCE((p_player_stats->>'totalDartsThrown')::INTEGER, 0),
    updated_at = NOW();

  -- Get current streak data
  SELECT current_win_streak, best_win_streak, last_5_results
  INTO v_current_streak, v_best_streak, v_last_5
  FROM player_stats
  WHERE user_id = p_player_id;

  -- Calculate new streak
  IF v_is_win THEN
    v_current_streak := COALESCE(v_current_streak, 0) + 1;
  ELSE
    v_current_streak := 0;
  END IF;

  v_best_streak := GREATEST(COALESCE(v_best_streak, 0), v_current_streak);

  -- Update last 5 results
  v_last_5 := array_prepend(CASE WHEN v_is_win THEN 'W' ELSE 'L' END, COALESCE(v_last_5, ARRAY[]::TEXT[]));
  IF array_length(v_last_5, 1) > 5 THEN
    v_last_5 := v_last_5[1:5];
  END IF;

  -- Update or insert player_stats (for dashboard/win streaks)
  INSERT INTO player_stats (
    user_id, wins_total, losses_total, current_win_streak, best_win_streak,
    total_matches, total_180s, total_checkouts, total_checkout_attempts,
    highest_checkout_ever, best_average_ever, most_180s_in_match, last_5_results, updated_at
  )
  SELECT
    p_player_id,
    COALESCE(ps.wins_total, 0) + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    COALESCE(ps.losses_total, 0) + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    v_current_streak,
    v_best_streak,
    COALESCE(ps.total_matches, 0) + 1,
    COALESCE(ps.total_180s, 0) + (p_player_stats->>'visits180')::INTEGER,
    COALESCE(ps.total_checkouts, 0) + COALESCE((p_player_stats->>'checkoutsMade')::INTEGER, 0),
    COALESCE(ps.total_checkout_attempts, 0) + COALESCE((p_player_stats->>'dartsAtDouble')::INTEGER, 0),
    GREATEST(COALESCE(ps.highest_checkout_ever, 0), COALESCE((p_player_stats->>'highestCheckout')::INTEGER, 0)),
    GREATEST(COALESCE(ps.best_average_ever, 0), (p_player_stats->>'threeDartAverage')::NUMERIC),
    GREATEST(COALESCE(ps.most_180s_in_match, 0), (p_player_stats->>'visits180')::INTEGER),
    v_last_5,
    NOW()
  FROM (SELECT * FROM player_stats WHERE user_id = p_player_id) ps
  ON CONFLICT (user_id)
  DO UPDATE SET
    wins_total = player_stats.wins_total + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    losses_total = player_stats.losses_total + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    current_win_streak = v_current_streak,
    best_win_streak = v_best_streak,
    total_matches = player_stats.total_matches + 1,
    total_180s = player_stats.total_180s + (p_player_stats->>'visits180')::INTEGER,
    total_checkouts = player_stats.total_checkouts + COALESCE((p_player_stats->>'checkoutsMade')::INTEGER, 0),
    total_checkout_attempts = player_stats.total_checkout_attempts + COALESCE((p_player_stats->>'dartsAtDouble')::INTEGER, 0),
    highest_checkout_ever = GREATEST(player_stats.highest_checkout_ever, COALESCE((p_player_stats->>'highestCheckout')::INTEGER, 0)),
    best_average_ever = GREATEST(player_stats.best_average_ever, (p_player_stats->>'threeDartAverage')::NUMERIC),
    most_180s_in_match = GREATEST(player_stats.most_180s_in_match, (p_player_stats->>'visits180')::INTEGER),
    last_5_results = v_last_5,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'xp_earned', v_xp_earned,
    'current_streak', v_current_streak,
    'best_streak', v_best_streak
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION record_dartbot_match_with_xp TO authenticated;

-- ============================================
-- DONE!
-- ============================================
SELECT 'DartBot recording updated to include streaks and stats!' as status;
