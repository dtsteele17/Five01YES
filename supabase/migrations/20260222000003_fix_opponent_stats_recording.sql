-- ============================================================================
-- FIX: Opponent Stats Recording for Match History
-- ============================================================================
-- This ensures both player and opponent stats are saved when a match ends

-- 1. Drop and recreate the match completion trigger function with opponent stats
-- ============================================================================
DROP FUNCTION IF EXISTS trg_record_match_completion() CASCADE;

CREATE OR REPLACE FUNCTION trg_record_match_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_winner_id UUID;
  v_loser_id UUID;
  v_winner_legs INTEGER;
  v_loser_legs INTEGER;
  v_result JSONB;
  v_player1_stats JSONB;
  v_player2_stats JSONB;
BEGIN
  -- Only proceed if status changed to 'finished' or 'forfeited'
  IF NEW.status IN ('finished', 'forfeited') AND OLD.status NOT IN ('finished', 'forfeited') THEN
    
    -- Calculate stats for both players from quick_match_visits
    -- Player 1 stats
    SELECT jsonb_build_object(
      'darts', COALESCE(SUM(darts_thrown), 0),
      'score', COALESCE(SUM(CASE WHEN is_bust = false OR is_bust IS NULL THEN score ELSE 0 END), 0),
      'checkouts', COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0),
      'checkout_score', COALESCE(MAX(CASE WHEN is_checkout THEN score ELSE 0 END), 0),
      'visits_100', COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'visits_140', COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'visits_180', COALESCE(SUM(CASE WHEN score >= 180 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'first9_score', COALESCE((SELECT SUM(score) FROM (
        SELECT score FROM quick_match_visits 
        WHERE room_id = NEW.id AND player_id = NEW.player1_id AND (is_bust = false OR is_bust IS NULL)
        ORDER BY created_at LIMIT 3
      ) first3), 0),
      'first9_darts', COALESCE((SELECT SUM(darts_thrown) FROM (
        SELECT darts_thrown FROM quick_match_visits 
        WHERE room_id = NEW.id AND player_id = NEW.player1_id AND (is_bust = false OR is_bust IS NULL)
        ORDER BY created_at LIMIT 3
      ) first3), 0)
    ) INTO v_player1_stats
    FROM quick_match_visits
    WHERE room_id = NEW.id AND player_id = NEW.player1_id;

    -- Player 2 stats
    SELECT jsonb_build_object(
      'darts', COALESCE(SUM(darts_thrown), 0),
      'score', COALESCE(SUM(CASE WHEN is_bust = false OR is_bust IS NULL THEN score ELSE 0 END), 0),
      'checkouts', COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0),
      'checkout_score', COALESCE(MAX(CASE WHEN is_checkout THEN score ELSE 0 END), 0),
      'visits_100', COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'visits_140', COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'visits_180', COALESCE(SUM(CASE WHEN score >= 180 AND (is_bust = false OR is_bust IS NULL) THEN 1 ELSE 0 END), 0),
      'first9_score', COALESCE((SELECT SUM(score) FROM (
        SELECT score FROM quick_match_visits 
        WHERE room_id = NEW.id AND player_id = NEW.player2_id AND (is_bust = false OR is_bust IS NULL)
        ORDER BY created_at LIMIT 3
      ) first3), 0),
      'first9_darts', COALESCE((SELECT SUM(darts_thrown) FROM (
        SELECT darts_thrown FROM quick_match_visits 
        WHERE room_id = NEW.id AND player_id = NEW.player2_id AND (is_bust = false OR is_bust IS NULL)
        ORDER BY created_at LIMIT 3
      ) first3), 0)
    ) INTO v_player2_stats
    FROM quick_match_visits
    WHERE room_id = NEW.id AND player_id = NEW.player2_id;

    -- Determine winner and loser
    IF NEW.winner_id = NEW.player1_id THEN
      v_winner_id := NEW.player1_id;
      v_loser_id := NEW.player2_id;
      v_winner_legs := NEW.player1_legs;
      v_loser_legs := NEW.player2_legs;
    ELSIF NEW.winner_id = NEW.player2_id THEN
      v_winner_id := NEW.player2_id;
      v_loser_id := NEW.player1_id;
      v_winner_legs := NEW.player2_legs;
      v_loser_legs := NEW.player1_legs;
    ELSE
      -- Draw or no winner - skip
      RETURN NEW;
    END IF;

    -- Insert match history for winner (with opponent stats)
    INSERT INTO match_history (
      room_id, user_id, opponent_id, game_mode, match_format, result,
      legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
      checkout_percentage, darts_thrown, total_score, total_checkouts,
      visits_100_plus, visits_140_plus, visits_180, played_at,
      -- Opponent stats
      opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
      opponent_checkout_percentage, opponent_darts_thrown,
      opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
    ) VALUES (
      NEW.id, v_winner_id, v_loser_id, NEW.game_mode, 'quick', 'win',
      v_winner_legs, v_loser_legs,
      -- Winner's 3-dart average
      CASE WHEN (v_player1_stats->>'darts')::int > 0 AND v_winner_id = NEW.player1_id 
           THEN ROUND(((v_player1_stats->>'score')::numeric / (v_player1_stats->>'darts')::int) * 3, 2)
           WHEN (v_player2_stats->>'darts')::int > 0 AND v_winner_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'score')::numeric / (v_player2_stats->>'darts')::int) * 3, 2)
           ELSE 0 END,
      -- Winner's first 9 average
      CASE WHEN COALESCE((v_player1_stats->>'first9_darts')::int, 0) > 0 AND v_winner_id = NEW.player1_id
           THEN ROUND(((v_player1_stats->>'first9_score')::numeric / (v_player1_stats->>'first9_darts')::int) * 3, 2)
           WHEN COALESCE((v_player2_stats->>'first9_darts')::int, 0) > 0 AND v_winner_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'first9_score')::numeric / (v_player2_stats->>'first9_darts')::int) * 3, 2)
           ELSE 0 END,
      -- Winner's highest checkout
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'checkout_score')::int
           ELSE (v_player2_stats->>'checkout_score')::int END,
      -- Checkout percentage (placeholder, would need attempts count)
      0,
      -- Winner's darts thrown
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'darts')::int
           ELSE (v_player2_stats->>'darts')::int END,
      -- Winner's total score
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'score')::int
           ELSE (v_player2_stats->>'score')::int END,
      -- Winner's checkouts
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'checkouts')::int
           ELSE (v_player2_stats->>'checkouts')::int END,
      -- 100+ visits
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_100')::int
           ELSE (v_player2_stats->>'visits_100')::int END,
      -- 140+ visits
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_140')::int
           ELSE (v_player2_stats->>'visits_140')::int END,
      -- 180s
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_180')::int
           ELSE (v_player2_stats->>'visits_180')::int END,
      NOW(),
      -- OPPONENT STATS (loser's stats as opponent)
      -- Opponent 3-dart avg
      CASE WHEN (v_player1_stats->>'darts')::int > 0 AND v_loser_id = NEW.player1_id 
           THEN ROUND(((v_player1_stats->>'score')::numeric / (v_player1_stats->>'darts')::int) * 3, 2)
           WHEN (v_player2_stats->>'darts')::int > 0 AND v_loser_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'score')::numeric / (v_player2_stats->>'darts')::int) * 3, 2)
           ELSE 0 END,
      -- Opponent first 9 avg
      CASE WHEN COALESCE((v_player1_stats->>'first9_darts')::int, 0) > 0 AND v_loser_id = NEW.player1_id
           THEN ROUND(((v_player1_stats->>'first9_score')::numeric / (v_player1_stats->>'first9_darts')::int) * 3, 2)
           WHEN COALESCE((v_player2_stats->>'first9_darts')::int, 0) > 0 AND v_loser_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'first9_score')::numeric / (v_player2_stats->>'first9_darts')::int) * 3, 2)
           ELSE 0 END,
      -- Opponent highest checkout
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'checkout_score')::int
           ELSE (v_player2_stats->>'checkout_score')::int END,
      -- Opponent checkout percentage
      0,
      -- Opponent darts thrown
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'darts')::int
           ELSE (v_player2_stats->>'darts')::int END,
      -- Opponent 100+
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_100')::int
           ELSE (v_player2_stats->>'visits_100')::int END,
      -- Opponent 140+
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_140')::int
           ELSE (v_player2_stats->>'visits_140')::int END,
      -- Opponent 180s
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_180')::int
           ELSE (v_player2_stats->>'visits_180')::int END
    )
    ON CONFLICT ON CONSTRAINT unique_room_user_match_history 
    DO UPDATE SET
      result = EXCLUDED.result,
      legs_won = EXCLUDED.legs_won,
      legs_lost = EXCLUDED.legs_lost,
      three_dart_avg = EXCLUDED.three_dart_avg,
      first9_avg = EXCLUDED.first9_avg,
      highest_checkout = EXCLUDED.highest_checkout,
      darts_thrown = EXCLUDED.darts_thrown,
      total_score = EXCLUDED.total_score,
      total_checkouts = EXCLUDED.total_checkouts,
      visits_100_plus = EXCLUDED.visits_100_plus,
      visits_140_plus = EXCLUDED.visits_140_plus,
      visits_180 = EXCLUDED.visits_180,
      opponent_three_dart_avg = EXCLUDED.opponent_three_dart_avg,
      opponent_first9_avg = EXCLUDED.opponent_first9_avg,
      opponent_highest_checkout = EXCLUDED.opponent_highest_checkout,
      opponent_darts_thrown = EXCLUDED.opponent_darts_thrown,
      opponent_visits_100_plus = EXCLUDED.opponent_visits_100_plus,
      opponent_visits_140_plus = EXCLUDED.opponent_visits_140_plus,
      opponent_visits_180 = EXCLUDED.opponent_visits_180,
      played_at = EXCLUDED.played_at;

    -- Insert match history for loser (with opponent stats)
    INSERT INTO match_history (
      room_id, user_id, opponent_id, game_mode, match_format, result,
      legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
      checkout_percentage, darts_thrown, total_score, total_checkouts,
      visits_100_plus, visits_140_plus, visits_180, played_at,
      -- Opponent stats
      opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
      opponent_checkout_percentage, opponent_darts_thrown,
      opponent_visits_100_plus, opponent_visits_140_plus, opponent_visits_180
    ) VALUES (
      NEW.id, v_loser_id, v_winner_id, NEW.game_mode, 'quick', 'loss',
      v_loser_legs, v_winner_legs,
      -- Loser's 3-dart average
      CASE WHEN (v_player1_stats->>'darts')::int > 0 AND v_loser_id = NEW.player1_id 
           THEN ROUND(((v_player1_stats->>'score')::numeric / (v_player1_stats->>'darts')::int) * 3, 2)
           WHEN (v_player2_stats->>'darts')::int > 0 AND v_loser_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'score')::numeric / (v_player2_stats->>'darts')::int) * 3, 2)
           ELSE 0 END,
      -- Loser's first 9 average
      CASE WHEN COALESCE((v_player1_stats->>'first9_darts')::int, 0) > 0 AND v_loser_id = NEW.player1_id
           THEN ROUND(((v_player1_stats->>'first9_score')::numeric / (v_player1_stats->>'first9_darts')::int) * 3, 2)
           WHEN COALESCE((v_player2_stats->>'first9_darts')::int, 0) > 0 AND v_loser_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'first9_score')::numeric / (v_player2_stats->>'first9_darts')::int) * 3, 2)
           ELSE 0 END,
      -- Loser's highest checkout
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'checkout_score')::int
           ELSE (v_player2_stats->>'checkout_score')::int END,
      -- Checkout percentage
      0,
      -- Loser's darts thrown
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'darts')::int
           ELSE (v_player2_stats->>'darts')::int END,
      -- Loser's total score
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'score')::int
           ELSE (v_player2_stats->>'score')::int END,
      -- Loser's checkouts
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'checkouts')::int
           ELSE (v_player2_stats->>'checkouts')::int END,
      -- 100+ visits
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_100')::int
           ELSE (v_player2_stats->>'visits_100')::int END,
      -- 140+ visits
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_140')::int
           ELSE (v_player2_stats->>'visits_140')::int END,
      -- 180s
      CASE WHEN v_loser_id = NEW.player1_id THEN (v_player1_stats->>'visits_180')::int
           ELSE (v_player2_stats->>'visits_180')::int END,
      NOW(),
      -- OPPONENT STATS (winner's stats as opponent)
      -- Opponent 3-dart avg
      CASE WHEN (v_player1_stats->>'darts')::int > 0 AND v_winner_id = NEW.player1_id 
           THEN ROUND(((v_player1_stats->>'score')::numeric / (v_player1_stats->>'darts')::int) * 3, 2)
           WHEN (v_player2_stats->>'darts')::int > 0 AND v_winner_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'score')::numeric / (v_player2_stats->>'darts')::int) * 3, 2)
           ELSE 0 END,
      -- Opponent first 9 avg
      CASE WHEN COALESCE((v_player1_stats->>'first9_darts')::int, 0) > 0 AND v_winner_id = NEW.player1_id
           THEN ROUND(((v_player1_stats->>'first9_score')::numeric / (v_player1_stats->>'first9_darts')::int) * 3, 2)
           WHEN COALESCE((v_player2_stats->>'first9_darts')::int, 0) > 0 AND v_winner_id = NEW.player2_id
           THEN ROUND(((v_player2_stats->>'first9_score')::numeric / (v_player2_stats->>'first9_darts')::int) * 3, 2)
           ELSE 0 END,
      -- Opponent highest checkout
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'checkout_score')::int
           ELSE (v_player2_stats->>'checkout_score')::int END,
      -- Opponent checkout percentage
      0,
      -- Opponent darts thrown
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'darts')::int
           ELSE (v_player2_stats->>'darts')::int END,
      -- Opponent 100+
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_100')::int
           ELSE (v_player2_stats->>'visits_100')::int END,
      -- Opponent 140+
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_140')::int
           ELSE (v_player2_stats->>'visits_140')::int END,
      -- Opponent 180s
      CASE WHEN v_winner_id = NEW.player1_id THEN (v_player1_stats->>'visits_180')::int
           ELSE (v_player2_stats->>'visits_180')::int END
    )
    ON CONFLICT ON CONSTRAINT unique_room_user_match_history 
    DO UPDATE SET
      result = EXCLUDED.result,
      legs_won = EXCLUDED.legs_won,
      legs_lost = EXCLUDED.legs_lost,
      three_dart_avg = EXCLUDED.three_dart_avg,
      first9_avg = EXCLUDED.first9_avg,
      highest_checkout = EXCLUDED.highest_checkout,
      darts_thrown = EXCLUDED.darts_thrown,
      total_score = EXCLUDED.total_score,
      total_checkouts = EXCLUDED.total_checkouts,
      visits_100_plus = EXCLUDED.visits_100_plus,
      visits_140_plus = EXCLUDED.visits_140_plus,
      visits_180 = EXCLUDED.visits_180,
      opponent_three_dart_avg = EXCLUDED.opponent_three_dart_avg,
      opponent_first9_avg = EXCLUDED.opponent_first9_avg,
      opponent_highest_checkout = EXCLUDED.opponent_highest_checkout,
      opponent_darts_thrown = EXCLUDED.opponent_darts_thrown,
      opponent_visits_100_plus = EXCLUDED.opponent_visits_100_plus,
      opponent_visits_140_plus = EXCLUDED.opponent_visits_140_plus,
      opponent_visits_180 = EXCLUDED.opponent_visits_180,
      played_at = EXCLUDED.played_at;

    -- Also update player_stats aggregate for both players
    -- (This is simplified - full implementation would update running averages)
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Recreate the trigger
DROP TRIGGER IF EXISTS trg_match_rooms_completion ON match_rooms;

