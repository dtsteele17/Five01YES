-- ============================================================================
-- FIX: DartBot Stats Recording
-- ============================================================================
-- This ensures dartbot match stats are recorded correctly including:
-- - Checkout percentage (based on darts at double)
-- - Highest checkout (the highest score the player checked out from)
-- - All stats appear in Last 3 Games, Stats page, and Dashboard

-- ============================================
-- STEP 1: Drop existing function
-- ============================================
DROP FUNCTION IF EXISTS record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, 
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, 
  INTEGER, INTEGER, INTEGER,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER
);

-- ============================================
-- STEP 2: Create updated RPC function with proper checkout calculation
-- ============================================
CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_dartbot_level INTEGER,
  p_player_legs_won INTEGER,
  p_bot_legs_won INTEGER,
  p_winner TEXT,
  -- Player stats
  p_player_three_dart_avg DECIMAL DEFAULT 0,
  p_player_first9_avg DECIMAL DEFAULT 0,
  p_player_checkout_pct DECIMAL DEFAULT 0,
  p_player_highest_checkout INTEGER DEFAULT 0,
  p_player_darts_at_double INTEGER DEFAULT 0,
  p_player_total_darts INTEGER DEFAULT 0,
  p_player_100_plus INTEGER DEFAULT 0,
  p_player_140_plus INTEGER DEFAULT 0,
  p_player_180s INTEGER DEFAULT 0,
  -- Bot stats parameters (optional)
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
  v_user_id UUID := auth.uid();
  v_result TEXT := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;
  v_room_id UUID;
  v_existing RECORD;
  v_total_checkouts INTEGER;
  v_checkout_attempts INTEGER;
  v_player_score INTEGER;
BEGIN
  -- Validate user
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Generate a unique room_id for dartbot matches
  v_room_id := gen_random_uuid();
  
  -- Calculate checkout stats properly
  -- Total checkouts = legs won (each leg win requires a checkout)
  v_total_checkouts := p_player_legs_won;
  -- Checkout attempts = darts thrown at double
  v_checkout_attempts := p_player_darts_at_double;
  
  -- Calculate player total score from average and darts
  v_player_score := ROUND(p_player_three_dart_avg * p_player_total_darts / 3);

  -- ========================================
  -- STEP 1: Insert into match_history
  -- ========================================
  INSERT INTO match_history (
    room_id,
    user_id,
    opponent_id,
    game_mode,
    match_format,
    bot_level,
    result,
    legs_won,
    legs_lost,
    three_dart_avg,
    first9_avg,
    highest_checkout,
    checkout_percentage,
    darts_thrown,
    total_score,
    total_checkouts,
    checkout_attempts,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    played_at,
    -- Opponent stats (bot stats stored here for easy retrieval)
    opponent_three_dart_avg,
    opponent_first9_avg,
    opponent_highest_checkout,
    opponent_checkout_percentage,
    opponent_darts_thrown,
    opponent_visits_100_plus,
    opponent_visits_140_plus,
    opponent_visits_180,
    -- Store bot stats in JSONB for additional retrieval options
    metadata
  ) VALUES (
    v_room_id,
    v_user_id,
    NULL, -- dartbot has no user_id
    p_game_mode,
    'dartbot',
    p_dartbot_level,
    v_result,
    p_player_legs_won,
    p_bot_legs_won,
    p_player_three_dart_avg,
    p_player_first9_avg,
    p_player_highest_checkout,
    p_player_checkout_pct,
    p_player_total_darts,
    v_player_score,
    v_total_checkouts,
    v_checkout_attempts,
    p_player_100_plus,
    p_player_140_plus,
    p_player_180s,
    NOW(),
    -- Bot opponent stats
    p_bot_three_dart_avg,
    p_bot_first9_avg,
    p_bot_highest_checkout,
    p_bot_checkout_pct,
    p_bot_total_darts,
    p_bot_100_plus,
    p_bot_140_plus,
    p_bot_180s,
    -- Metadata with bot stats
    jsonb_build_object(
      'bot_stats', jsonb_build_object(
        'three_dart_avg', p_bot_three_dart_avg,
        'first9_avg', p_bot_first9_avg,
        'checkout_pct', p_bot_checkout_pct,
        'highest_checkout', p_bot_highest_checkout,
        'darts_at_double', p_bot_darts_at_double,
        'total_darts', p_bot_total_darts,
        'visits_100_plus', p_bot_100_plus,
        'visits_140_plus', p_bot_140_plus,
        'visits_180', p_bot_180s,
        'total_score', p_bot_total_score
      ),
      'match_format', p_match_format
    )
  );

  -- ========================================
  -- STEP 2: Update player_stats aggregate
  -- ========================================
  SELECT * INTO v_existing FROM player_stats WHERE user_id = v_user_id;
  
  IF v_existing IS NULL THEN
    -- First game ever - create new record
    INSERT INTO player_stats (
      user_id,
      total_matches,
      wins,
      losses,
      matches_301,
      matches_501,
      total_darts_thrown,
      total_score,
      overall_3dart_avg,
      overall_first9_avg,
      highest_checkout,
      total_checkouts,
      checkout_attempts,
      checkout_percentage,
      visits_100_plus,
      visits_140_plus,
      visits_180,
      current_win_streak,
      best_win_streak,
      first9_total_score,
      first9_total_darts
    ) VALUES (
      v_user_id,
      1,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      p_player_total_darts,
      v_player_score,
      p_player_three_dart_avg,
      p_player_first9_avg,
      p_player_highest_checkout,
      v_total_checkouts,
      v_checkout_attempts,
      p_player_checkout_pct,
      p_player_100_plus,
      p_player_140_plus,
      p_player_180s,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      -- Calculate first 9 cumulative stats
      ROUND(p_player_first9_avg * 9 / 3),
      9
    );
  ELSE
    -- Update existing stats with proper weighted averages
    DECLARE
      v_new_total_darts INTEGER;
      v_new_total_score DECIMAL;
      v_new_first9_darts INTEGER;
      v_new_first9_score DECIMAL;
    BEGIN
      v_new_total_darts := v_existing.total_darts_thrown + p_player_total_darts;
      v_new_total_score := v_existing.total_score + v_player_score;
      v_new_first9_darts := COALESCE(v_existing.first9_total_darts, 0) + 9; -- 9 darts per match for first 9
      v_new_first9_score := COALESCE(v_existing.first9_total_score, 0) + ROUND(p_player_first9_avg * 9 / 3);
      
      UPDATE player_stats SET
        total_matches = total_matches + 1,
        wins = wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
        losses = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
        matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
        matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
        total_darts_thrown = v_new_total_darts,
        total_score = v_new_total_score,
        -- Weighted 3-dart average
        overall_3dart_avg = CASE 
          WHEN v_new_total_darts > 0 THEN ROUND((v_new_total_score / v_new_total_darts) * 3, 2)
          ELSE 0 
        END,
        -- First 9 tracking
        first9_total_score = v_new_first9_score,
        first9_total_darts = v_new_first9_darts,
        overall_first9_avg = CASE 
          WHEN v_new_first9_darts > 0 THEN ROUND((v_new_first9_score / v_new_first9_darts) * 3, 2)
          ELSE 0 
        END,
        highest_checkout = GREATEST(highest_checkout, p_player_highest_checkout),
        total_checkouts = total_checkouts + v_total_checkouts,
        checkout_attempts = checkout_attempts + v_checkout_attempts,
        checkout_percentage = CASE 
          WHEN (COALESCE(checkout_attempts, 0) + v_checkout_attempts) > 0 
          THEN ROUND(((COALESCE(total_checkouts, 0) + v_total_checkouts)::DECIMAL / (COALESCE(checkout_attempts, 0) + v_checkout_attempts)) * 100, 2)
          ELSE 0 
        END,
        visits_100_plus = visits_100_plus + p_player_100_plus,
        visits_140_plus = visits_140_plus + p_player_140_plus,
        visits_180 = visits_180 + p_player_180s,
        current_win_streak = CASE WHEN v_result = 'win' THEN COALESCE(current_win_streak, 0) + 1 ELSE 0 END,
        best_win_streak = CASE 
          WHEN v_result = 'win' AND COALESCE(current_win_streak, 0) + 1 > COALESCE(best_win_streak, 0) 
          THEN COALESCE(current_win_streak, 0) + 1 
          ELSE COALESCE(best_win_streak, 0) 
        END,
        updated_at = NOW()
      WHERE user_id = v_user_id;
    END;
  END IF;

  -- ========================================
  -- STEP 3: Return summary
  -- ========================================
  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'result', v_result,
    'legs_won', p_player_legs_won,
    'legs_lost', p_bot_legs_won,
    'player_avg', p_player_three_dart_avg,
    'bot_avg', p_bot_three_dart_avg,
    'checkout_pct', p_player_checkout_pct,
    'highest_checkout', p_player_highest_checkout
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, 
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, 
  INTEGER, INTEGER, INTEGER,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT, 
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER, 
  INTEGER, INTEGER, INTEGER,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER
) TO anon;

