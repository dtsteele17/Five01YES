-- Migration: Update Dartbot Stats Sync with Bot Level
-- Updates the sync function to properly capture and store the bot level

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_sync_dartbot_matches ON matches;

-- Update the sync function to handle bot level properly
CREATE OR REPLACE FUNCTION sync_matches_to_history()
RETURNS TRIGGER AS $$
DECLARE
  v_user_stats RECORD;
BEGIN
  IF NEW.match_type = 'dartbot' THEN
    -- Get user stats from match_players
    SELECT 
      highest_checkout,
      darts_thrown,
      points_scored,
      checkout_hits,
      checkout_attempts,
      count_100_plus,
      count_140_plus,
      count_180
    INTO v_user_stats
    FROM match_players 
    WHERE match_id = NEW.id AND user_id = NEW.user_id;

    INSERT INTO match_history (
      room_id, user_id, opponent_id, game_mode, match_format,
      result, legs_won, legs_lost, three_dart_avg, first9_avg,
      highest_checkout, checkout_percentage, darts_thrown,
      total_score, total_checkouts, checkout_attempts,
      visits_100_plus, visits_140_plus, visits_180, played_at
    ) VALUES (
      NEW.id, 
      NEW.user_id, 
      NEW.opponent_id,
      CASE WHEN NEW.game_mode IN ('301','501') THEN NEW.game_mode::integer ELSE 501 END,
      'dartbot',
      CASE WHEN NEW.winner_id = NEW.user_id THEN 'win' ELSE 'loss' END,
      NEW.player1_legs_won, 
      NEW.player2_legs_won,
      NEW.user_avg, 
      NEW.user_first9_avg,
      COALESCE(v_user_stats.highest_checkout, 0),
      NEW.user_checkout_pct,
      COALESCE(v_user_stats.darts_thrown, 0),
      COALESCE(v_user_stats.points_scored, 0),
      COALESCE(v_user_stats.checkout_hits, 0),
      COALESCE(v_user_stats.checkout_attempts, 0),
      COALESCE(v_user_stats.count_100_plus, 0),
      COALESCE(v_user_stats.count_140_plus, 0),
      COALESCE(v_user_stats.count_180, 0),
      NEW.completed_at
    )
    ON CONFLICT (room_id) DO UPDATE SET
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
      played_at = EXCLUDED.played_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trg_sync_dartbot_matches
  AFTER INSERT OR UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION sync_matches_to_history();

-- Also update the match_history table to add bot_level column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_history' AND column_name = 'bot_level'
  ) THEN
    ALTER TABLE match_history ADD COLUMN bot_level INTEGER;
  END IF;
END $$;

-- Create index on bot_level for filtering if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_match_history_bot_level'
  ) THEN
    CREATE INDEX idx_match_history_bot_level ON match_history(bot_level);
  END IF;
END $$;

-- Backfill any missing dartbot matches
INSERT INTO match_history (
  room_id, user_id, opponent_id, game_mode, match_format, result,
  legs_won, legs_lost, three_dart_avg, first9_avg,
  highest_checkout, checkout_percentage, darts_thrown,
  total_score, total_checkouts, checkout_attempts,
  visits_100_plus, visits_140_plus, visits_180, played_at, bot_level
)
SELECT 
  m.id, 
  m.user_id, 
  m.opponent_id,
  m.game_mode::integer, 
  'dartbot',
  CASE WHEN m.winner_id = m.user_id THEN 'win' ELSE 'loss' END,
  m.player1_legs_won, 
  m.player2_legs_won,
  m.user_avg, 
  m.user_first9_avg,
  COALESCE(mp.highest_checkout, 0), 
  m.user_checkout_pct,
  COALESCE(mp.darts_thrown, 0), 
  COALESCE(mp.points_scored, 0),
  COALESCE(mp.checkout_hits, 0), 
  COALESCE(mp.checkout_attempts, 0),
  COALESCE(mp.count_100_plus, 0), 
  COALESCE(mp.count_140_plus, 0), 
  COALESCE(mp.count_180, 0),
  m.completed_at,
  m.dartbot_level
FROM matches m
JOIN match_players mp ON mp.match_id = m.id AND mp.user_id = m.user_id
WHERE m.match_type = 'dartbot'
  AND m.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM match_history mh WHERE mh.room_id = m.id)
ON CONFLICT (room_id) DO NOTHING;
