-- ============================================
-- FIVE01 Darts - XP System & Stats Recording Fix
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Ensure match_history has XP column
-- ============================================
ALTER TABLE match_history 
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0;

-- ============================================
-- 2. Update training_stats table to have XP tracking
-- ============================================
ALTER TABLE training_stats 
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS training_mode VARCHAR(50) DEFAULT 'practice';

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
BEGIN
  -- Insert into training_stats
  INSERT INTO training_stats (
    player_id,
    game_type,
    training_mode,
    score,
    completed,
    xp_earned,
    session_data
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
    )
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
    bot_level,
    xp_earned,
    played_at
  ) VALUES (
    p_player_id,
    'training_' || extract(epoch from now()),
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
    NULL,
    p_xp_earned,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'xp_earned', p_xp_earned,
    'training_mode', p_training_mode
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
    v_performance_bonus := v_base_xp * 0.5; -- +50%
  ELSIF v_avg >= 75 THEN
    v_performance_bonus := v_base_xp * 0.25; -- +25%
  ELSIF v_avg >= 60 THEN
    v_performance_bonus := v_base_xp * 0.1; -- +10%
  ELSIF v_avg < 30 THEN
    v_performance_bonus := -v_base_xp * 0.25; -- -25%
  END IF;

  -- Win bonus
  IF p_winner = 'player' THEN
    v_win_bonus := v_base_xp * 0.15;
  END IF;

  -- Calculate total XP (minimum 10)
  v_xp_earned := GREATEST(10, v_base_xp + v_performance_bonus + v_win_bonus);

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
    'dartbot_' || extract(epoch from now()),
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
    'room_id', 'dartbot_' || extract(epoch from now()),
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
BEGIN
  -- Get total XP
  v_total_xp := get_player_total_xp(p_user_id);
  
  -- Calculate level
  -- Formula: Total XP to reach level N = (N-1) * (50 + 25 * N)
  -- Level 1: 0 XP
  -- Level 2: 100 XP
  -- Level 3: 250 XP
  WHILE (v_level * (50 + 25 * (v_level + 1))) <= v_total_xp LOOP
    v_level := v_level + 1;
  END LOOP;

  -- Calculate progress to next level
  v_xp_for_next := v_level * (50 + 25 * (v_level + 1));
  v_xp_into_level := v_total_xp - ((v_level - 1) * (50 + 25 * v_level));
  v_progress := CASE 
    WHEN v_xp_for_next > 0 THEN 
      LEAST(100, GREATEST(0, (v_xp_into_level * 100 / v_xp_for_next)))
    ELSE 100 
  END;

  RETURN jsonb_build_object(
    'level', v_level,
    'total_xp', v_total_xp,
    'xp_to_next', v_xp_for_next - v_total_xp,
    'progress', v_progress
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. Update match_history view or permissions if needed
-- ============================================
-- Ensure RLS allows inserting training matches
DROP POLICY IF EXISTS "Users can insert their own match history" ON match_history;
CREATE POLICY "Users can insert their own match history"
  ON match_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- DONE!
-- ============================================
SELECT 'XP and Stats fix applied successfully!' as status;
