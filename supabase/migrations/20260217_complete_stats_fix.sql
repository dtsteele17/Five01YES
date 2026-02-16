-- ============================================================================
-- COMPLETE STATS FIX - Run this single file
-- ============================================================================
-- This fixes:
-- 1. match_history table structure and constraints
-- 2. fn_update_player_match_stats return type (UUID)
-- 3. fn_record_quick_match_complete for saving both winner and loser stats
-- 4. RLS policies for match_history
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix match_history table structure
-- ============================================================================

-- Ensure match_history has all required columns
ALTER TABLE match_history 
ADD COLUMN IF NOT EXISTS match_format TEXT DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS bot_level INTEGER,
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Ensure all columns have proper defaults
ALTER TABLE match_history 
ALTER COLUMN match_format SET DEFAULT 'quick',
ALTER COLUMN three_dart_avg SET DEFAULT 0,
ALTER COLUMN first9_avg SET DEFAULT 0,
ALTER COLUMN highest_checkout SET DEFAULT 0,
ALTER COLUMN checkout_percentage SET DEFAULT 0,
ALTER COLUMN darts_thrown SET DEFAULT 0,
ALTER COLUMN total_score SET DEFAULT 0,
ALTER COLUMN visits_100_plus SET DEFAULT 0,
ALTER COLUMN visits_140_plus SET DEFAULT 0,
ALTER COLUMN visits_180 SET DEFAULT 0;

-- Drop existing constraint if exists and recreate
ALTER TABLE match_history 
DROP CONSTRAINT IF EXISTS unique_room_user_match_history;

ALTER TABLE match_history 
ADD CONSTRAINT unique_room_user_match_history 
UNIQUE (room_id, user_id);

-- Enable RLS
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "match_history_select_policy" ON match_history;
DROP POLICY IF EXISTS "match_history_insert_policy" ON match_history;
DROP POLICY IF EXISTS "match_history_update_policy" ON match_history;
DROP POLICY IF EXISTS "Users can view their own match history" ON match_history;
DROP POLICY IF EXISTS "System can insert match history" ON match_history;

-- Create clean policies
CREATE POLICY "match_history_select_policy" ON match_history
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "match_history_insert_policy" ON match_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "match_history_update_policy" ON match_history
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================================
-- STEP 2: Drop existing functions (to fix return type change)
-- ============================================================================

DROP FUNCTION IF EXISTS fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS fn_record_quick_match_complete(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER);