CREATE TRIGGER trg_match_rooms_completion
  AFTER UPDATE OF status ON match_rooms
  FOR EACH ROW
  WHEN (NEW.status IN ('finished', 'forfeited'))
  EXECUTE FUNCTION trg_record_match_completion();

-- 3. Ensure match_history has all opponent stats columns
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_three_dart_avg') THEN
    ALTER TABLE match_history ADD COLUMN opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_first9_avg') THEN
    ALTER TABLE match_history ADD COLUMN opponent_first9_avg DECIMAL(5,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_highest_checkout') THEN
    ALTER TABLE match_history ADD COLUMN opponent_highest_checkout INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_checkout_percentage') THEN
    ALTER TABLE match_history ADD COLUMN opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_darts_thrown') THEN
    ALTER TABLE match_history ADD COLUMN opponent_darts_thrown INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_100_plus') THEN
    ALTER TABLE match_history ADD COLUMN opponent_visits_100_plus INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_140_plus') THEN
    ALTER TABLE match_history ADD COLUMN opponent_visits_140_plus INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'opponent_visits_180') THEN
    ALTER TABLE match_history ADD COLUMN opponent_visits_180 INTEGER DEFAULT 0;
  END IF;
END $$;

-- 4. Create view to verify stats are being saved correctly
DROP VIEW IF EXISTS v_match_history_with_opponent_stats;

