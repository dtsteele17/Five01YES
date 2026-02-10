-- Migration: Fix Dartbot Stats Sync
-- This creates a trigger to automatically sync dartbot matches from the matches table to match_history
-- so that dartbot stats appear correctly on the Stats page

-- Create function to sync matches to match_history
CREATE OR REPLACE FUNCTION sync_matches_to_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.match_type = 'dartbot' THEN
    INSERT INTO match_history (
      room_id, user_id, opponent_id, game_mode, match_format,
      result, legs_won, legs_lost, three_dart_avg, first9_avg,
      highest_checkout, checkout_percentage, darts_thrown,
      total_score, total_checkouts, checkout_attempts,
      visits_100_plus, visits_140_plus, visits_180, played_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.opponent_id,
      CASE WHEN NEW.game_mode IN ('301','501') THEN NEW.game_mode::integer ELSE 501 END,
      'dartbot',
      CASE WHEN NEW.winner_id = NEW.user_id THEN 'win' ELSE 'loss' END,
      NEW.player1_legs_won, NEW.player2_legs_won,
      NEW.user_avg, NEW.user_first9_avg,
      (SELECT highest_checkout FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      NEW.user_checkout_pct,
      (SELECT darts_thrown FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT points_scored FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT checkout_hits FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT checkout_attempts FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT count_100_plus FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT count_140_plus FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
      (SELECT count_180 FROM match_players WHERE match_id = NEW.id AND user_id = NEW.user_id),
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

-- Create trigger
DROP TRIGGER IF EXISTS trg_sync_dartbot_matches ON matches;
CREATE TRIGGER trg_sync_dartbot_matches
  AFTER INSERT OR UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION sync_matches_to_history();

-- Backfill existing dartbot matches
INSERT INTO match_history (
  room_id, user_id, game_mode, match_format, result,
  legs_won, legs_lost, three_dart_avg, first9_avg,
  highest_checkout, checkout_percentage, darts_thrown,
  total_score, total_checkouts, checkout_attempts,
  visits_100_plus, visits_140_plus, visits_180, played_at
)
SELECT 
  m.id, m.user_id, m.game_mode::integer, 'dartbot',
  CASE WHEN m.winner_id = m.user_id THEN 'win' ELSE 'loss' END,
  m.player1_legs_won, m.player2_legs_won,
  m.user_avg, m.user_first9_avg,
  mp.highest_checkout, m.user_checkout_pct,
  mp.darts_thrown, mp.points_scored,
  mp.checkout_hits, mp.checkout_attempts,
  mp.count_100_plus, mp.count_140_plus, mp.count_180,
  m.completed_at
FROM matches m
JOIN match_players mp ON mp.match_id = m.id AND mp.user_id = m.user_id
WHERE m.match_type = 'dartbot'
  AND m.status = 'completed'
  AND NOT EXISTS (SELECT 1 FROM match_history mh WHERE mh.room_id = m.id)
ON CONFLICT (room_id) DO NOTHING;
