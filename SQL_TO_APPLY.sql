-- ============================================
-- DARTBOT STATS FIX - SQL TO APPLY
-- Run these in Supabase SQL Editor
-- ============================================

-- Step 1: Add win streak columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_stats' AND column_name = 'current_win_streak') THEN
    ALTER TABLE player_stats ADD COLUMN current_win_streak INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_stats' AND column_name = 'best_win_streak') THEN
    ALTER TABLE player_stats ADD COLUMN best_win_streak INTEGER DEFAULT 0;
  END IF;
END $$;

-- Step 2: Create win streak calculation functions
CREATE OR REPLACE FUNCTION calculate_win_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_streak INTEGER := 0;
  v_result RECORD;
BEGIN
  FOR v_result IN 
    SELECT result FROM match_history WHERE user_id = p_user_id ORDER BY played_at DESC
  LOOP
    IF v_result.result = 'win' THEN v_streak := v_streak + 1; ELSE EXIT; END IF;
  END LOOP;
  RETURN v_streak;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_best_win_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_current INTEGER := 0; v_best INTEGER := 0; v_result RECORD;
BEGIN
  FOR v_result IN SELECT result FROM match_history WHERE user_id = p_user_id ORDER BY played_at ASC
  LOOP
    IF v_result.result = 'win' THEN
      v_current := v_current + 1;
      IF v_current > v_best THEN v_best := v_current; END IF;
    ELSE v_current := 0; END IF;
  END LOOP;
  RETURN v_best;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create/Fix the dartbot match completion RPC
CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER, p_match_format TEXT, p_dartbot_level INTEGER,
  p_player_legs INTEGER, p_dartbot_legs INTEGER, p_winner TEXT,
  p_started_at TIMESTAMP WITH TIME ZONE, p_completed_at TIMESTAMP WITH TIME ZONE,
  p_three_dart_avg DECIMAL DEFAULT 0, p_first9_avg DECIMAL DEFAULT 0,
  p_highest_checkout INTEGER DEFAULT 0, p_checkout_percentage DECIMAL DEFAULT 0,
  p_darts_thrown INTEGER DEFAULT 0, p_total_score INTEGER DEFAULT 0,
  p_total_checkouts INTEGER DEFAULT 0, p_checkout_attempts INTEGER DEFAULT 0,
  p_visits_100_plus INTEGER DEFAULT 0, p_visits_140_plus INTEGER DEFAULT 0, p_visits_180 INTEGER DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result TEXT := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;
  v_room_id UUID; v_existing RECORD;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  v_room_id := gen_random_uuid();
  
  -- Insert to match_history
  INSERT INTO match_history (room_id, user_id, opponent_id, game_mode, match_format, bot_level, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout, checkout_percentage,
    darts_thrown, total_score, total_checkouts, checkout_attempts, visits_100_plus, visits_140_plus, visits_180, played_at)
  VALUES (v_room_id, v_user_id, NULL, p_game_mode, 'dartbot', p_dartbot_level, v_result,
    p_player_legs, p_dartbot_legs, p_three_dart_avg, p_first9_avg, p_highest_checkout, p_checkout_percentage,
    p_darts_thrown, p_total_score, p_total_checkouts, p_checkout_attempts, p_visits_100_plus, p_visits_140_plus, p_visits_180, p_completed_at);
  
  -- Update player_stats
  SELECT * INTO v_existing FROM player_stats WHERE user_id = v_user_id;
  IF v_existing IS NULL THEN
    INSERT INTO player_stats (user_id, total_matches, wins, losses, matches_301, matches_501,
      total_darts_thrown, total_score, overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180, current_win_streak, best_win_streak)
    VALUES (v_user_id, 1, CASE WHEN v_result='win' THEN 1 ELSE 0 END, CASE WHEN v_result='loss' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode=301 THEN 1 ELSE 0 END, CASE WHEN p_game_mode=501 THEN 1 ELSE 0 END,
      p_darts_thrown, p_total_score, p_three_dart_avg, p_first9_avg,
      p_highest_checkout, p_total_checkouts, p_checkout_attempts, p_checkout_percentage,
      p_visits_100_plus, p_visits_140_plus, p_visits_180,
      CASE WHEN v_result='win' THEN 1 ELSE 0 END, CASE WHEN v_result='win' THEN 1 ELSE 0 END);
  ELSE
    UPDATE player_stats SET
      total_matches = total_matches + 1,
      wins = wins + CASE WHEN v_result='win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_result='loss' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode=301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode=501 THEN 1 ELSE 0 END,
      total_darts_thrown = total_darts_thrown + p_darts_thrown,
      total_score = total_score + p_total_score,
      overall_3dart_avg = CASE WHEN (total_darts_thrown + p_darts_thrown) > 0 THEN ROUND(((total_score + p_total_score)::DECIMAL / (total_darts_thrown + p_darts_thrown) * 3)::DECIMAL, 2) ELSE 0 END,
      overall_first9_avg = CASE WHEN (total_darts_thrown + p_darts_thrown) > 0 THEN ROUND(((total_score + p_total_score)::DECIMAL / (total_darts_thrown + p_darts_thrown) * 3)::DECIMAL, 2) ELSE 0 END,
      highest_checkout = GREATEST(highest_checkout, p_highest_checkout),
      total_checkouts = total_checkouts + p_total_checkouts,
      checkout_attempts = checkout_attempts + p_checkout_attempts,
      checkout_percentage = CASE WHEN (checkout_attempts + p_checkout_attempts) > 0 THEN ROUND(((total_checkouts + p_total_checkouts)::DECIMAL / (checkout_attempts + p_checkout_attempts) * 100)::DECIMAL, 2) ELSE 0 END,
      visits_100_plus = visits_100_plus + p_visits_100_plus,
      visits_140_plus = visits_140_plus + p_visits_140_plus,
      visits_180 = visits_180 + p_visits_180,
      current_win_streak = calculate_win_streak(v_user_id),
      best_win_streak = GREATEST(COALESCE(best_win_streak,0), calculate_best_win_streak(v_user_id)),
      updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'room_id', v_room_id, 'result', v_result);
