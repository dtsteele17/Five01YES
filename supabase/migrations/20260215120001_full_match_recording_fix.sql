-- ============================================
-- FIVE01 Darts - FULL MATCH RECORDING FIX
-- Captures ALL game results to proper tables
-- ============================================

-- ============================================
-- 0. Drop views if they exist (to avoid conflicts)
-- ============================================
DROP VIEW IF EXISTS v_matches CASCADE;
DROP VIEW IF EXISTS matches_view CASCADE;
DROP VIEW IF EXISTS match_summary CASCADE;

-- Drop the matches view if it exists (we need the table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'matches' AND schemaname = 'public') THEN
    DROP VIEW IF EXISTS matches CASCADE;
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'matches' AND schemaname = 'public') THEN
    -- Table exists, keep it
    NULL;
  END IF;
END $$;

-- ============================================
-- 1. Enhanced player_stats with win streaks
-- ============================================
ALTER TABLE player_stats 
ADD COLUMN IF NOT EXISTS current_win_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_win_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_5_results TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ============================================
-- 2. Function to update player streaks after match
-- ============================================
CREATE OR REPLACE FUNCTION update_player_streaks(
  p_user_id UUID,
  p_result VARCHAR(10)
)
RETURNS VOID AS $$
DECLARE
  v_current_streak INTEGER;
  v_best_streak INTEGER;
  v_last_5 TEXT[];
