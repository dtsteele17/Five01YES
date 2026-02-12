-- ============================================================================
-- FIX WIN STREAK CALCULATION
-- 
-- This migration adds win streak columns to player_stats and creates
-- functions to calculate streaks from match_history
-- ============================================================================

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO player_stats
-- ============================================================================

-- Add current_win_streak column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_stats' 
    AND column_name = 'current_win_streak'
  ) THEN
    ALTER TABLE player_stats ADD COLUMN current_win_streak integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add best_win_streak column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'player_stats' 
    AND column_name = 'best_win_streak'
  ) THEN
    ALTER TABLE player_stats ADD COLUMN best_win_streak integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 2. FUNCTION: Calculate Win Streak from match_history
-- Returns the current consecutive win count for a user
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_win_streak(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak integer := 0;
  v_match RECORD;
BEGIN
  -- Loop through matches in reverse chronological order
  FOR v_match IN 
    SELECT result 
    FROM match_history 
    WHERE user_id = p_user_id 
    ORDER BY played_at DESC
  LOOP
    IF v_match.result = 'win' THEN
      v_streak := v_streak + 1;
    ELSIF v_match.result = 'loss' THEN
      EXIT; -- Stop at first loss
    END IF;
    -- Ignore 'draw' - it doesn't break streak but doesn't add to it
  END LOOP;
  
  RETURN v_streak;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_win_streak(uuid) TO authenticated;

-- ============================================================================
-- 3. FUNCTION: Calculate Best Win Streak from match_history
-- Returns the highest consecutive win count ever achieved
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_best_win_streak(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_streak integer := 0;
  v_best_streak integer := 0;
  v_match RECORD;
BEGIN
  -- Loop through all matches in chronological order
  FOR v_match IN 
    SELECT result 
    FROM match_history 
    WHERE user_id = p_user_id 
    ORDER BY played_at ASC
  LOOP
    IF v_match.result = 'win' THEN
      v_current_streak := v_current_streak + 1;
      IF v_current_streak > v_best_streak THEN
        v_best_streak := v_current_streak;
      END IF;
    ELSIF v_match.result = 'loss' THEN
      v_current_streak := 0; -- Reset on loss
    END IF;
    -- Ignore 'draw' - doesn't affect streak
  END LOOP;
  
  RETURN v_best_streak;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_best_win_streak(uuid) TO authenticated;

-- ============================================================================
-- 4. FUNCTION: Get Dashboard Stats with Proper Streak
-- Returns all dashboard stats including calculated streaks
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_matches integer;
  v_wins integer;
  v_losses integer;
  v_current_streak integer;
  v_best_streak integer;
BEGIN
  -- Count total matches
  SELECT COUNT(*) INTO v_total_matches
  FROM match_history
  WHERE user_id = p_user_id;

  -- Count wins
  SELECT COUNT(*) INTO v_wins
  FROM match_history
  WHERE user_id = p_user_id AND result = 'win';

  -- Count losses
  SELECT COUNT(*) INTO v_losses
  FROM match_history
  WHERE user_id = p_user_id AND result = 'loss';

  -- Calculate current streak
  v_current_streak := calculate_win_streak(p_user_id);
  
  -- Calculate best streak
  v_best_streak := calculate_best_win_streak(p_user_id);

  RETURN jsonb_build_object(
    'total_matches', v_total_matches,
    'wins', v_wins,
    'losses', v_losses,
    'win_rate', CASE WHEN v_total_matches > 0 THEN ROUND((v_wins::numeric / v_total_matches) * 100, 1) ELSE 0 END,
    'current_streak', v_current_streak,
    'best_streak', v_best_streak
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats(uuid) TO authenticated;

-- ============================================================================
-- 5. TRIGGER: Update player_stats streak when match_history changes
-- ============================================================================

CREATE OR REPLACE FUNCTION update_streak_from_match_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_streak integer;
  v_best_streak integer;
  v_total_matches integer;
  v_wins integer;
  v_losses integer;
BEGIN
  -- Calculate new stats for the user
  v_current_streak := calculate_win_streak(NEW.user_id);
  v_best_streak := calculate_best_win_streak(NEW.user_id);
  
  SELECT COUNT(*) INTO v_total_matches
  FROM match_history WHERE user_id = NEW.user_id;
  
  SELECT COUNT(*) INTO v_wins
  FROM match_history WHERE user_id = NEW.user_id AND result = 'win';
  
  SELECT COUNT(*) INTO v_losses
  FROM match_history WHERE user_id = NEW.user_id AND result = 'loss';

  -- Update or insert player_stats
  INSERT INTO player_stats (
    user_id,
    total_matches,
    wins,
    losses,
    current_win_streak,
    best_win_streak,
    updated_at
  ) VALUES (
    NEW.user_id,
    v_total_matches,
    v_wins,
    v_losses,
    v_current_streak,
    v_best_streak,
    NOW()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = v_total_matches,
    wins = v_wins,
    losses = v_losses,
    current_win_streak = v_current_streak,
    best_win_streak = CASE 
      WHEN v_current_streak > player_stats.best_win_streak 
      THEN v_current_streak 
      ELSE player_stats.best_win_streak 
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_streak_on_match ON match_history;

-- Create trigger
CREATE TRIGGER trg_update_streak_on_match
  AFTER INSERT ON match_history
  FOR EACH ROW
  EXECUTE FUNCTION update_streak_from_match_history();

-- ============================================================================
-- 6. BACKFILL: Update existing player_stats with correct streaks
-- ============================================================================

DO $$
DECLARE
  v_user RECORD;
  v_current_streak integer;
  v_best_streak integer;
  v_total_matches integer;
  v_wins integer;
  v_losses integer;
BEGIN
  FOR v_user IN SELECT DISTINCT user_id FROM match_history
  LOOP
    v_current_streak := calculate_win_streak(v_user.user_id);
    v_best_streak := calculate_best_win_streak(v_user.user_id);
    
    SELECT COUNT(*) INTO v_total_matches
    FROM match_history WHERE user_id = v_user.user_id;
    
    SELECT COUNT(*) INTO v_wins
    FROM match_history WHERE user_id = v_user.user_id AND result = 'win';
    
    SELECT COUNT(*) INTO v_losses
    FROM match_history WHERE user_id = v_user.user_id AND result = 'loss';

    INSERT INTO player_stats (
      user_id,
      total_matches,
      wins,
      losses,
      current_win_streak,
      best_win_streak,
      updated_at
    ) VALUES (
      v_user.user_id,
      v_total_matches,
      v_wins,
      v_losses,
      v_current_streak,
      v_best_streak,
      NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      total_matches = v_total_matches,
      wins = v_wins,
      losses = v_losses,
      current_win_streak = v_current_streak,
      best_win_streak = GREATEST(player_stats.best_win_streak, v_best_streak),
      updated_at = NOW();
  END LOOP;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================