-- ============================================
-- STEP 3: Ensure indexes exist for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_match_history_user_format_bot 
  ON match_history(user_id, match_format, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_history_user_played_at 
  ON match_history(user_id, played_at DESC);

-- ============================================
-- STEP 4: Fix any existing dartbot matches that might have null opponent stats
-- ============================================
UPDATE match_history 
SET 
  opponent_three_dart_avg = COALESCE(opponent_three_dart_avg, (metadata->'bot_stats'->>'three_dart_avg')::DECIMAL),
  opponent_first9_avg = COALESCE(opponent_first9_avg, (metadata->'bot_stats'->>'first9_avg')::DECIMAL),
  opponent_highest_checkout = COALESCE(opponent_highest_checkout, (metadata->'bot_stats'->>'highest_checkout')::INTEGER),
  opponent_checkout_percentage = COALESCE(opponent_checkout_percentage, (metadata->'bot_stats'->>'checkout_pct')::DECIMAL),
  opponent_darts_thrown = COALESCE(opponent_darts_thrown, (metadata->'bot_stats'->>'total_darts')::INTEGER),
  opponent_visits_100_plus = COALESCE(opponent_visits_100_plus, (metadata->'bot_stats'->>'visits_100_plus')::INTEGER),
  opponent_visits_140_plus = COALESCE(opponent_visits_140_plus, (metadata->'bot_stats'->>'visits_140_plus')::INTEGER),
  opponent_visits_180 = COALESCE(opponent_visits_180, (metadata->'bot_stats'->>'visits_180')::INTEGER)
WHERE match_format = 'dartbot'
  AND metadata IS NOT NULL
  AND metadata->'bot_stats' IS NOT NULL;

SELECT 'Dartbot stats recording fixed successfully!' as status;
