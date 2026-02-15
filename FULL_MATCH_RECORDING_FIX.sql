-- ============================================
-- FIVE01 Darts - FULL MATCH RECORDING FIX
-- Ensures all game results are recorded and stats updated properly
-- ============================================

-- ============================================
-- 1. Ensure all required tables exist
-- ============================================

-- Create matches table if not exists
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  match_type VARCHAR(50) NOT NULL,
  game_mode VARCHAR(10) NOT NULL,
  match_format VARCHAR(50) DEFAULT 'best-of-3',
  double_out BOOLEAN DEFAULT true,
  straight_in BOOLEAN DEFAULT true,
  status VARCHAR(20) DEFAULT 'pending',
  winner_id UUID REFERENCES auth.users(id),
  winner_name VARCHAR(100),
  player1_name VARCHAR(100),
  player2_name VARCHAR(100),
  player1_legs_won INTEGER DEFAULT 0,
  player2_legs_won INTEGER DEFAULT 0,
  opponent_id UUID REFERENCES auth.users(id),
  opponent_type VARCHAR(20),
  dartbot_level INTEGER,
  user_avg NUMERIC(5,2),
  opponent_avg NUMERIC(5,2),
  user_first9_avg NUMERIC(5,2),
  opponent_first9_avg NUMERIC(5,2),
  user_checkout_pct NUMERIC(5,2),
  opponent_checkout_pct NUMERIC(5,2),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  league_id UUID,
  tournament_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create match_players table if not exists  
CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  is_bot BOOLEAN DEFAULT false,
  bot_level INTEGER,
  seat INTEGER NOT NULL,
  player_name VARCHAR(100),
  starting_score INTEGER DEFAULT 501,
  final_score INTEGER DEFAULT 0,
  legs_won INTEGER DEFAULT 0,
  legs_lost INTEGER DEFAULT 0,
  checkout_attempts INTEGER DEFAULT 0,
  checkout_hits INTEGER DEFAULT 0,
  checkout_darts_attempted INTEGER DEFAULT 0,
  darts_thrown INTEGER DEFAULT 0,
  points_scored INTEGER DEFAULT 0,
  avg_3dart NUMERIC(5,2),
  first_9_dart_avg NUMERIC(5,2),
  highest_score INTEGER DEFAULT 0,
  highest_checkout INTEGER DEFAULT 0,
  count_100_plus INTEGER DEFAULT 0,
  count_140_plus INTEGER DEFAULT 0,
  count_180 INTEGER DEFAULT 0,
  checkout_percentage NUMERIC(5,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create match_history table if not exists
CREATE TABLE IF NOT EXISTS match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id VARCHAR(100),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES auth.users(id),
  game_mode INTEGER DEFAULT 501,
  match_format VARCHAR(50) DEFAULT 'quick',
  result VARCHAR(10) NOT NULL,
  legs_won INTEGER DEFAULT 0,
  legs_lost INTEGER DEFAULT 0,
  three_dart_avg NUMERIC(5,2),
  first9_avg NUMERIC(5,2),
  highest_checkout INTEGER DEFAULT 0,
  checkout_percentage NUMERIC(5,2),
  darts_thrown INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  total_checkouts INTEGER DEFAULT 0,
  checkout_attempts INTEGER DEFAULT 0,
  visits_100_plus INTEGER DEFAULT 0,
  visits_140_plus INTEGER DEFAULT 0,
  visits_180 INTEGER DEFAULT 0,
  bot_level INTEGER,
  xp_earned INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_stats table if not exists
CREATE TABLE IF NOT EXISTS user_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_matches INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  total_180s INTEGER DEFAULT 0,
  total_checkout_attempts INTEGER DEFAULT 0,
  total_checkouts_made INTEGER DEFAULT 0,
  highest_checkout INTEGER DEFAULT 0,
  best_average NUMERIC(5,2) DEFAULT 0,
  best_first9_average NUMERIC(5,2) DEFAULT 0,
  total_100_plus INTEGER DEFAULT 0,
  total_140_plus INTEGER DEFAULT 0,
  total_points_scored INTEGER DEFAULT 0,
  total_darts_thrown INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create player_stats table if not exists (for dashboard/win streaks)
CREATE TABLE IF NOT EXISTS player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  wins_total INTEGER DEFAULT 0,
  losses_total INTEGER DEFAULT 0,
  current_win_streak INTEGER DEFAULT 0,
  best_win_streak INTEGER DEFAULT 0,
  total_matches INTEGER DEFAULT 0,
  total_180s INTEGER DEFAULT 0,
  total_checkouts INTEGER DEFAULT 0,
  total_checkout_attempts INTEGER DEFAULT 0,
  highest_checkout_ever INTEGER DEFAULT 0,
  best_average_ever NUMERIC(5,2) DEFAULT 0,
  most_180s_in_match INTEGER DEFAULT 0,
  last_5_results TEXT[], -- Array of 'W' or 'L'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. Enable RLS on all tables
-- ============================================
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. Create RLS Policies
-- ============================================

-- Matches policies
DROP POLICY IF EXISTS "Users can view their own matches" ON matches;
CREATE POLICY "Users can view their own matches"
  ON matches FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own matches" ON matches;
CREATE POLICY "Users can insert their own matches"
  ON matches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Match players policies
DROP POLICY IF EXISTS "Users can view match players" ON match_players;
CREATE POLICY "Users can view match players"
  ON match_players FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = match_players.match_id AND matches.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can insert match players" ON match_players;
CREATE POLICY "Users can insert match players"
  ON match_players FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM matches WHERE matches.id = match_players.match_id AND matches.user_id = auth.uid()
  ));

