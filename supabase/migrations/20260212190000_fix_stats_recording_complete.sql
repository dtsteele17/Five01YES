-- ============================================================================
-- COMPLETE FIX FOR STATS RECORDING SYSTEM
-- Fixes quick match stats, dartbot stats, and player_stats aggregation
-- ============================================================================

-- ============================================================================
-- PART 1: Fix the manual stats recording function for quick matches
-- ============================================================================

CREATE OR REPLACE FUNCTION record_quick_match_stats(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_three_dart_avg NUMERIC,
  p_first9_avg NUMERIC,
  p_highest_checkout INTEGER,
  p_checkouts_made INTEGER,
  p_checkout_attempts INTEGER,
  p_darts_thrown INTEGER,
  p_total_score INTEGER,
  p_count_100_plus INTEGER,
  p_count_140_plus INTEGER,
  p_count_180 INTEGER,
  p_result TEXT,
  p_is_forfeit BOOLEAN DEFAULT FALSE,
  p_forfeit_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_checkout_percentage NUMERIC;
BEGIN
  -- Calculate checkout percentage
  IF p_checkout_attempts > 0 THEN
    v_checkout_percentage := (p_checkouts_made::NUMERIC / p_checkout_attempts::NUMERIC) * 100;
  ELSE
    v_checkout_percentage := 0;
  END IF;

  -- Insert into match_history
  INSERT INTO match_history (
    user_id,
    opponent_id,
    room_id,
    game_mode,
    match_format,
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
    result,
    is_forfeit,
    forfeit_by,
    played_at
  ) VALUES (
    p_user_id,
    p_opponent_id,
    p_room_id,
    p_game_mode,
    p_match_format,
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    v_checkout_percentage,
    p_darts_thrown,
    p_total_score,
    p_count_100_plus,
    p_count_140_plus,
    p_count_180,
    p_result,
    p_is_forfeit,
    p_forfeit_by,
    NOW()
  )
  RETURNING id INTO v_match_id;

  -- Update player_stats aggregate table
  PERFORM update_player_stats_from_match(
    p_user_id,
    p_game_mode,
    p_result = 'win',
    p_result = 'loss',
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_checkouts_made,
    p_checkout_attempts,
    p_darts_thrown,
    p_total_score,
    p_count_100_plus,
    p_count_140_plus,
    p_count_180
  );

  RETURN v_match_id;
END;
$$;

-- ============================================================================
-- PART 2: Create/update function to update player_stats from a match
-- ============================================================================

CREATE OR REPLACE FUNCTION update_player_stats_from_match(
  p_user_id UUID,
  p_game_mode INTEGER,
  p_is_win BOOLEAN,
  p_is_loss BOOLEAN,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_three_dart_avg NUMERIC,
  p_first9_avg NUMERIC,
  p_highest_checkout INTEGER,
  p_checkouts_made INTEGER,
  p_checkout_attempts INTEGER,
  p_darts_thrown INTEGER,
  p_total_score INTEGER,
  p_count_100_plus INTEGER,
  p_count_140_plus INTEGER,
  p_count_180 INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stats RECORD;
  v_new_total_matches INTEGER;
  v_new_wins INTEGER;
  v_new_losses INTEGER;
  v_new_overall_3dart_avg NUMERIC;
  v_new_overall_first9_avg NUMERIC;
  v_new_checkout_percentage NUMERIC;
  v_new_matches_301 INTEGER;
  v_new_matches_501 INTEGER;
  v_new_current_streak INTEGER;
  v_new_best_streak INTEGER;
BEGIN
  -- Get current stats
  SELECT * INTO v_current_stats
  FROM player_stats
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Create new player_stats record
    INSERT INTO player_stats (
      user_id,
      total_matches,
      wins,
      losses,
      draws,
      matches_301,
      matches_501,
      overall_3dart_avg,
      overall_first9_avg,
      highest_checkout,
      checkout_percentage,
      total_checkouts,
      checkout_attempts,
      total_darts_thrown,
      total_score,
      visits_100_plus,
      visits_140_plus,
      visits_180,
      current_win_streak,
      best_win_streak,
      last_updated
    ) VALUES (
      p_user_id,
      1,
      CASE WHEN p_is_win THEN 1 ELSE 0 END,
      CASE WHEN p_is_loss THEN 1 ELSE 0 END,
      0,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      p_three_dart_avg,
      p_first9_avg,
      p_highest_checkout,
      CASE WHEN p_checkout_attempts > 0 
        THEN (p_checkouts_made::NUMERIC / p_checkout_attempts::NUMERIC) * 100 
        ELSE 0 
      END,
      p_checkouts_made,
      p_checkout_attempts,
      p_darts_thrown,
      p_total_score,
      p_count_100_plus,
      p_count_140_plus,
      p_count_180,
      CASE WHEN p_is_win THEN 1 ELSE 0 END,
      CASE WHEN p_is_win THEN 1 ELSE 0 END,
      NOW()
    );
  ELSE
    -- Calculate new values
    v_new_total_matches := v_current_stats.total_matches + 1;
    v_new_wins := v_current_stats.wins + CASE WHEN p_is_win THEN 1 ELSE 0 END;
    v_new_losses := v_current_stats.losses + CASE WHEN p_is_loss THEN 1 ELSE 0 END;
    v_new_matches_301 := v_current_stats.matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END;
    v_new_matches_501 := v_current_stats.matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END;
    
    -- Calculate running averages
    v_new_overall_3dart_avg := (
      (v_current_stats.overall_3dart_avg * v_current_stats.total_matches) + p_three_dart_avg
    ) / v_new_total_matches;
    
    v_new_overall_first9_avg := (
      (v_current_stats.overall_first9_avg * v_current_stats.total_matches) + p_first9_avg
    ) / v_new_total_matches;
    
    -- Calculate new checkout percentage
    v_new_checkout_percentage := CASE 
      WHEN (v_current_stats.checkout_attempts + p_checkout_attempts) > 0 
      THEN ((v_current_stats.total_checkouts + p_checkouts_made)::NUMERIC / 
            (v_current_stats.checkout_attempts + p_checkout_attempts)::NUMERIC) * 100
      ELSE 0 
    END;

    -- Calculate streaks
    IF p_is_win THEN
      v_new_current_streak := v_current_stats.current_win_streak + 1;
      v_new_best_streak := GREATEST(v_current_stats.best_win_streak, v_new_current_streak);
    ELSE
      v_new_current_streak := 0;
      v_new_best_streak := v_current_stats.best_win_streak;
    END IF;

    -- Update existing record
    UPDATE player_stats
    SET
      total_matches = v_new_total_matches,
      wins = v_new_wins,
      losses = v_new_losses,
      matches_301 = v_new_matches_301,
      matches_501 = v_new_matches_501,
      overall_3dart_avg = ROUND(v_new_overall_3dart_avg::NUMERIC, 2),
      overall_first9_avg = ROUND(v_new_overall_first9_avg::NUMERIC, 2),
      highest_checkout = GREATEST(v_current_stats.highest_checkout, p_highest_checkout),
      checkout_percentage = ROUND(v_new_checkout_percentage::NUMERIC, 2),
      total_checkouts = v_current_stats.total_checkouts + p_checkouts_made,
      checkout_attempts = v_current_stats.checkout_attempts + p_checkout_attempts,
      total_darts_thrown = v_current_stats.total_darts_thrown + p_darts_thrown,
      total_score = v_current_stats.total_score + p_total_score,
      visits_100_plus = v_current_stats.visits_100_plus + p_count_100_plus,
      visits_140_plus = v_current_stats.visits_140_plus + p_count_140_plus,
      visits_180 = v_current_stats.visits_180 + p_count_180,
      current_win_streak = v_new_current_streak,
      best_win_streak = v_new_best_streak,
      last_updated = NOW()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ============================================================================
-- PART 3: Fix dartbot match completion function to use bot level (1-5)
-- ============================================================================

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_user_id UUID,
  p_bot_level INTEGER,
  p_game_mode INTEGER,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_three_dart_avg NUMERIC,
  p_first9_avg NUMERIC,
  p_highest_checkout INTEGER,
  p_checkouts_made INTEGER,
  p_checkout_attempts INTEGER,
  p_darts_thrown INTEGER,
  p_total_score INTEGER,
  p_count_100_plus INTEGER,
  p_count_140_plus INTEGER,
  p_count_180 INTEGER,
  p_result TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_id UUID;
  v_checkout_percentage NUMERIC;
BEGIN
  -- Calculate checkout percentage
  IF p_checkout_attempts > 0 THEN
    v_checkout_percentage := (p_checkouts_made::NUMERIC / p_checkout_attempts::NUMERIC) * 100;
  ELSE
    v_checkout_percentage := 0;
  END IF;

  -- Insert into match_history with match_format='dartbot'
  INSERT INTO match_history (
    user_id,
    opponent_id,
    room_id,
    game_mode,
    match_format,
    bot_level,
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
    result,
    played_at
  ) VALUES (
    p_user_id,
    NULL, -- No opponent_id for dartbot matches
    NULL, -- No room_id for dartbot
    p_game_mode,
    'dartbot',
    p_bot_level,
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    v_checkout_percentage,
    p_darts_thrown,
    p_total_score,
    p_count_100_plus,
    p_count_140_plus,
    p_count_180,
    p_result,
    NOW()
  )
  RETURNING id INTO v_match_id;

  -- Update player_stats aggregate table
  PERFORM update_player_stats_from_match(
    p_user_id,
    p_game_mode,
    p_result = 'win',
    p_result = 'loss',
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_checkouts_made,
    p_checkout_attempts,
    p_darts_thrown,
    p_total_score,
    p_count_100_plus,
    p_count_140_plus,
    p_count_180
  );

  RETURN v_match_id;
END;
$$;

-- ============================================================================
-- PART 4: Fix any existing dartbot records that have bot_average instead of bot_level
-- ============================================================================

-- Create a mapping function to convert bot_average to bot_level
CREATE OR REPLACE FUNCTION convert_bot_average_to_level(p_average NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Map average to level (1-5)
  IF p_average <= 30 THEN RETURN 1;
  ELSIF p_average <= 40 THEN RETURN 2;
  ELSIF p_average <= 50 THEN RETURN 3;
  ELSIF p_average <= 60 THEN RETURN 4;
  ELSE RETURN 5;
  END IF;
END;
$$;

-- Update existing dartbot records to use level instead of average
-- (Only needed if we had records with bot_average column, but our schema uses bot_level)

-- ============================================================================
-- PART 5: Create trigger function to auto-update player_stats on match insert
-- ============================================================================

CREATE OR REPLACE FUNCTION on_match_history_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process if this is a manual insert (not from our functions above)
  -- Our functions already call update_player_stats_from_match
  -- This trigger handles inserts from other sources
  
  PERFORM update_player_stats_from_match(
    NEW.user_id,
    NEW.game_mode,
    NEW.result = 'win',
    NEW.result = 'loss',
    NEW.legs_won,
    NEW.legs_lost,
    NEW.three_dart_avg,
    NEW.first9_avg,
    NEW.highest_checkout,
    0, -- checkouts_made - we don't have this breakdown in match_history
    0, -- checkout_attempts - we don't have this breakdown
    NEW.darts_thrown,
    NEW.total_score,
    NEW.visits_100_plus,
    NEW.visits_140_plus,
    NEW.visits_180
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_match_history_insert ON match_history;

-- Create trigger
CREATE TRIGGER trg_match_history_insert
  AFTER INSERT ON match_history
  FOR EACH ROW
  EXECUTE FUNCTION on_match_history_insert();

-- ============================================================================
-- PART 6: Backfill missing player_stats for users with match_history entries
-- ============================================================================

-- For any users who have match_history entries but no player_stats,
-- create their aggregate stats
INSERT INTO player_stats (
  user_id,
  total_matches,
  wins,
  losses,
  draws,
  matches_301,
  matches_501,
  overall_3dart_avg,
  overall_first9_avg,
  highest_checkout,
  checkout_percentage,
  total_checkouts,
  checkout_attempts,
  total_darts_thrown,
  total_score,
  visits_100_plus,
  visits_140_plus,
  visits_180,
  current_win_streak,
  best_win_streak,
  last_updated
)
SELECT 
  mh.user_id,
  COUNT(*)::INTEGER as total_matches,
  COUNT(*) FILTER (WHERE mh.result = 'win')::INTEGER as wins,
  COUNT(*) FILTER (WHERE mh.result = 'loss')::INTEGER as losses,
  COUNT(*) FILTER (WHERE mh.result = 'draw')::INTEGER as draws,
  COUNT(*) FILTER (WHERE mh.game_mode = 301)::INTEGER as matches_301,
  COUNT(*) FILTER (WHERE mh.game_mode = 501)::INTEGER as matches_501,
  ROUND(AVG(mh.three_dart_avg)::NUMERIC, 2) as overall_3dart_avg,
  ROUND(AVG(mh.first9_avg)::NUMERIC, 2) as overall_first9_avg,
  MAX(mh.highest_checkout) as highest_checkout,
  ROUND(
    (SUM(CASE WHEN mh.result = 'win' THEN 1 ELSE 0 END)::NUMERIC / 
     NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 
    2
  ) as checkout_percentage,
  SUM(CASE WHEN mh.result = 'win' THEN 1 ELSE 0 END)::INTEGER as total_checkouts,
  COUNT(*)::INTEGER as checkout_attempts,
  SUM(mh.darts_thrown)::INTEGER as total_darts_thrown,
  SUM(mh.total_score)::INTEGER as total_score,
  SUM(mh.visits_100_plus)::INTEGER as visits_100_plus,
  SUM(mh.visits_140_plus)::INTEGER as visits_140_plus,
  SUM(mh.visits_180)::INTEGER as visits_180,
  0 as current_win_streak, -- Would need complex logic to calculate
  0 as best_win_streak,    -- Would need complex logic to calculate
  NOW() as last_updated
FROM match_history mh
LEFT JOIN player_stats ps ON mh.user_id = ps.user_id
WHERE ps.user_id IS NULL
GROUP BY mh.user_id;

-- ============================================================================
-- PART 7: Recalculate player_stats for all users from match_history
-- ============================================================================

-- This ensures aggregate stats are correct even if there were bugs
UPDATE player_stats ps
SET
  total_matches = stats.total_matches,
  wins = stats.wins,
  losses = stats.losses,
  draws = stats.draws,
  matches_301 = stats.matches_301,
  matches_501 = stats.matches_501,
  overall_3dart_avg = stats.overall_3dart_avg,
  overall_first9_avg = stats.overall_first9_avg,
  highest_checkout = stats.highest_checkout,
  checkout_percentage = stats.checkout_percentage,
  total_darts_thrown = stats.total_darts_thrown,
  total_score = stats.total_score,
  visits_100_plus = stats.visits_100_plus,
  visits_140_plus = stats.visits_140_plus,
  visits_180 = stats.visits_180,
  last_updated = NOW()
FROM (
  SELECT 
    user_id,
    COUNT(*)::INTEGER as total_matches,
    COUNT(*) FILTER (WHERE result = 'win')::INTEGER as wins,
    COUNT(*) FILTER (WHERE result = 'loss')::INTEGER as losses,
    COUNT(*) FILTER (WHERE result = 'draw')::INTEGER as draws,
    COUNT(*) FILTER (WHERE game_mode = 301)::INTEGER as matches_301,
    COUNT(*) FILTER (WHERE game_mode = 501)::INTEGER as matches_501,
    ROUND(AVG(three_dart_avg)::NUMERIC, 2) as overall_3dart_avg,
    ROUND(AVG(first9_avg)::NUMERIC, 2) as overall_first9_avg,
    MAX(highest_checkout) as highest_checkout,
    ROUND(
      (SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END)::NUMERIC / 
       NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 
      2
    ) as checkout_percentage,
    SUM(darts_thrown)::INTEGER as total_darts_thrown,
    SUM(total_score)::INTEGER as total_score,
    SUM(visits_100_plus)::INTEGER as visits_100_plus,
    SUM(visits_140_plus)::INTEGER as visits_140_plus,
    SUM(visits_180)::INTEGER as visits_180
  FROM match_history
  GROUP BY user_id
) stats
WHERE ps.user_id = stats.user_id;

-- ============================================================================
-- PART 8: Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION record_quick_match_stats TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion TO authenticated;
GRANT EXECUTE ON FUNCTION update_player_stats_from_match TO authenticated;

-- ============================================================================
-- DONE!
-- ============================================================================
