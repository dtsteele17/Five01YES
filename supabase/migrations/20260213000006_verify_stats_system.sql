-- ============================================
-- STATS SYSTEM VERIFICATION & DEBUGGING
-- ============================================

-- Create a function to verify current stats for a user
CREATE OR REPLACE FUNCTION verify_user_stats(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  section TEXT,
  metric TEXT,
  value TEXT
) AS $$
BEGIN
  -- Return match_history summary
  RETURN QUERY
  SELECT 
    'Match History'::TEXT,
    'Total Records'::TEXT,
    COUNT(*)::TEXT
  FROM match_history 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Match History'::TEXT,
    'Wins'::TEXT,
    COUNT(*)::TEXT
  FROM match_history 
  WHERE user_id = p_user_id AND result = 'win';

  RETURN QUERY
  SELECT 
    'Match History'::TEXT,
    'Losses'::TEXT,
    COUNT(*)::TEXT
  FROM match_history 
  WHERE user_id = p_user_id AND result = 'loss';

  RETURN QUERY
  SELECT 
    'Match History'::TEXT,
    'Dartbot Matches'::TEXT,
    COUNT(*)::TEXT
  FROM match_history 
  WHERE user_id = p_user_id AND match_format = 'dartbot';

  -- Return player_stats
  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Total Matches'::TEXT,
    COALESCE(total_matches::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Wins'::TEXT,
    COALESCE(wins::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Losses'::TEXT,
    COALESCE(losses::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Current Streak'::TEXT,
    COALESCE(current_win_streak::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Best Streak'::TEXT,
    COALESCE(best_win_streak::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    'Avg 3-Dart'::TEXT,
    COALESCE(overall_3dart_avg::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT 
    'Player Stats'::TEXT,
    '180s'::TEXT,
    COALESCE(visits_180::TEXT, '0')
  FROM player_stats 
  WHERE user_id = p_user_id;

  -- Calculated streaks
  RETURN QUERY
  SELECT 
    'Calculated'::TEXT,
    'Current Win Streak'::TEXT,
    calculate_win_streak(p_user_id)::TEXT;

  RETURN QUERY
  SELECT 
    'Calculated'::TEXT,
    'Best Win Streak'::TEXT,
    calculate_best_win_streak(p_user_id)::TEXT;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION verify_user_stats TO authenticated;

-- ============================================
-- FIX: Ensure player_stats is properly updated
-- when match_history changes
-- ============================================

-- Create trigger function to auto-update player_stats
CREATE OR REPLACE FUNCTION trg_update_player_stats_from_history()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_result TEXT;
  v_game_mode INTEGER;
BEGIN
  v_user_id := NEW.user_id;
  v_result := NEW.result;
  v_game_mode := NEW.game_mode;

  -- Update or insert player_stats
  INSERT INTO player_stats (
    user_id, total_matches, wins, losses,
    matches_301, matches_501,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180,
    current_win_streak, best_win_streak
  ) VALUES (
    v_user_id, 1,
    CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    CASE WHEN v_game_mode = 301 THEN 1 ELSE 0 END,
    CASE WHEN v_game_mode = 501 THEN 1 ELSE 0 END,
    NEW.darts_thrown, NEW.total_score,
    NEW.three_dart_avg, NEW.first9_avg,
    NEW.highest_checkout, NEW.total_checkouts, NEW.checkout_attempts, NEW.checkout_percentage,
    NEW.visits_100_plus, NEW.visits_140_plus, NEW.visits_180,
    calculate_win_streak(v_user_id),
    calculate_best_win_streak(v_user_id)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_301 = player_stats.matches_301 + CASE WHEN v_game_mode = 301 THEN 1 ELSE 0 END,
    matches_501 = player_stats.matches_501 + CASE WHEN v_game_mode = 501 THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + NEW.darts_thrown,
    total_score = player_stats.total_score + NEW.total_score,
    overall_3dart_avg = CASE 
      WHEN (player_stats.total_darts_thrown + NEW.darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + NEW.total_score)::DECIMAL / (player_stats.total_darts_thrown + NEW.darts_thrown) * 3)::DECIMAL, 2)
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (player_stats.total_darts_thrown + NEW.darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + NEW.total_score)::DECIMAL / (player_stats.total_darts_thrown + NEW.darts_thrown) * 3)::DECIMAL, 2)
      ELSE 0 
    END,
    highest_checkout = GREATEST(player_stats.highest_checkout, NEW.highest_checkout),
    total_checkouts = player_stats.total_checkouts + NEW.total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + NEW.checkout_attempts,
    checkout_percentage = CASE 
      WHEN (player_stats.checkout_attempts + NEW.checkout_attempts) > 0 
      THEN ROUND(((player_stats.total_checkouts + NEW.total_checkouts)::DECIMAL / (player_stats.checkout_attempts + NEW.checkout_attempts) * 100)::DECIMAL, 2)
      ELSE 0 
    END,
    visits_100_plus = player_stats.visits_100_plus + NEW.visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + NEW.visits_140_plus,
    visits_180 = player_stats.visits_180 + NEW.visits_180,
    current_win_streak = calculate_win_streak(v_user_id),
    best_win_streak = GREATEST(COALESCE(player_stats.best_win_streak, 0), calculate_best_win_streak(v_user_id)),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_match_history_update_stats ON match_history;

-- Create trigger on match_history insert
CREATE TRIGGER trg_match_history_update_stats
  AFTER INSERT ON match_history
  FOR EACH ROW
  EXECUTE FUNCTION trg_update_player_stats_from_history();

-- ============================================
-- SYNC: Backfill any missing player_stats
-- ============================================

-- For users who have match_history but no player_stats
INSERT INTO player_stats (
  user_id, total_matches, wins, losses,
  total_darts_thrown, total_score,
  overall_3dart_avg,
  highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
  visits_100_plus, visits_140_plus, visits_180,
  current_win_streak, best_win_streak
)
SELECT 
  mh.user_id,
  COUNT(*)::INTEGER,
  COUNT(CASE WHEN mh.result = 'win' THEN 1 END)::INTEGER,
  COUNT(CASE WHEN mh.result = 'loss' THEN 1 END)::INTEGER,
  COALESCE(SUM(mh.darts_thrown), 0)::INTEGER,
  COALESCE(SUM(mh.total_score), 0)::INTEGER,
  COALESCE(
    CASE WHEN SUM(mh.darts_thrown) > 0 
    THEN ROUND(((SUM(mh.total_score)::DECIMAL / SUM(mh.darts_thrown)) * 3)::DECIMAL, 2)
    ELSE 0 END, 0
  ),
  COALESCE(MAX(mh.highest_checkout), 0)::INTEGER,
  COALESCE(SUM(mh.total_checkouts), 0)::INTEGER,
  COALESCE(SUM(mh.checkout_attempts), 0)::INTEGER,
  COALESCE(
    CASE WHEN SUM(mh.checkout_attempts) > 0 
    THEN ROUND(((SUM(mh.total_checkouts)::DECIMAL / SUM(mh.checkout_attempts)) * 100)::DECIMAL, 2)
    ELSE 0 END, 0
  ),
  COALESCE(SUM(mh.visits_100_plus), 0)::INTEGER,
  COALESCE(SUM(mh.visits_140_plus), 0)::INTEGER,
  COALESCE(SUM(mh.visits_180), 0)::INTEGER,
  calculate_win_streak(mh.user_id),
  calculate_best_win_streak(mh.user_id)
FROM match_history mh
LEFT JOIN player_stats ps ON mh.user_id = ps.user_id
WHERE ps.user_id IS NULL
GROUP BY mh.user_id
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- UPDATE: Recalculate streaks for all existing records
-- ============================================

UPDATE player_stats ps
SET 
  current_win_streak = calculate_win_streak(ps.user_id),
  best_win_streak = calculate_best_win_streak(ps.user_id)
WHERE ps.user_id IN (SELECT DISTINCT user_id FROM match_history);

SELECT 'Stats verification system installed!' as status;