END;
$$;

-- Step 4: Create dashboard stats RPC
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_stats RECORD;
BEGIN
  SELECT COALESCE(total_matches,0) as total_matches, COALESCE(wins,0) as wins, COALESCE(losses,0) as losses,
    COALESCE(current_win_streak,0) as current_streak, COALESCE(best_win_streak,0) as best_streak,
    COALESCE(overall_3dart_avg,0) as avg, COALESCE(highest_checkout,0) as highest_checkout, COALESCE(visits_180,0) as one_eighties
  INTO v_stats FROM player_stats WHERE user_id = v_user_id;
  IF v_stats IS NULL THEN
    RETURN jsonb_build_object('total_matches',0,'wins',0,'losses',0,'current_streak',0,'best_streak',0,'avg',0,'highest_checkout',0,'one_eighties',0);
  END IF;
  RETURN jsonb_build_object('total_matches',v_stats.total_matches,'wins',v_stats.wins,'losses',v_stats.losses,
    'current_streak',v_stats.current_streak,'best_streak',v_stats.best_streak,'avg',v_stats.avg,
    'highest_checkout',v_stats.highest_checkout,'one_eighties',v_stats.one_eighties);
END;
$$;

-- Step 5: Create trigger to auto-update player_stats
CREATE OR REPLACE FUNCTION trg_update_player_stats_from_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO player_stats (user_id, total_matches, wins, losses, matches_301, matches_501,
    total_darts_thrown, total_score, overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180, current_win_streak, best_win_streak)
  VALUES (NEW.user_id, 1, CASE WHEN NEW.result='win' THEN 1 ELSE 0 END, CASE WHEN NEW.result='loss' THEN 1 ELSE 0 END,
    CASE WHEN NEW.game_mode=301 THEN 1 ELSE 0 END, CASE WHEN NEW.game_mode=501 THEN 1 ELSE 0 END,
    NEW.darts_thrown, NEW.total_score, NEW.three_dart_avg, NEW.first9_avg,
    NEW.highest_checkout, NEW.total_checkouts, NEW.checkout_attempts, NEW.checkout_percentage,
    NEW.visits_100_plus, NEW.visits_140_plus, NEW.visits_180,
    calculate_win_streak(NEW.user_id), calculate_best_win_streak(NEW.user_id))
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN NEW.result='win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN NEW.result='loss' THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + NEW.darts_thrown,
    total_score = player_stats.total_score + NEW.total_score,
    overall_3dart_avg = CASE WHEN (player_stats.total_darts_thrown + NEW.darts_thrown) > 0 THEN ROUND(((player_stats.total_score + NEW.total_score)::DECIMAL / (player_stats.total_darts_thrown + NEW.darts_thrown) * 3)::DECIMAL, 2) ELSE 0 END,
    highest_checkout = GREATEST(player_stats.highest_checkout, NEW.highest_checkout),
    total_checkouts = player_stats.total_checkouts + NEW.total_checkouts,
    current_win_streak = calculate_win_streak(NEW.user_id),
    best_win_streak = GREATEST(COALESCE(player_stats.best_win_streak,0), calculate_best_win_streak(NEW.user_id)),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_match_history_update_stats ON match_history;
CREATE TRIGGER trg_match_history_update_stats AFTER INSERT ON match_history
  FOR EACH ROW EXECUTE FUNCTION trg_update_player_stats_from_history();

-- Step 6: Backfill streaks for existing data
UPDATE player_stats SET
  current_win_streak = calculate_win_streak(user_id),
  best_win_streak = calculate_best_win_streak(user_id)
WHERE user_id IN (SELECT DISTINCT user_id FROM match_history);

-- Done!
SELECT 'Dartbot stats fix applied successfully!' as status;
