-- ============================================
-- ADD: DartBot Stats Parameters to RPC
-- ============================================
-- This migration adds bot stats tracking to the dartbot match completion RPC

-- ============================================
-- STEP 1: Add metadata column to match_history if not exists
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_history' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE match_history ADD COLUMN metadata jsonb DEFAULT NULL;
  END IF;
END $$;

-- ============================================
-- STEP 2: Update the RPC function
-- ============================================
-- Drop ALL existing versions of the function
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc 
    WHERE proname = 'record_dartbot_match_completion'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
END $$;

-- Create the updated RPC function with bot stats parameters
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
BEGIN
  -- Validate user
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Generate a unique room_id for dartbot matches
  v_room_id := gen_random_uuid();

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
    -- Store bot stats in JSONB for retrieval
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
    0, -- total_score not tracked separately for player
    CASE WHEN p_player_checkout_pct > 0 THEN 1 ELSE 0 END,
    p_player_darts_at_double,
    p_player_100_plus,
    p_player_140_plus,
    p_player_180s,
    NOW(),
    -- Store bot stats in metadata
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
      )
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
      best_win_streak
    ) VALUES (
      v_user_id,
      1,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      p_player_total_darts,
      COALESCE(p_player_three_dart_avg * p_player_total_darts / 3, 0),
      p_player_three_dart_avg,
      p_player_first9_avg,
      p_player_highest_checkout,
      CASE WHEN p_player_checkout_pct > 0 THEN 1 ELSE 0 END,
      p_player_darts_at_double,
      p_player_checkout_pct,
      p_player_100_plus,
      p_player_140_plus,
      p_player_180s,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN v_result = 'win' THEN 1 ELSE 0 END
    );
  ELSE
    -- Update existing stats
    UPDATE player_stats SET
      total_matches = total_matches + 1,
      wins = wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = total_darts_thrown + p_player_total_darts,
      total_score = total_score + COALESCE(p_player_three_dart_avg * p_player_total_darts / 3, 0),
      overall_3dart_avg = ROUND((
        (overall_3dart_avg * total_darts_thrown + p_player_three_dart_avg * p_player_total_darts) / 
        (total_darts_thrown + p_player_total_darts)
      ), 2),
      overall_first9_avg = ROUND((
        (overall_first9_avg * (total_darts_thrown + p_player_total_darts) + p_player_first9_avg * p_player_total_darts) / 
        (total_darts_thrown + p_player_total_darts)
      ) * 3, 2),
      highest_checkout = GREATEST(highest_checkout, p_player_highest_checkout),
      total_checkouts = total_checkouts + CASE WHEN p_player_checkout_pct > 0 THEN 1 ELSE 0 END,
      checkout_attempts = checkout_attempts + p_player_darts_at_double,
      checkout_percentage = ROUND((total_checkouts::DECIMAL / NULLIF(checkout_attempts, 0)) * 100, 2),
      visits_100_plus = visits_100_plus + p_player_100_plus,
      visits_140_plus = visits_140_plus + p_player_140_plus,
      visits_180 = visits_180 + p_player_180s,
      current_win_streak = CASE WHEN v_result = 'win' THEN current_win_streak + 1 ELSE 0 END,
      best_win_streak = CASE WHEN v_result = 'win' AND current_win_streak + 1 > best_win_streak 
        THEN current_win_streak + 1 ELSE best_win_streak END,
      updated_at = NOW()
    WHERE user_id = v_user_id;
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
    'bot_avg', p_bot_three_dart_avg
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

SELECT 'Dartbot RPC with bot stats added!' as status;