CREATE VIEW v_match_history_with_opponent_stats AS
SELECT 
  mh.id,
  mh.room_id,
  mh.user_id,
  p1.username as player_username,
  mh.opponent_id,
  p2.username as opponent_username,
  mh.game_mode,
  mh.result,
  mh.legs_won,
  mh.legs_lost,
  -- Player stats
  mh.three_dart_avg as player_avg,
  mh.first9_avg as player_first9,
  mh.highest_checkout as player_checkout,
  mh.visits_180 as player_180s,
  -- Opponent stats
  mh.opponent_three_dart_avg as opponent_avg,
  mh.opponent_first9_avg as opponent_first9,
  mh.opponent_highest_checkout as opponent_checkout,
  mh.opponent_visits_180 as opponent_180s,
  -- Verification
  CASE WHEN mh.opponent_three_dart_avg > 0 THEN 'YES' ELSE 'NO' END as has_opponent_stats,
  mh.played_at
FROM match_history mh
LEFT JOIN profiles p1 ON mh.user_id = p1.user_id
LEFT JOIN profiles p2 ON mh.opponent_id = p2.user_id
ORDER BY mh.played_at DESC;

GRANT SELECT ON v_match_history_with_opponent_stats TO authenticated;

-- 5. Backfill missing opponent stats for recent matches
DO $$
DECLARE
  v_record RECORD;
  v_opponent_avg DECIMAL(5,2);
  v_opponent_first9 DECIMAL(5,2);
  v_opponent_checkout INTEGER;
  v_opponent_180s INTEGER;