-- Match history policies
DROP POLICY IF EXISTS "Users can view their own match history" ON match_history;
CREATE POLICY "Users can view their own match history"
  ON match_history FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own match history" ON match_history;
CREATE POLICY "Users can insert their own match history"
  ON match_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User stats policies
DROP POLICY IF EXISTS "Users can view their own stats" ON user_stats;
CREATE POLICY "Users can view their own stats"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stats" ON user_stats;
CREATE POLICY "Users can update their own stats"
  ON user_stats FOR ALL
  USING (auth.uid() = user_id);

-- Player stats policies
DROP POLICY IF EXISTS "Users can view their own player stats" ON player_stats;
CREATE POLICY "Users can view their own player stats"
  ON player_stats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own player stats" ON player_stats;
CREATE POLICY "Users can update their own player stats"
  ON player_stats FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 4. Function to record match and update stats
-- ============================================
CREATE OR REPLACE FUNCTION record_complete_match(
  p_user_id UUID,
  p_match_type VARCHAR(50),
  p_game_mode VARCHAR(10),
  p_match_format VARCHAR(50),
  p_opponent_id UUID,
  p_opponent_name VARCHAR(100),
  p_opponent_is_bot BOOLEAN,
  p_bot_level INTEGER,
  p_winner VARCHAR(10), -- 'user' or 'opponent'
  p_user_stats JSONB,
  p_opponent_stats JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_match_id UUID;
  v_is_win BOOLEAN;
  v_current_streak INTEGER;
  v_best_streak INTEGER;
  v_last_5 TEXT[];
BEGIN
  v_is_win := p_winner = 'user';
  
  -- Insert match
  INSERT INTO matches (
    user_id, match_type, game_mode, match_format, status,
    winner_id, winner_name, player1_name, player2_name,
    player1_legs_won, player2_legs_won,
    opponent_id, opponent_type, dartbot_level,
    user_avg, opponent_avg, user_first9_avg, opponent_first9_avg,
    user_checkout_pct, opponent_checkout_pct,
    started_at, completed_at
  ) VALUES (
    p_user_id, p_match_type, p_game_mode, p_match_format, 'completed',
    CASE WHEN v_is_win THEN p_user_id ELSE p_opponent_id END,
    CASE WHEN v_is_win THEN 'You' ELSE p_opponent_name END,
    'You', p_opponent_name,
    (p_user_stats->>'legsWon')::INTEGER, (p_opponent_stats->>'legsWon')::INTEGER,
    p_opponent_id, CASE WHEN p_opponent_is_bot THEN 'dartbot' ELSE 'user' END, p_bot_level,
    (p_user_stats->>'threeDartAvg')::NUMERIC, (p_opponent_stats->>'threeDartAvg')::NUMERIC,
    (p_user_stats->>'first9Avg')::NUMERIC, (p_opponent_stats->>'first9Avg')::NUMERIC,
    (p_user_stats->>'checkoutPercent')::NUMERIC, (p_opponent_stats->>'checkoutPercent')::NUMERIC,
    NOW(), NOW()
  )
  RETURNING id INTO v_match_id;
  
  -- Insert match_history for easy querying
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg,
    highest_checkout, checkout_percentage, darts_thrown, total_score,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, bot_level, played_at
  ) VALUES (
    v_match_id::TEXT, p_user_id, p_opponent_id, (p_game_mode)::INTEGER, 
    CASE WHEN p_opponent_is_bot THEN 'dartbot' ELSE p_match_type END,
    CASE WHEN v_is_win THEN 'win' ELSE 'loss' END,
    (p_user_stats->>'legsWon')::INTEGER, (p_opponent_stats->>'legsWon')::INTEGER,
    (p_user_stats->>'threeDartAvg')::NUMERIC, (p_user_stats->>'first9Avg')::NUMERIC,
    (p_user_stats->>'highestCheckout')::INTEGER, (p_user_stats->>'checkoutPercent')::NUMERIC,
    (p_user_stats->>'dartsThrown')::INTEGER, (p_user_stats->>'pointsScored')::INTEGER,
    (p_user_stats->>'checkoutsMade')::INTEGER, (p_user_stats->>'checkoutDartsAttempted')::INTEGER,
    (p_user_stats->>'count100Plus')::INTEGER, (p_user_stats->>'count140Plus')::INTEGER,
    (p_user_stats->>'count180')::INTEGER, p_bot_level, NOW()
  );
  
  -- Update or insert user_stats
  INSERT INTO user_stats (
    user_id, total_matches, wins, losses, total_180s,
    total_checkout_attempts, total_checkouts_made, highest_checkout,
    best_average, best_first9_average, total_100_plus, total_140_plus,
    total_points_scored, total_darts_thrown, updated_at
  )
  SELECT
    p_user_id,
    COALESCE(us.total_matches, 0) + 1,
    COALESCE(us.wins, 0) + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    COALESCE(us.losses, 0) + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    COALESCE(us.total_180s, 0) + (p_user_stats->>'count180')::INTEGER,
    COALESCE(us.total_checkout_attempts, 0) + (p_user_stats->>'checkoutDartsAttempted')::INTEGER,
    COALESCE(us.total_checkouts_made, 0) + (p_user_stats->>'checkoutsMade')::INTEGER,
    GREATEST(COALESCE(us.highest_checkout, 0), (p_user_stats->>'highestCheckout')::INTEGER),
    GREATEST(COALESCE(us.best_average, 0), (p_user_stats->>'threeDartAvg')::NUMERIC),
    GREATEST(COALESCE(us.best_first9_average, 0), (p_user_stats->>'first9Avg')::NUMERIC),
    COALESCE(us.total_100_plus, 0) + (p_user_stats->>'count100Plus')::INTEGER,
    COALESCE(us.total_140_plus, 0) + (p_user_stats->>'count140Plus')::INTEGER,
    COALESCE(us.total_points_scored, 0) + COALESCE((p_user_stats->>'pointsScored')::INTEGER, 0),
    COALESCE(us.total_darts_thrown, 0) + COALESCE((p_user_stats->>'dartsThrown')::INTEGER, 0),
    NOW()
  FROM (SELECT * FROM user_stats WHERE user_id = p_user_id) us
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = user_stats.total_matches + 1,
    wins = user_stats.wins + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    losses = user_stats.losses + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    total_180s = user_stats.total_180s + (p_user_stats->>'count180')::INTEGER,
    total_checkout_attempts = user_stats.total_checkout_attempts + (p_user_stats->>'checkoutDartsAttempted')::INTEGER,
    total_checkouts_made = user_stats.total_checkouts_made + (p_user_stats->>'checkoutsMade')::INTEGER,
    highest_checkout = GREATEST(user_stats.highest_checkout, (p_user_stats->>'highestCheckout')::INTEGER),
    best_average = GREATEST(user_stats.best_average, (p_user_stats->>'threeDartAvg')::NUMERIC),
    best_first9_average = GREATEST(user_stats.best_first9_average, (p_user_stats->>'first9Avg')::NUMERIC),
    total_100_plus = user_stats.total_100_plus + (p_user_stats->>'count100Plus')::INTEGER,
    total_140_plus = user_stats.total_140_plus + (p_user_stats->>'count140Plus')::INTEGER,
    total_points_scored = user_stats.total_points_scored + COALESCE((p_user_stats->>'pointsScored')::INTEGER, 0),
    total_darts_thrown = user_stats.total_darts_thrown + COALESCE((p_user_stats->>'dartsThrown')::INTEGER, 0),
    updated_at = NOW();
  
  -- Get current streak data
  SELECT current_win_streak, best_win_streak, last_5_results
  INTO v_current_streak, v_best_streak, v_last_5
  FROM player_stats
  WHERE user_id = p_user_id;
  
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
    p_user_id,
    COALESCE(ps.wins_total, 0) + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    COALESCE(ps.losses_total, 0) + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    v_current_streak,
    v_best_streak,
    COALESCE(ps.total_matches, 0) + 1,
    COALESCE(ps.total_180s, 0) + (p_user_stats->>'count180')::INTEGER,
    COALESCE(ps.total_checkouts, 0) + (p_user_stats->>'checkoutsMade')::INTEGER,
    COALESCE(ps.total_checkout_attempts, 0) + (p_user_stats->>'checkoutDartsAttempted')::INTEGER,
    GREATEST(COALESCE(ps.highest_checkout_ever, 0), (p_user_stats->>'highestCheckout')::INTEGER),
    GREATEST(COALESCE(ps.best_average_ever, 0), (p_user_stats->>'threeDartAvg')::NUMERIC),
    GREATEST(COALESCE(ps.most_180s_in_match, 0), (p_user_stats->>'count180')::INTEGER),
    v_last_5,
    NOW()
  FROM (SELECT * FROM player_stats WHERE user_id = p_user_id) ps
  ON CONFLICT (user_id)
  DO UPDATE SET
    wins_total = player_stats.wins_total + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    losses_total = player_stats.losses_total + CASE WHEN v_is_win THEN 0 ELSE 1 END,
    current_win_streak = v_current_streak,
    best_win_streak = v_best_streak,
    total_matches = player_stats.total_matches + 1,
    total_180s = player_stats.total_180s + (p_user_stats->>'count180')::INTEGER,
    total_checkouts = player_stats.total_checkouts + (p_user_stats->>'checkoutsMade')::INTEGER,
    total_checkout_attempts = player_stats.total_checkout_attempts + (p_user_stats->>'checkoutDartsAttempted')::INTEGER,
    highest_checkout_ever = GREATEST(player_stats.highest_checkout_ever, (p_user_stats->>'highestCheckout')::INTEGER),
    best_average_ever = GREATEST(player_stats.best_average_ever, (p_user_stats->>'threeDartAvg')::NUMERIC),
    most_180s_in_match = GREATEST(player_stats.most_180s_in_match, (p_user_stats->>'count180')::INTEGER),
    last_5_results = v_last_5,
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'is_win', v_is_win,
    'current_streak', v_current_streak,
    'best_streak', v_best_streak
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Function to get recent matches with all details
-- ============================================
CREATE OR REPLACE FUNCTION get_recent_matches(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  room_id TEXT,
  opponent_id UUID,
  opponent_name TEXT,
  game_mode INTEGER,
  match_format TEXT,
  result TEXT,
  legs_won INTEGER,
  legs_lost INTEGER,
  three_dart_avg NUMERIC,
  highest_checkout INTEGER,
  played_at TIMESTAMP WITH TIME ZONE,
  bot_level INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mh.id,
    mh.room_id::TEXT,
    mh.opponent_id,
    CASE 
      WHEN mh.match_format = 'dartbot' THEN 'DartBot'
      ELSE COALESCE(u.username, 'Unknown')
    END::TEXT as opponent_name,
    mh.game_mode,
    mh.match_format::TEXT,
    mh.result::TEXT,
    mh.legs_won,
    mh.legs_lost,
    mh.three_dart_avg,
    mh.highest_checkout,
    mh.played_at,
    mh.bot_level
  FROM match_history mh
  LEFT JOIN users u ON u.id = mh.opponent_id
  WHERE mh.user_id = p_user_id
  ORDER BY mh.played_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to get dashboard stats
-- ============================================
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_today_matches INTEGER;
  v_today_wins INTEGER;
  v_current_streak INTEGER;
  v_last_5 TEXT[];
  v_avg_3dart NUMERIC;
BEGIN
  -- Today's matches
  SELECT COUNT(*), COUNT(*) FILTER (WHERE result = 'win')
  INTO v_today_matches, v_today_wins
  FROM match_history
  WHERE user_id = p_user_id
    AND played_at >= CURRENT_DATE;
  
  -- Current streak and last 5
  SELECT current_win_streak, last_5_results
  INTO v_current_streak, v_last_5
  FROM player_stats
  WHERE user_id = p_user_id;
  
  -- Average from last 10 matches
  SELECT AVG(three_dart_avg)
  INTO v_avg_3dart
  FROM (
    SELECT three_dart_avg
    FROM match_history
    WHERE user_id = p_user_id
    ORDER BY played_at DESC
    LIMIT 10
  ) recent;
  
  RETURN jsonb_build_object(
    'today_matches', COALESCE(v_today_matches, 0),
    'today_wins', COALESCE(v_today_wins, 0),
    'current_streak', COALESCE(v_current_streak, 0),
    'last_5_results', COALESCE(v_last_5, ARRAY[]::TEXT[]),
    'avg_3dart', COALESCE(ROUND(v_avg_3dart, 1), 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION record_complete_match TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_matches TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;

-- ============================================
-- 8. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_completed_at ON matches(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_played_at ON match_history(user_id, played_at DESC);
-- Note: Partial index with CURRENT_DATE removed (not immutable)
CREATE INDEX IF NOT EXISTS idx_match_history_played_at_desc ON match_history(user_id, played_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON player_stats(user_id);

-- ============================================
-- DONE!
-- ============================================
SELECT 'Full match recording fix applied successfully!' as status;
