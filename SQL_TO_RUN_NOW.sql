-- ============================================================================
-- SQL TO RUN NOW - Copy this entire file into Supabase SQL Editor
-- ============================================================================

-- STEP 1: Drop existing functions first (to avoid parameter name conflicts)
DROP FUNCTION IF EXISTS update_player_stats_from_dartbot(UUID, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS record_dartbot_match_completion(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER);

-- STEP 2: Ensure all opponent stats columns exist in match_history
ALTER TABLE public.match_history
ADD COLUMN IF NOT EXISTS opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_first9_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_highest_checkout INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_darts_thrown INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_100_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_140_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_180 INTEGER DEFAULT 0;

-- STEP 3: Create function to update player_stats from dartbot matches
CREATE OR REPLACE FUNCTION update_player_stats_from_dartbot(
  p_user_id UUID,
  p_game_mode INTEGER,
  p_result TEXT,
  p_darts_thrown INTEGER,
  p_total_score INTEGER,
  p_visits_100_plus INTEGER,
  p_visits_140_plus INTEGER,
  p_visits_180 INTEGER,
  p_total_checkouts INTEGER,
  p_checkout_attempts INTEGER,
  p_highest_checkout INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO player_stats (
    user_id, game_mode, matches_played, matches_won, matches_lost,
    total_darts_thrown, total_score, visits_100_plus, visits_140_plus, visits_180,
    total_checkouts, checkout_attempts, highest_checkout, updated_at
  ) VALUES (
    p_user_id, p_game_mode, 1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    p_darts_thrown, p_total_score, p_visits_100_plus, p_visits_140_plus, p_visits_180,
    p_total_checkouts, p_checkout_attempts, p_highest_checkout, NOW()
  )
  ON CONFLICT (user_id, game_mode) DO UPDATE SET
    matches_played = player_stats.matches_played + 1,
    matches_won = player_stats.matches_won + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    matches_lost = player_stats.matches_lost + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + p_darts_thrown,
    total_score = player_stats.total_score + p_total_score,
    visits_100_plus = player_stats.visits_100_plus + p_visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + p_visits_140_plus,
    visits_180 = player_stats.visits_180 + p_visits_180,
    total_checkouts = player_stats.total_checkouts + p_total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + p_checkout_attempts,
    highest_checkout = GREATEST(player_stats.highest_checkout, p_highest_checkout),
    updated_at = NOW();
END;
$$;

-- STEP 4: Create dartbot match completion function with opponent stats
CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_dartbot_level INTEGER,
  p_player_legs_won INTEGER,
  p_bot_legs_won INTEGER,
  p_winner TEXT,
  p_player_three_dart_avg DECIMAL DEFAULT 0,
  p_player_first9_avg DECIMAL DEFAULT 0,
  p_player_checkout_pct DECIMAL DEFAULT 0,
  p_player_highest_checkout INTEGER DEFAULT 0,
  p_player_darts_at_double INTEGER DEFAULT 0,
  p_player_total_darts INTEGER DEFAULT 0,
  p_player_100_plus INTEGER DEFAULT 0,
  p_player_140_plus INTEGER DEFAULT 0,
  p_player_180s INTEGER DEFAULT 0,
  p_bot_three_dart_avg DECIMAL DEFAULT 0,
  p_bot_first9_avg DECIMAL DEFAULT 0,
  p_bot_checkout_pct DECIMAL DEFAULT 0,
  p_bot_highest_checkout INTEGER DEFAULT 0,
  p_bot_darts_at_double INTEGER DEFAULT 0,
  p_bot_total_darts INTEGER DEFAULT 0,
  p_bot_100_plus INTEGER DEFAULT 0,
  p_bot_140_plus INTEGER DEFAULT 0,
  p_bot_180s INTEGER DEFAULT 0,
  p_bot_total_score INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  v_room_id := gen_random_uuid();
  
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format,
    result, legs_won, legs_lost,
    three_dart_avg, first9_avg, highest_checkout, checkout_percentage, darts_thrown,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180,
    played_at, bot_level,
    opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
    opponent_checkout_percentage, opponent_darts_thrown,
    opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
  ) VALUES (
    v_room_id, v_user_id, NULL, p_game_mode, 'dartbot',
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
    p_player_legs_won, p_bot_legs_won,
    p_player_three_dart_avg, p_player_first9_avg, p_player_highest_checkout,
    p_player_checkout_pct, p_player_total_darts,
    p_player_legs_won, p_player_darts_at_double,
    p_player_100_plus, p_player_140_plus, p_player_180s,
    NOW(), p_dartbot_level,
    -- Bot stats as opponent stats
    p_bot_three_dart_avg, p_bot_first9_avg, p_bot_highest_checkout,
    p_bot_checkout_pct, p_bot_total_darts,
    p_bot_100_plus, p_bot_140_plus, p_bot_180s
  );
  
  PERFORM update_player_stats_from_dartbot(
    v_user_id, p_game_mode, CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
    p_player_total_darts, p_bot_total_score, p_player_100_plus, p_player_140_plus, p_player_180s,
    p_player_legs_won, p_player_darts_at_double, p_player_highest_checkout
  );
  
  RETURN jsonb_build_object('success', true, 'room_id', v_room_id, 'message', 'Dartbot match recorded');
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- STEP 5: Create quick match completion function with opponent stats
CREATE OR REPLACE FUNCTION fn_record_quick_match_complete(
    p_room_id UUID,
    p_winner_id UUID,
    p_loser_id UUID,
    p_winner_legs INTEGER,
    p_loser_legs INTEGER,
    p_game_mode INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_winner_stats RECORD;
    v_loser_stats RECORD;
BEGIN
    -- Calculate stats for winner
    SELECT 
        COALESCE(AVG(CASE WHEN darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as three_dart_avg,
        COALESCE(AVG(CASE WHEN turn_no <= 3 AND darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as first9_avg,
        COALESCE(MAX(CASE WHEN is_checkout THEN remaining_before END), 0) as highest_checkout,
        COALESCE((COUNT(CASE WHEN is_checkout THEN 1 END)::decimal / NULLIF(COUNT(CASE WHEN remaining_before <= 100 THEN 1 END), 0)) * 100, 0) as checkout_pct,
        COALESCE(SUM(darts_thrown), 0) as darts_thrown,
        COALESCE(SUM(CASE WHEN score >= 100 THEN 1 END), 0) as visits_100_plus,
        COALESCE(SUM(CASE WHEN score >= 140 THEN 1 END), 0) as visits_140_plus,
        COALESCE(SUM(CASE WHEN score = 180 THEN 1 END), 0) as visits_180,
        COALESCE(SUM(score), 0) as total_score,
        COUNT(CASE WHEN is_checkout THEN 1 END) as total_checkouts,
        COUNT(CASE WHEN remaining_before <= 100 THEN 1 END) as checkout_attempts
    INTO v_winner_stats
    FROM quick_match_visits
    WHERE room_id = p_room_id AND player_id = p_winner_id;

    -- Calculate stats for loser
    SELECT 
        COALESCE(AVG(CASE WHEN darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as three_dart_avg,
        COALESCE(AVG(CASE WHEN turn_no <= 3 AND darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as first9_avg,
        COALESCE(MAX(CASE WHEN is_checkout THEN remaining_before END), 0) as highest_checkout,
        COALESCE((COUNT(CASE WHEN is_checkout THEN 1 END)::decimal / NULLIF(COUNT(CASE WHEN remaining_before <= 100 THEN 1 END), 0)) * 100, 0) as checkout_pct,
        COALESCE(SUM(darts_thrown), 0) as darts_thrown,
        COALESCE(SUM(CASE WHEN score >= 100 THEN 1 END), 0) as visits_100_plus,
        COALESCE(SUM(CASE WHEN score >= 140 THEN 1 END), 0) as visits_140_plus,
        COALESCE(SUM(CASE WHEN score = 180 THEN 1 END), 0) as visits_180,
        COALESCE(SUM(score), 0) as total_score,
        COUNT(CASE WHEN is_checkout THEN 1 END) as total_checkouts,
        COUNT(CASE WHEN remaining_before <= 100 THEN 1 END) as checkout_attempts
    INTO v_loser_stats
    FROM quick_match_visits
    WHERE room_id = p_room_id AND player_id = p_loser_id;

    -- Insert winner's match history with opponent (loser) stats
    INSERT INTO match_history (
        room_id, user_id, opponent_id, game_mode, match_format,
        result, legs_won, legs_lost,
        three_dart_avg, first9_avg, highest_checkout, checkout_percentage, darts_thrown,
        total_score, total_checkouts, checkout_attempts,
        visits_100_plus, visits_140_plus, visits_180,
        opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout, 
        opponent_checkout_percentage, opponent_darts_thrown,
        opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180,
        played_at
    ) VALUES (
        p_room_id, p_winner_id, p_loser_id, p_game_mode, 'quick',
        'win', p_winner_legs, p_loser_legs,
        COALESCE(v_winner_stats.three_dart_avg, 0),
        COALESCE(v_winner_stats.first9_avg, 0),
        COALESCE(v_winner_stats.highest_checkout, 0),
        COALESCE(v_winner_stats.checkout_pct, 0),
        COALESCE(v_winner_stats.darts_thrown, 0),
        COALESCE(v_winner_stats.total_score, 0),
        COALESCE(v_winner_stats.total_checkouts, 0),
        COALESCE(v_winner_stats.checkout_attempts, 0),
        COALESCE(v_winner_stats.visits_100_plus, 0),
        COALESCE(v_winner_stats.visits_140_plus, 0),
        COALESCE(v_winner_stats.visits_180, 0),
        -- Opponent (loser) stats
        COALESCE(v_loser_stats.three_dart_avg, 0),
        COALESCE(v_loser_stats.first9_avg, 0),
        COALESCE(v_loser_stats.highest_checkout, 0),
        COALESCE(v_loser_stats.checkout_pct, 0),
        COALESCE(v_loser_stats.darts_thrown, 0),
        COALESCE(v_loser_stats.visits_100_plus, 0),
        COALESCE(v_loser_stats.visits_140_plus, 0),
        COALESCE(v_loser_stats.visits_180, 0),
        NOW()
    )
    ON CONFLICT (room_id, user_id) DO UPDATE SET
        result = 'win', legs_won = p_winner_legs, legs_lost = p_loser_legs,
        three_dart_avg = COALESCE(v_winner_stats.three_dart_avg, 0),
        first9_avg = COALESCE(v_winner_stats.first9_avg, 0),
        highest_checkout = COALESCE(v_winner_stats.highest_checkout, 0),
        checkout_percentage = COALESCE(v_winner_stats.checkout_pct, 0),
        darts_thrown = COALESCE(v_winner_stats.darts_thrown, 0),
        total_score = COALESCE(v_winner_stats.total_score, 0),
        total_checkouts = COALESCE(v_winner_stats.total_checkouts, 0),
        checkout_attempts = COALESCE(v_winner_stats.checkout_attempts, 0),
        visits_100_plus = COALESCE(v_winner_stats.visits_100_plus, 0),
        visits_140_plus = COALESCE(v_winner_stats.visits_140_plus, 0),
        visits_180 = COALESCE(v_winner_stats.visits_180, 0),
        opponent_three_dart_avg = COALESCE(v_loser_stats.three_dart_avg, 0),
        opponent_first9_avg = COALESCE(v_loser_stats.first9_avg, 0),
        opponent_highest_checkout = COALESCE(v_loser_stats.highest_checkout, 0),
        opponent_checkout_percentage = COALESCE(v_loser_stats.checkout_pct, 0),
        opponent_darts_thrown = COALESCE(v_loser_stats.darts_thrown, 0),
        opponent_visits_100_plus = COALESCE(v_loser_stats.visits_100_plus, 0),
        opponent_visits_140_plus = COALESCE(v_loser_stats.visits_140_plus, 0),
        opponent_visits_180 = COALESCE(v_loser_stats.visits_180, 0),
        played_at = NOW();

    -- Insert loser's match history with opponent (winner) stats
    INSERT INTO match_history (
        room_id, user_id, opponent_id, game_mode, match_format,
        result, legs_won, legs_lost,
        three_dart_avg, first9_avg, highest_checkout, checkout_percentage, darts_thrown,
        total_score, total_checkouts, checkout_attempts,
        visits_100_plus, visits_140_plus, visits_180,
        opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout, 
        opponent_checkout_percentage, opponent_darts_thrown,
        opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180,
        played_at
    ) VALUES (
        p_room_id, p_loser_id, p_winner_id, p_game_mode, 'quick',
        'loss', p_loser_legs, p_winner_legs,
        COALESCE(v_loser_stats.three_dart_avg, 0),
        COALESCE(v_loser_stats.first9_avg, 0),
        COALESCE(v_loser_stats.highest_checkout, 0),
        COALESCE(v_loser_stats.checkout_pct, 0),
        COALESCE(v_loser_stats.darts_thrown, 0),
        COALESCE(v_loser_stats.total_score, 0),
        COALESCE(v_loser_stats.total_checkouts, 0),
        COALESCE(v_loser_stats.checkout_attempts, 0),
        COALESCE(v_loser_stats.visits_100_plus, 0),
        COALESCE(v_loser_stats.visits_140_plus, 0),
        COALESCE(v_loser_stats.visits_180, 0),
        -- Opponent (winner) stats
        COALESCE(v_winner_stats.three_dart_avg, 0),
        COALESCE(v_winner_stats.first9_avg, 0),
        COALESCE(v_winner_stats.highest_checkout, 0),
        COALESCE(v_winner_stats.checkout_pct, 0),
        COALESCE(v_winner_stats.darts_thrown, 0),
        COALESCE(v_winner_stats.visits_100_plus, 0),
        COALESCE(v_winner_stats.visits_140_plus, 0),
        COALESCE(v_winner_stats.visits_180, 0),
        NOW()
    )
    ON CONFLICT (room_id, user_id) DO UPDATE SET
        result = 'loss', legs_won = p_loser_legs, legs_lost = p_winner_legs,
        three_dart_avg = COALESCE(v_loser_stats.three_dart_avg, 0),
        first9_avg = COALESCE(v_loser_stats.first9_avg, 0),
        highest_checkout = COALESCE(v_loser_stats.highest_checkout, 0),
        checkout_percentage = COALESCE(v_loser_stats.checkout_pct, 0),
        darts_thrown = COALESCE(v_loser_stats.darts_thrown, 0),
        total_score = COALESCE(v_loser_stats.total_score, 0),
        total_checkouts = COALESCE(v_loser_stats.total_checkouts, 0),
        checkout_attempts = COALESCE(v_loser_stats.checkout_attempts, 0),
        visits_100_plus = COALESCE(v_loser_stats.visits_100_plus, 0),
        visits_140_plus = COALESCE(v_loser_stats.visits_140_plus, 0),
        visits_180 = COALESCE(v_loser_stats.visits_180, 0),
        opponent_three_dart_avg = COALESCE(v_winner_stats.three_dart_avg, 0),
        opponent_first9_avg = COALESCE(v_winner_stats.first9_avg, 0),
        opponent_highest_checkout = COALESCE(v_winner_stats.highest_checkout, 0),
        opponent_checkout_percentage = COALESCE(v_winner_stats.checkout_pct, 0),
        opponent_darts_thrown = COALESCE(v_winner_stats.darts_thrown, 0),
        opponent_visits_100_plus = COALESCE(v_winner_stats.visits_100_plus, 0),
        opponent_visits_140_plus = COALESCE(v_winner_stats.visits_140_plus, 0),
        opponent_visits_180 = COALESCE(v_winner_stats.visits_180, 0),
        played_at = NOW();

END;
$$;

-- STEP 6: Grant permissions
GRANT EXECUTE ON FUNCTION update_player_stats_from_dartbot(UUID, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;

-- STEP 7: Create helpful view
CREATE OR REPLACE VIEW v_match_history_with_opponents AS
SELECT 
    mh.*,
    p.username as opponent_username,
    CASE 
        WHEN mh.bot_level IS NOT NULL THEN 'DartBot(' || mh.bot_level || ')'
        ELSE p.username
    END as display_opponent_name
FROM match_history mh
LEFT JOIN profiles p ON p.user_id = mh.opponent_id;

GRANT SELECT ON v_match_history_with_opponents TO authenticated;

-- Done!
SELECT 'All opponent stats functions and columns created successfully!' as status;