BEGIN
  FOR v_record IN 
    SELECT mh.id, mh.room_id, mh.opponent_id, mh.user_id
    FROM match_history mh
    WHERE mh.opponent_three_dart_avg IS NULL OR mh.opponent_three_dart_avg = 0
      AND mh.played_at > NOW() - INTERVAL '7 days'
    LIMIT 100
  LOOP
    -- Get opponent stats from the opponent's match_history record
    SELECT 
      three_dart_avg,
      first9_avg,
      highest_checkout,
      visits_180
    INTO v_opponent_avg, v_opponent_first9, v_opponent_checkout, v_opponent_180s
    FROM match_history
    WHERE room_id = v_record.room_id 
      AND user_id = v_record.opponent_id
    LIMIT 1;
    
    -- Update with opponent's stats
    IF v_opponent_avg IS NOT NULL AND v_opponent_avg > 0 THEN
      UPDATE match_history
      SET opponent_three_dart_avg = v_opponent_avg,
          opponent_first9_avg = v_opponent_first9,
          opponent_highest_checkout = v_opponent_checkout,
          opponent_visits_180 = v_opponent_180s
      WHERE id = v_record.id;
    END IF;
  END LOOP;
END $$;

-- Verify setup
SELECT 'Opponent stats recording fixed!' as status;
