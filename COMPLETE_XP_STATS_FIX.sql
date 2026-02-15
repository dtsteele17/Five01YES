-- ============================================
-- FIVE01 Darts - COMPLETE XP & STATS FIX
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Create training_stats table if it doesn't exist
-- ============================================
CREATE TABLE IF NOT EXISTS training_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL,
  training_mode VARCHAR(50) DEFAULT 'practice',
  score INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  xp_earned INTEGER DEFAULT 0,
  session_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on training_stats
ALTER TABLE training_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for training_stats
DROP POLICY IF EXISTS "Users can view their own training stats" ON training_stats;
CREATE POLICY "Users can view their own training stats"
  ON training_stats FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Users can insert their own training stats" ON training_stats;
CREATE POLICY "Users can insert their own training stats"
  ON training_stats FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- ============================================
-- 2. Ensure match_history has all necessary columns
-- ============================================
ALTER TABLE match_history 
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bot_level INTEGER,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- 3. Function to record training mode match with XP
-- ============================================
CREATE OR REPLACE FUNCTION record_training_match(
  p_player_id UUID,
  p_training_mode VARCHAR(50),
  p_game_mode INTEGER DEFAULT 501,
  p_score INTEGER DEFAULT 0,
  p_completed BOOLEAN DEFAULT true,
  p_won BOOLEAN DEFAULT true,
  p_session_data JSONB DEFAULT '{}'::jsonb,
  p_xp_earned INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_room_id TEXT;
BEGIN
  v_room_id := 'training_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6);

  -- Insert into training_stats
  INSERT INTO training_stats (
    player_id,
    game_type,
    training_mode,
    score,
    completed,
    xp_earned,
    session_data,
    created_at
  ) VALUES (
    p_player_id,
    p_training_mode,
    p_training_mode,
    p_score,
    p_completed,
    p_xp_earned,
    jsonb_build_object(
      'score', p_score,
      'completed', p_completed,
      'won', p_won,
      'xp_earned', p_xp_earned,
      'session_data', p_session_data
    ),
    NOW()
  );

  -- Also record to match_history for unified stats
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
    xp_earned,
    played_at,
    metadata
  ) VALUES (
    p_player_id,
    v_room_id,
    'training',
    p_game_mode,
    p_training_mode,
    CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    CASE WHEN p_won THEN 1 ELSE 0 END,
    CASE WHEN p_won THEN 0 ELSE 1 END,
    COALESCE((p_session_data->>'average')::numeric, 0),
    COALESCE((p_session_data->>'first9Avg')::numeric, 0),
    COALESCE((p_session_data->>'highestCheckout')::integer, 0),
    COALESCE((p_session_data->>'checkoutPercentage')::numeric, 0),
    COALESCE((p_session_data->>'totalDarts')::integer, 0),
    p_score,
    COALESCE((p_session_data->>'visits100Plus')::integer, 0),
    COALESCE((p_session_data->>'visits140Plus')::integer, 0),
    COALESCE((p_session_data->>'visits180')::integer, 0),
    p_xp_earned,
    NOW(),
    jsonb_build_object(
      'training_mode', p_training_mode,
      'xp_breakdown', jsonb_build_object('total', p_xp_earned)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'xp_earned', p_xp_earned,
    'training_mode', p_training_mode,
    'room_id', v_room_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Enhanced function to record dartbot match with XP
-- ============================================
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
BEGIN
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
  IF p_winner = 'player' THEN
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
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
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

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'xp_earned', v_xp_earned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Function to get player total XP
-- ============================================
CREATE OR REPLACE FUNCTION get_player_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_total_xp INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(xp_earned), 0)
  INTO v_total_xp
  FROM match_history
  WHERE user_id = p_user_id;

  RETURN v_total_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Function to get player training level
-- ============================================
CREATE OR REPLACE FUNCTION get_player_training_level(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total_xp INTEGER;
  v_level INTEGER := 1;
  v_xp_for_next INTEGER;
  v_xp_into_level INTEGER;
  v_progress INTEGER;
  v_old_level INTEGER := 1;
BEGIN
  -- Get total XP
  v_total_xp := get_player_total_xp(p_user_id);
  
  -- Calculate level
  -- Formula: Level N requires (N-1) * (50 + 25 * N) total XP
  -- Level 1: 0 XP
  -- Level 2: 100 XP
  -- Level 3: 250 XP
  v_level := 1;
  WHILE (v_level * (50 + 25 * (v_level + 1))) <= v_total_xp LOOP
    v_level := v_level + 1;
  END LOOP;

  -- Calculate progress to next level
  v_xp_for_next := v_level * (50 + 25 * (v_level + 1));
  v_xp_into_level := v_total_xp - ((v_level - 1) * (50 + 25 * v_level));
  v_progress := CASE 
    WHEN v_xp_for_next > 0 THEN 
      LEAST(100, GREATEST(0, ROUND((v_xp_into_level::numeric * 100 / (v_xp_for_next - (v_level - 1) * (50 + 25 * v_level))))))
    ELSE 100 
  END;

  RETURN jsonb_build_object(
    'level', v_level,
    'total_xp', v_total_xp,
    'xp_to_next', v_xp_for_next - v_total_xp,
    'progress', v_progress,
    'leveled_up', v_level > v_old_level,
    'old_level', v_old_level,
    'new_level', v_level
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Grant execute permissions
-- ============================================
GRANT EXECUTE ON FUNCTION record_training_match TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_with_xp TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_total_xp TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_training_level TO authenticated;

-- ============================================
-- 8. Update RLS policies for match_history
-- ============================================
DROP POLICY IF EXISTS "Users can insert their own match history" ON match_history;
CREATE POLICY "Users can insert their own match history"
  ON match_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own match history" ON match_history;
CREATE POLICY "Users can view their own match history"
  ON match_history FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- 9. Create index for faster queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_match_history_user_format ON match_history(user_id, match_format);
CREATE INDEX IF NOT EXISTS idx_match_history_user_xp ON match_history(user_id, xp_earned) WHERE xp_earned > 0;
CREATE INDEX IF NOT EXISTS idx_training_stats_player ON training_stats(player_id);

-- ============================================
-- DONE!
-- ============================================
SELECT 'Complete XP & Stats fix applied successfully!' as status;
