-- ============================================================================
-- MINIMAL FIX: Ensure update_player_stats_from_dartbot function exists
-- This is called by record_dartbot_match_completion (migration 041)
-- ============================================================================

-- Create the function that updates player_stats from dartbot matches
-- This function is called by record_dartbot_match_completion
CREATE OR REPLACE FUNCTION update_player_stats_from_dartbot(
  p_user_id uuid,
  p_game_mode integer,
  p_result text,
  p_darts_thrown integer,
  p_total_score integer,
  p_count_100_plus integer,
  p_count_140_plus integer,
  p_count_180 integer,
  p_checkouts_made integer,
  p_checkout_attempts integer,
  p_highest_checkout integer
)
RETURNS void AS $$
DECLARE
  v_current record;
  v_new_avg numeric;
  v_new_checkout_pct numeric;
BEGIN
  -- Try to get existing player stats
  SELECT * INTO v_current
  FROM player_stats
  WHERE user_id = p_user_id;
  
  -- If no stats exist, create a default row
  IF NOT FOUND THEN
    INSERT INTO player_stats (
      user_id, total_matches, wins, losses, draws,
      matches_301, matches_501,
      total_darts_thrown, total_score,
      overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180, updated_at
    ) VALUES (
      p_user_id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NOW()
    );
    SELECT * INTO v_current FROM player_stats WHERE user_id = p_user_id;
  END IF;
  
  -- Calculate new 3-dart average (cumulative)
  IF (COALESCE(v_current.total_darts_thrown, 0) + p_darts_thrown) > 0 THEN
    v_new_avg := ROUND(
      ((COALESCE(v_current.total_score, 0) + p_total_score)::numeric / 
       (COALESCE(v_current.total_darts_thrown, 0) + p_darts_thrown)) * 3, 
      2
    );
  ELSE
    v_new_avg := 0;
  END IF;
  
  -- Calculate new checkout percentage
  IF (COALESCE(v_current.checkout_attempts, 0) + p_checkout_attempts) > 0 THEN
    v_new_checkout_pct := ROUND(
      ((COALESCE(v_current.total_checkouts, 0) + p_checkouts_made)::numeric / 
       (COALESCE(v_current.checkout_attempts, 0) + p_checkout_attempts)) * 100,
      2
    );
  ELSE
    v_new_checkout_pct := 0;
  END IF;
  
  -- Update player_stats
  UPDATE player_stats
  SET 
    total_matches = COALESCE(total_matches, 0) + 1,
    wins = CASE WHEN p_result = 'win' THEN COALESCE(wins, 0) + 1 ELSE COALESCE(wins, 0) END,
    losses = CASE WHEN p_result = 'loss' THEN COALESCE(losses, 0) + 1 ELSE COALESCE(losses, 0) END,
    draws = CASE WHEN p_result = 'draw' THEN COALESCE(draws, 0) + 1 ELSE COALESCE(draws, 0) END,
    matches_301 = CASE WHEN p_game_mode = 301 THEN COALESCE(matches_301, 0) + 1 ELSE COALESCE(matches_301, 0) END,
    matches_501 = CASE WHEN p_game_mode = 501 THEN COALESCE(matches_501, 0) + 1 ELSE COALESCE(matches_501, 0) END,
    total_darts_thrown = COALESCE(total_darts_thrown, 0) + p_darts_thrown,
    total_score = COALESCE(total_score, 0) + p_total_score,
    overall_3dart_avg = v_new_avg,
    overall_first9_avg = v_new_avg, -- Using same calculation
    highest_checkout = GREATEST(COALESCE(highest_checkout, 0), p_highest_checkout),
    total_checkouts = COALESCE(total_checkouts, 0) + p_checkouts_made,
    checkout_attempts = COALESCE(checkout_attempts, 0) + p_checkout_attempts,
    checkout_percentage = v_new_checkout_pct,
    visits_100_plus = COALESCE(visits_100_plus, 0) + p_count_100_plus,
    visits_140_plus = COALESCE(visits_140_plus, 0) + p_count_140_plus,
    visits_180 = COALESCE(visits_180, 0) + p_count_180,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION update_player_stats_from_dartbot(
  uuid, integer, text, integer, integer, integer, integer, integer, integer, integer, integer
) TO authenticated;

-- ============================================================================
-- Backfill: Ensure all users with dartbot matches have player_stats records
-- ============================================================================

INSERT INTO player_stats (
  user_id, total_matches, wins, losses, draws,
  matches_301, matches_501,
  total_darts_thrown, total_score,
  overall_3dart_avg, overall_first9_avg,
  highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
  visits_100_plus, visits_140_plus, visits_180, updated_at
)
SELECT 
  user_id,
  COUNT(*)::INTEGER as total_matches,
  COUNT(*) FILTER (WHERE result = 'win')::INTEGER as wins,
  COUNT(*) FILTER (WHERE result = 'loss')::INTEGER as losses,
  COUNT(*) FILTER (WHERE result = 'draw')::INTEGER as draws,
  COUNT(*) FILTER (WHERE game_mode = 301)::INTEGER as matches_301,
  COUNT(*) FILTER (WHERE game_mode = 501)::INTEGER as matches_501,
  SUM(darts_thrown)::INTEGER as total_darts_thrown,
  SUM(total_score)::INTEGER as total_score,
  ROUND(
    CASE WHEN SUM(darts_thrown) > 0 
    THEN (SUM(total_score)::numeric / SUM(darts_thrown)) * 3
    ELSE 0 END, 2
  ) as overall_3dart_avg,
  ROUND(
    CASE WHEN SUM(darts_thrown) > 0 
    THEN (SUM(total_score)::numeric / SUM(darts_thrown)) * 3
    ELSE 0 END, 2
  ) as overall_first9_avg,
  MAX(highest_checkout) as highest_checkout,
  SUM(total_checkouts)::INTEGER as total_checkouts,
  SUM(checkout_attempts)::INTEGER as checkout_attempts,
  ROUND(
    CASE WHEN SUM(checkout_attempts) > 0 
    THEN (SUM(total_checkouts)::numeric / SUM(checkout_attempts)) * 100
    ELSE 0 END, 2
  ) as checkout_percentage,
  SUM(visits_100_plus)::INTEGER as visits_100_plus,
  SUM(visits_140_plus)::INTEGER as visits_140_plus,
  SUM(visits_180)::INTEGER as visits_180,
  NOW() as updated_at
FROM match_history
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
  total_matches = EXCLUDED.total_matches,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  draws = EXCLUDED.draws,
  matches_301 = EXCLUDED.matches_301,
  matches_501 = EXCLUDED.matches_501,
  total_darts_thrown = EXCLUDED.total_darts_thrown,
  total_score = EXCLUDED.total_score,
  overall_3dart_avg = EXCLUDED.overall_3dart_avg,
  overall_first9_avg = EXCLUDED.overall_first9_avg,
  highest_checkout = EXCLUDED.highest_checkout,
  total_checkouts = EXCLUDED.total_checkouts,
  checkout_attempts = EXCLUDED.checkout_attempts,
  checkout_percentage = EXCLUDED.checkout_percentage,
  visits_100_plus = EXCLUDED.visits_100_plus,
  visits_140_plus = EXCLUDED.visits_140_plus,
  visits_180 = EXCLUDED.visits_180,
  updated_at = NOW();

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'Dartbot stats function fixed and player_stats backfilled' as status;