BEGIN
  -- Get current values
  SELECT current_win_streak, best_win_streak, last_5_results
  INTO v_current_streak, v_best_streak, v_last_5
  FROM player_stats
  WHERE user_id = p_user_id;

  -- Update streak
  IF p_result = 'win' THEN
    v_current_streak := COALESCE(v_current_streak, 0) + 1;
    IF v_current_streak > COALESCE(v_best_streak, 0) THEN
      v_best_streak := v_current_streak;
    END IF;
  ELSE
    v_current_streak := 0;
  END IF;

  -- Update last 5 results (prepend, keep only 5)
  v_last_5 := ARRAY_PREPEND(p_result::text, COALESCE(v_last_5, ARRAY[]::text[]));
  IF array_length(v_last_5, 1) > 5 THEN
    v_last_5 := v_last_5[1:5];
  END IF;

  -- Update player_stats
  UPDATE player_stats
  SET 
    current_win_streak = v_current_streak,
    best_win_streak = v_best_streak,
    last_5_results = v_last_5,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- If no row exists, insert one
  IF NOT FOUND THEN
    INSERT INTO player_stats (
      user_id,
      current_win_streak,
      best_win_streak,
      last_5_results,
      updated_at
    ) VALUES (
      p_user_id,
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      ARRAY[p_result::text],
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Comprehensive function to record ANY match completion
-- ============================================
CREATE OR REPLACE FUNCTION record_match_completion(
  p_user_id UUID,
  p_opponent_id TEXT,
  p_game_mode INTEGER,
  p_match_format VARCHAR(50),
  p_result VARCHAR(10),
  p_player_stats JSONB,
  p_xp_earned INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_room_id TEXT;
  v_match_id UUID;
  v_legs_won INTEGER;
  v_legs_lost INTEGER;
BEGIN
  -- Generate room_id
  v_room_id := p_match_format || '_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6);
  
  -- Extract leg counts from stats if available
  v_legs_won := COALESCE((p_player_stats->>'legsWon')::integer, 
                         CASE WHEN p_result = 'win' THEN 1 ELSE 0 END);
  v_legs_lost := COALESCE((p_player_stats->>'legsLost')::integer,
                          CASE WHEN p_result = 'win' THEN 0 ELSE 1 END);

  -- Create match record
  INSERT INTO matches (
    id,
    room_id,
    game_mode,
    match_format,
    status,
    winner_id,
    created_at,
    updated_at,
    completed_at
  ) VALUES (
    gen_random_uuid(),
    v_room_id,
    p_game_mode,
    p_match_format,
    'completed',
    CASE WHEN p_result = 'win' THEN p_user_id::text ELSE p_opponent_id END,
    NOW() - INTERVAL '10 minutes',
    NOW(),
    NOW()
  )
  RETURNING id INTO v_match_id;

  -- Insert player record
  INSERT INTO match_players (
    match_id,
    user_id,
    player_number,
    legs_won,
    total_score,
    darts_thrown,
    three_dart_avg,
    first9_avg,
    highest_checkout,
    checkout_percentage,
    darts_at_double,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    created_at
  ) VALUES (
    v_match_id,
    p_user_id,
    1,
    v_legs_won,
    COALESCE((p_player_stats->>'totalScore')::integer, 0),
    COALESCE((p_player_stats->>'totalDartsThrown')::integer, 
             (p_player_stats->>'dartsThrown')::integer, 0),
    COALESCE((p_player_stats->>'threeDartAverage')::numeric,
             (p_player_stats->>'average')::numeric, 0),
    COALESCE((p_player_stats->>'first9Average')::numeric,
             (p_player_stats->>'first9Avg')::numeric, 0),
    COALESCE((p_player_stats->>'highestCheckout')::integer, 0),
    COALESCE((p_player_stats->>'checkoutPercentage')::numeric, 0),
    COALESCE((p_player_stats->>'dartsAtDouble')::integer, 0),
    COALESCE((p_player_stats->>'visits100Plus')::integer, 0),
    COALESCE((p_player_stats->>'visits140Plus')::integer, 0),
    COALESCE((p_player_stats->>'visits180')::integer, 0),
    NOW()
  );

  -- Insert opponent record (may be NULL for dartbot/training)
  IF p_opponent_id IS NOT NULL AND p_opponent_id != 'dartbot' AND p_opponent_id != 'training' THEN
    INSERT INTO match_players (
      match_id,
      user_id,
      player_number,
      legs_won,
      created_at
    ) VALUES (
      v_match_id,
      p_opponent_id::uuid,
      2,
      v_legs_lost,
      NOW()
    );
  END IF;

  -- Record to match_history for unified stats
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
    p_user_id,
    v_room_id,
    p_opponent_id,
    p_game_mode,
    p_match_format,
    p_result,
    v_legs_won,
    v_legs_lost,
    COALESCE((p_player_stats->>'threeDartAverage')::numeric,
             (p_player_stats->>'average')::numeric, 0),
    COALESCE((p_player_stats->>'first9Average')::numeric,
             (p_player_stats->>'first9Avg')::numeric, 0),
    COALESCE((p_player_stats->>'highestCheckout')::integer, 0),
    COALESCE((p_player_stats->>'checkoutPercentage')::numeric, 0),
    COALESCE((p_player_stats->>'totalDartsThrown')::integer,
             (p_player_stats->>'dartsThrown')::integer, 0),
    COALESCE((p_player_stats->>'totalScore')::integer, 0),
    COALESCE((p_player_stats->>'visits100Plus')::integer, 0),
    COALESCE((p_player_stats->>'visits140Plus')::integer, 0),
    COALESCE((p_player_stats->>'visits180')::integer, 0),
    COALESCE(p_metadata->>'botLevel', '0')::integer,
    p_xp_earned,
    NOW(),
    jsonb_build_object(
      'match_format', p_match_format,
      'match_id', v_match_id,
      'xp_breakdown', p_metadata->'xp_breakdown',
      'bot_stats', p_metadata->'bot_stats'
    )
  );

  -- Update user_stats (aggregated stats)
  INSERT INTO user_stats (
    user_id,
    total_matches,
    wins,
    losses,
    total_darts,
    total_score,
    average,
    updated_at
  ) VALUES (
    p_user_id,
    1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'win' THEN 0 ELSE 1 END,
    COALESCE((p_player_stats->>'totalDartsThrown')::integer,
             (p_player_stats->>'dartsThrown')::integer, 0),
    COALESCE((p_player_stats->>'totalScore')::integer, 0),
    COALESCE((p_player_stats->>'threeDartAverage')::numeric,
             (p_player_stats->>'average')::numeric, 0),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = user_stats.total_matches + 1,
    wins = user_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    losses = user_stats.losses + CASE WHEN p_result = 'win' THEN 0 ELSE 1 END,
    total_darts = user_stats.total_darts + COALESCE((p_player_stats->>'totalDartsThrown')::integer,
                                                    (p_player_stats->>'dartsThrown')::integer, 0),
    total_score = user_stats.total_score + COALESCE((p_player_stats->>'totalScore')::integer, 0),
    average = (user_stats.total_score + COALESCE((p_player_stats->>'totalScore')::integer, 0))::numeric / 
              NULLIF((user_stats.total_darts + COALESCE((p_player_stats->>'totalDartsThrown')::integer,
                                                        (p_player_stats->>'dartsThrown')::integer, 0)), 0) * 3,
    updated_at = NOW();

  -- Update player_stats (with streaks)
  PERFORM update_player_streaks(p_user_id, p_result);

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'room_id', v_room_id,
    'result', p_result,
    'xp_earned', p_xp_earned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Function to get today's stats
-- ============================================
CREATE OR REPLACE FUNCTION get_today_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_matches INTEGER;
  v_wins INTEGER;
  v_streak INTEGER;
  v_avg NUMERIC;
BEGIN
  -- Today's matches
  SELECT COUNT(*), COUNT(*) FILTER (WHERE result = 'win')
  INTO v_matches, v_wins
  FROM match_history
  WHERE user_id = p_user_id
    AND played_at >= CURRENT_DATE
    AND played_at < CURRENT_DATE + INTERVAL '1 day';

  -- Current win streak
  SELECT current_win_streak INTO v_streak
  FROM player_stats
  WHERE user_id = p_user_id;

  -- Today's average
  SELECT AVG(three_dart_avg)
  INTO v_avg
  FROM match_history
  WHERE user_id = p_user_id
    AND played_at >= CURRENT_DATE
    AND played_at < CURRENT_DATE + INTERVAL '1 day';

  RETURN jsonb_build_object(
    'matches', COALESCE(v_matches, 0),
    'wins', COALESCE(v_wins, 0),
    'losses', COALESCE(v_matches, 0) - COALESCE(v_wins, 0),
    'streak', COALESCE(v_streak, 0),
    'average', ROUND(COALESCE(v_avg, 0)::numeric, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Function to get recent matches with proper formatting
-- ============================================
CREATE OR REPLACE FUNCTION get_recent_matches(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_format VARCHAR(50) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'room_id', room_id,
      'opponent_id', opponent_id,
      'opponent_name', CASE 
        WHEN opponent_id = 'dartbot' THEN 'DartBot (Level ' || COALESCE(bot_level::text, '?') || ')'
        WHEN opponent_id = 'training' THEN 'Training Mode'
        ELSE opponent_id
      END,
      'game_mode', game_mode,
      'match_format', match_format,
      'result', result,
      'legs_won', legs_won,
      'legs_lost', legs_lost,
      'three_dart_avg', three_dart_avg,
      'highest_checkout', highest_checkout,
      'xp_earned', xp_earned,
      'played_at', played_at,
      'is_bot_match', opponent_id = 'dartbot',
      'is_training', opponent_id = 'training'
    ) ORDER BY played_at DESC
  )
  INTO v_result
  FROM match_history
  WHERE user_id = p_user_id
    AND (p_format IS NULL OR match_format = p_format)
  LIMIT p_limit;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION update_player_streaks TO authenticated;
GRANT EXECUTE ON FUNCTION record_match_completion TO authenticated;
GRANT EXECUTE ON FUNCTION get_today_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_matches TO authenticated;

-- ============================================
-- 7. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON match_history(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_today ON match_history(user_id, played_at) 
  WHERE played_at >= CURRENT_DATE;
CREATE INDEX IF NOT EXISTS idx_player_stats_streak ON player_stats(user_id, current_win_streak);

-- ============================================
-- DONE!
-- ============================================
SELECT 'Full match recording fix applied successfully!' as status;