-- ============================================================================
-- STEP 3: Create fn_update_player_match_stats with UUID return type
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_update_player_match_stats(
  p_room_id UUID,
  p_user_id UUID,
  p_opponent_id UUID,
  p_result TEXT,
  p_legs_won INTEGER,
  p_legs_lost INTEGER,
  p_game_mode INTEGER DEFAULT 501
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match_format TEXT := 'quick';
  v_match_darts INTEGER := 0;
  v_match_score INTEGER := 0;
  v_match_avg DECIMAL(5,2) := 0;
  v_match_first9_avg DECIMAL(5,2) := 0;
  v_match_highest_checkout INTEGER := 0;
  v_match_checkouts INTEGER := 0;
  v_match_checkout_attempts INTEGER := 0;
  v_match_checkout_pct DECIMAL(5,2) := 0;
  v_match_100_plus INTEGER := 0;
  v_match_140_plus INTEGER := 0;
  v_match_180s INTEGER := 0;
  v_match_first9_score INTEGER := 0;
  v_match_first9_darts INTEGER := 0;
  v_visit_count INTEGER := 0;
  v_visit RECORD;
  v_history_id UUID;
  v_existing RECORD;
BEGIN
  -- Calculate stats from quick_match_visits
  FOR v_visit IN 
    SELECT * FROM quick_match_visits 
    WHERE room_id = p_room_id AND player_id = p_user_id AND is_bust = false
    ORDER BY created_at
  LOOP
    v_visit_count := v_visit_count + 1;
    v_match_darts := v_match_darts + COALESCE(v_visit.darts_thrown, 3);
    v_match_score := v_match_score + v_visit.score;
    
    IF v_visit_count <= 3 THEN
      v_match_first9_score := v_match_first9_score + v_visit.score;
      v_match_first9_darts := v_match_first9_darts + COALESCE(v_visit.darts_thrown, 3);
    END IF;
    
    IF v_visit.is_checkout THEN
      v_match_checkouts := v_match_checkouts + 1;
      IF v_visit.score > v_match_highest_checkout THEN
        v_match_highest_checkout := v_visit.score;
      END IF;
    END IF;
    
    IF v_visit.remaining_before <= 170 AND v_visit.remaining_before > 0 THEN
      v_match_checkout_attempts := v_match_checkout_attempts + 1;
    END IF;
    
    IF v_visit.score >= 180 THEN
      v_match_180s := v_match_180s + 1;
      v_match_140_plus := v_match_140_plus + 1;
      v_match_100_plus := v_match_100_plus + 1;
    ELSIF v_visit.score >= 140 THEN
      v_match_140_plus := v_match_140_plus + 1;
      v_match_100_plus := v_match_100_plus + 1;
    ELSIF v_visit.score >= 100 THEN
      v_match_100_plus := v_match_100_plus + 1;
    END IF;
  END LOOP;
  
  IF v_match_darts > 0 THEN
    v_match_avg := ROUND(((v_match_score::DECIMAL / v_match_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_first9_darts > 0 THEN
    v_match_first9_avg := ROUND(((v_match_first9_score::DECIMAL / v_match_first9_darts) * 3)::DECIMAL, 2);
  END IF;
  
  IF v_match_checkout_attempts > 0 THEN
    v_match_checkout_pct := ROUND(((v_match_checkouts::DECIMAL / v_match_checkout_attempts) * 100)::DECIMAL, 2);
  END IF;
  
  -- Insert to match_history
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
    v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
    v_match_100_plus, v_match_140_plus, v_match_180s, NOW()
  )
  ON CONFLICT ON CONSTRAINT unique_room_user_match_history 
  DO UPDATE SET
    result = EXCLUDED.result,
    legs_won = EXCLUDED.legs_won,
    legs_lost = EXCLUDED.legs_lost,
    three_dart_avg = EXCLUDED.three_dart_avg,
    first9_avg = EXCLUDED.first9_avg,
    highest_checkout = EXCLUDED.highest_checkout,
    checkout_percentage = EXCLUDED.checkout_percentage,
    darts_thrown = EXCLUDED.darts_thrown,
    total_score = EXCLUDED.total_score,
    total_checkouts = EXCLUDED.total_checkouts,
    checkout_attempts = EXCLUDED.checkout_attempts,
    visits_100_plus = EXCLUDED.visits_100_plus,
    visits_140_plus = EXCLUDED.visits_140_plus,
    visits_180 = EXCLUDED.visits_180,
    played_at = EXCLUDED.played_at
  RETURNING id INTO v_history_id;
  
  -- Update player_stats
  SELECT * INTO v_existing FROM player_stats WHERE user_id = p_user_id;
  
  IF v_existing IS NULL THEN
    INSERT INTO player_stats (
      user_id, total_matches, wins, losses, draws,
      matches_301, matches_501,
      total_darts_thrown, total_score,
      overall_3dart_avg, overall_first9_avg,
      highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
      visits_100_plus, visits_140_plus, visits_180
    ) VALUES (
      p_user_id, 1,
      CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      v_match_darts, v_match_score,
      v_match_avg, v_match_first9_avg,
      v_match_highest_checkout, v_match_checkouts, v_match_checkout_attempts, v_match_checkout_pct,
      v_match_100_plus, v_match_140_plus, v_match_180s
    );
  ELSE
    UPDATE player_stats SET
      total_matches = total_matches + 1,
      wins = wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
      draws = draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
      matches_301 = matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
      matches_501 = matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
      total_darts_thrown = total_darts_thrown + v_match_darts,
      total_score = total_score + v_match_score,
      overall_3dart_avg = CASE 
        WHEN (total_darts_thrown + v_match_darts) > 0 
        THEN ROUND(((total_score + v_match_score)::DECIMAL / (total_darts_thrown + v_match_darts)) * 3, 2)
        ELSE 0 
      END,
      highest_checkout = GREATEST(highest_checkout, v_match_highest_checkout),
      total_checkouts = total_checkouts + v_match_checkouts,
      checkout_attempts = checkout_attempts + v_match_checkout_attempts,
      checkout_percentage = CASE 
        WHEN (checkout_attempts + v_match_checkout_attempts) > 0 
        THEN ROUND(((total_checkouts + v_match_checkouts)::DECIMAL / (checkout_attempts + v_match_checkout_attempts)) * 100, 2)
        ELSE 0 
      END,
      visits_100_plus = visits_100_plus + v_match_100_plus,
      visits_140_plus = visits_140_plus + v_match_140_plus,
      visits_180 = visits_180 + v_match_180s,
      last_played_at = NOW()
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN v_history_id;
END;
$$;

-- ============================================================================
-- STEP 4: Create fn_record_quick_match_complete for saving both players
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_record_quick_match_complete(
  p_room_id UUID,
  p_winner_id UUID,
  p_loser_id UUID,
  p_winner_legs INTEGER,
  p_loser_legs INTEGER,
  p_game_mode INTEGER DEFAULT 501
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_winner_history_id UUID;
  v_loser_history_id UUID;
BEGIN
  -- Record winner stats
  SELECT fn_update_player_match_stats(
    p_room_id,
    p_winner_id,
    p_loser_id,
    'win',
    p_winner_legs,
    p_loser_legs,
    p_game_mode
  ) INTO v_winner_history_id;
  
  -- Record loser stats
  SELECT fn_update_player_match_stats(
    p_room_id,
    p_loser_id,
    p_winner_id,
    'loss',
    p_loser_legs,
    p_winner_legs,
    p_game_mode
  ) INTO v_loser_history_id;
  
  v_result := jsonb_build_object(
    'success', true,
    'winner_history_id', v_winner_history_id,
    'loser_history_id', v_loser_history_id
  );
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ============================================================================
-- STEP 5: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION fn_update_player_match_stats TO authenticated;
GRANT EXECUTE ON FUNCTION fn_update_player_match_stats TO service_role;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete TO authenticated;
GRANT EXECUTE ON FUNCTION fn_record_quick_match_complete TO service_role;

-- ============================================================================
-- STEP 6: Enable realtime for match_history
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE match_history;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Complete stats fix applied successfully!' as status;
