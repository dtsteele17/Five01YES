-- ============================================================================
-- FINAL OPPONENT STATS FIX FOR DARTBOT MATCHES
-- ============================================================================
-- This migration aligns the RPC function with frontend parameters
-- and ensures bot stats are stored as opponent stats

-- First ensure all opponent stats columns exist
ALTER TABLE public.match_history
ADD COLUMN IF NOT EXISTS opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_first9_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_highest_checkout INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_darts_thrown INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_100_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_140_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_180 INTEGER DEFAULT 0;

-- Drop all existing versions of the function
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

-- Create the updated function with correct parameter names matching the frontend
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
  -- Bot stats as opponent stats
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
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Generate a unique room_id for this match
  v_room_id := gen_random_uuid();
  
  -- Insert into match_history with bot stats stored as opponent stats
  INSERT INTO match_history (
    room_id,
    user_id,
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
    total_checkouts,
    checkout_attempts,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    played_at,
    bot_level,
    -- Bot stats as opponent stats
    opponent_three_dart_avg,
    opponent_first9_avg,
    opponent_highest_checkout,
    opponent_checkout_percentage,
    opponent_darts_thrown,
    opponent_visits_100_plus,
    opponent_visits_140_plus,
    opponent_visits_180
  ) VALUES (
    v_room_id,
    v_user_id,
    NULL, -- No opponent_id for bot matches
    p_game_mode,
    'dartbot',
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
    p_player_legs_won,
    p_bot_legs_won,
    p_player_three_dart_avg,
    p_player_first9_avg,
    p_player_highest_checkout,
    p_player_checkout_pct,
    p_player_total_darts,
    -- Calculate total checkouts from legs won (approximation)
    p_player_legs_won,
    p_player_darts_at_double,
    p_player_100_plus,
    p_player_140_plus,
    p_player_180s,
    NOW(),
    p_dartbot_level,
    -- Bot stats as opponent stats
    p_bot_three_dart_avg,
    p_bot_first9_avg,
    p_bot_highest_checkout,
    p_bot_checkout_pct,
    p_bot_total_darts,
    p_bot_100_plus,
    p_bot_140_plus,
    p_bot_180s
  );
  
  -- Update player_stats aggregate table via the existing function
  PERFORM update_player_stats_from_dartbot(
    v_user_id,
    p_game_mode,
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
    p_player_total_darts,
    0, -- total_score not directly passed
    p_player_100_plus,
    p_player_140_plus,
    p_player_180s,
    p_player_legs_won, -- total_checkouts approximated by legs won
    p_player_darts_at_double,
    p_player_highest_checkout
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Dartbot match recorded with opponent stats'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, INTEGER
) TO authenticated;

-- Also create/update the update_player_stats_from_dartbot function if it doesn't exist
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
  -- Insert or update player_stats
  INSERT INTO player_stats (
    user_id,
    game_mode,
    matches_played,
    matches_won,
    matches_lost,
    total_darts_thrown,
    total_score,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    total_checkouts,
    checkout_attempts,
    highest_checkout,
    updated_at
  ) VALUES (
    p_user_id,
    p_game_mode,
    1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    p_darts_thrown,
    p_total_score,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    p_total_checkouts,
    p_checkout_attempts,
    p_highest_checkout,
    NOW()
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

GRANT EXECUTE ON FUNCTION update_player_stats_from_dartbot(
  UUID, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER
) TO authenticated;

-- Create a view for easy match history with opponent stats
CREATE OR REPLACE VIEW v_match_history_with_opponents AS
SELECT 
  mh.*,
  p.username as opponent_username,
  CASE 
    WHEN mh.opponent_three_dart_avg > 0 THEN mh.opponent_three_dart_avg::text
    ELSE '-'
  END as opponent_avg_display,
  CASE 
    WHEN mh.bot_level IS NOT NULL THEN 'DartBot(' || mh.bot_level || ')'
    ELSE p.username
  END as display_opponent_name
FROM match_history mh
LEFT JOIN profiles p ON p.user_id = mh.opponent_id;

GRANT SELECT ON v_match_history_with_opponents TO authenticated;

-- Verify setup
SELECT 'Opponent stats fix complete!' as status;
