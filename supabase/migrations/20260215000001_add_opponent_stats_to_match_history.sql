-- ============================================================================
-- ADD OPPONENT STATS TO MATCH_HISTORY
-- ============================================================================
-- This allows storing opponent stats directly in the user's match_history row
-- so we can display opponent stats in the "Last 3 Games" section without
-- needing to query opponent's private match_history entries (RLS restricted)

-- Add opponent stats columns to match_history
ALTER TABLE public.match_history
ADD COLUMN IF NOT EXISTS opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_first9_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_highest_checkout INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_darts_thrown INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_100_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_140_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_180 INTEGER DEFAULT 0;

-- Update the RLS policy to allow viewing opponent stats (stored in user's own row)
-- No RLS changes needed since opponent stats are now in the user's row

-- ============================================================================
-- UPDATE save_match_stats TO INCLUDE OPPONENT STATS
-- ============================================================================

CREATE OR REPLACE FUNCTION save_match_stats(
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
  v_winner_name TEXT;
  v_loser_name TEXT;
BEGIN
  -- Get usernames
  SELECT username INTO v_winner_name FROM profiles WHERE user_id = p_winner_id;
  SELECT username INTO v_loser_name FROM profiles WHERE user_id = p_loser_id;

  -- Calculate stats for winner
  SELECT 
    COALESCE(AVG(CASE WHEN darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as three_dart_avg,
    COALESCE(AVG(CASE WHEN turn_no <= 3 AND darts_thrown > 0 THEN (score::decimal / darts_thrown) * 3 END), 0) as first9_avg,
    COALESCE(MAX(CASE WHEN is_checkout THEN remaining_before END), 0) as highest_checkout,
    COALESCE((COUNT(CASE WHEN is_checkout THEN 1 END)::decimal / NULLIF(COUNT(CASE WHEN remaining_before <= 100 THEN 1 END), 0)) * 100, 0) as checkout_pct,
    COALESCE(SUM(darts_thrown), 0) as darts_thrown,
    COALESCE(SUM(CASE WHEN score >= 100 THEN 1 END), 0) as visits_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 THEN 1 END), 0) as visits_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 END), 0) as visits_180
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
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 END), 0) as visits_180
  INTO v_loser_stats
  FROM quick_match_visits
  WHERE room_id = p_room_id AND player_id = p_loser_id;

  -- Insert winner's match history with opponent (loser) stats
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format,
    result, legs_won, legs_lost,
    three_dart_avg, first9_avg, highest_checkout, checkout_percentage, darts_thrown,
    visits_100_plus, visits_140_plus, visits_180,
    opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout, 
    opponent_checkout_percentage, opponent_darts_thrown,
    opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
  ) VALUES (
    p_room_id, p_winner_id, p_loser_id, p_game_mode, 'quick',
    'win', p_winner_legs, p_loser_legs,
    COALESCE(v_winner_stats.three_dart_avg, 0),
    COALESCE(v_winner_stats.first9_avg, 0),
    COALESCE(v_winner_stats.highest_checkout, 0),
    COALESCE(v_winner_stats.checkout_pct, 0),
    COALESCE(v_winner_stats.darts_thrown, 0),
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
    COALESCE(v_loser_stats.visits_180, 0)
  )
  ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = 'win',
    legs_won = p_winner_legs,
    legs_lost = p_loser_legs,
    three_dart_avg = COALESCE(v_winner_stats.three_dart_avg, 0),
    first9_avg = COALESCE(v_winner_stats.first9_avg, 0),
    highest_checkout = COALESCE(v_winner_stats.highest_checkout, 0),
    checkout_percentage = COALESCE(v_winner_stats.checkout_pct, 0),
    darts_thrown = COALESCE(v_winner_stats.darts_thrown, 0),
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
    played_at = now();

  -- Insert loser's match history with opponent (winner) stats
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format,
    result, legs_won, legs_lost,
    three_dart_avg, first9_avg, highest_checkout, checkout_percentage, darts_thrown,
    visits_100_plus, visits_140_plus, visits_180,
    opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout, 
    opponent_checkout_percentage, opponent_darts_thrown,
    opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
  ) VALUES (
    p_room_id, p_loser_id, p_winner_id, p_game_mode, 'quick',
    'loss', p_loser_legs, p_winner_legs,
    COALESCE(v_loser_stats.three_dart_avg, 0),
    COALESCE(v_loser_stats.first9_avg, 0),
    COALESCE(v_loser_stats.highest_checkout, 0),
    COALESCE(v_loser_stats.checkout_pct, 0),
    COALESCE(v_loser_stats.darts_thrown, 0),
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
    COALESCE(v_winner_stats.visits_180, 0)
  )
  ON CONFLICT (room_id, user_id) DO UPDATE SET
    result = 'loss',
    legs_won = p_loser_legs,
    legs_lost = p_winner_legs,
    three_dart_avg = COALESCE(v_loser_stats.three_dart_avg, 0),
    first9_avg = COALESCE(v_loser_stats.first9_avg, 0),
    highest_checkout = COALESCE(v_loser_stats.highest_checkout, 0),
    checkout_percentage = COALESCE(v_loser_stats.checkout_pct, 0),
    darts_thrown = COALESCE(v_loser_stats.darts_thrown, 0),
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
    played_at = now();

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION save_match_stats(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION save_match_stats(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- UNIQUE CONSTRAINT TO PREVENT DUPLICATE ENTRIES
-- ============================================================================

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_match_history_room_user_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_match_history_room_user_unique 
    ON match_history(room_id, user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

SELECT 'Opponent stats columns added to match_history!' as status;
