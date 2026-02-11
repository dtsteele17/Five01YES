-- Migration: Update Dartbot Stats with Bot Level
-- Updates the finalize_dartbot_match function to include bot_level in match_history

-- 1. Add bot_level column to match_history if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'match_history' AND column_name = 'bot_level'
  ) THEN
    ALTER TABLE match_history ADD COLUMN bot_level INTEGER;
  END IF;
END $$;

-- 2. Create index on bot_level for filtering if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_match_history_bot_level'
  ) THEN
    CREATE INDEX idx_match_history_bot_level ON match_history(bot_level);
  END IF;
END $$;

-- 3. Update the finalize_dartbot_match function to include bot_level
CREATE OR REPLACE FUNCTION finalize_dartbot_match(
  p_room_id uuid,
  p_winner_id uuid
)
RETURNS void AS $$
DECLARE
  v_room dartbot_match_rooms%ROWTYPE;
  v_player_stats record;
  v_dartbot_visits record;
  v_player_first9_avg numeric;
  v_dartbot_first9_avg numeric;
BEGIN
  -- Get room data
  SELECT * INTO v_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND OR v_room.status != 'active' THEN
    RETURN;
  END IF;
  
  -- Calculate player first 9 average
  IF v_room.player_first9_darts > 0 THEN
    v_player_first9_avg := ROUND((v_room.player_first9_score::numeric / v_room.player_first9_darts) * 3, 2);
  ELSE
    v_player_first9_avg := 0;
  END IF;
  
  -- Calculate dartbot first 9 average
  IF v_room.dartbot_first9_darts > 0 THEN
    v_dartbot_first9_avg := ROUND((v_room.dartbot_first9_score::numeric / v_room.dartbot_first9_darts) * 3, 2);
  ELSE
    v_dartbot_first9_avg := 0;
  END IF;
  
  -- Aggregate player stats from visits
  SELECT 
    COUNT(*) as total_visits,
    COALESCE(SUM(score), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN is_bust THEN 0 ELSE score END), 0) as valid_score,
    COALESCE(SUM(CASE WHEN is_bust THEN 0 ELSE darts_thrown END), 0) as valid_darts,
    COALESCE(MAX(CASE WHEN is_bust THEN 0 ELSE score END), 0) as highest_score,
    COALESCE(SUM(CASE WHEN is_checkout THEN score ELSE 0 END), 0) as highest_checkout,
    COALESCE(SUM(CASE WHEN score >= 100 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts_made,
    COALESCE(SUM(CASE WHEN remaining_before <= 170 AND remaining_before > 0 THEN 1 ELSE 0 END), 0) as checkout_attempts
  INTO v_player_stats
  FROM dartbot_visits
  WHERE room_id = p_room_id 
    AND player_type = 'player'
    AND is_bust = false;
  
  -- Update room to finished
  UPDATE dartbot_match_rooms 
  SET status = 'finished',
      winner_id = p_winner_id,
      completed_at = now(),
      summary = jsonb_build_object(
        'player_legs', v_room.player_legs,
        'dartbot_legs', v_room.dartbot_legs,
        'winner', CASE WHEN p_winner_id = v_room.player_id THEN 'player' ELSE 'dartbot' END,
        'player_first9_avg', v_player_first9_avg,
        'dartbot_first9_avg', v_dartbot_first9_avg,
        'player_highest_score', v_player_stats.highest_score,
        'player_180s', v_player_stats.count_180,
        'total_darts', v_player_stats.total_darts,
        'game_mode', v_room.game_mode,
        'dartbot_level', v_room.dartbot_level
      )
  WHERE id = p_room_id;
  
  -- Record to match_history for stats filtering (with bot_level)
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
    total_score,
    total_checkouts,
    checkout_attempts,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    played_at,
    bot_level
  ) VALUES (
    p_room_id,
    v_room.player_id,
    NULL, -- No opponent_id for dartbot (it's a bot)
    v_room.game_mode,
    'dartbot', -- This is the key filter value
    CASE WHEN p_winner_id = v_room.player_id THEN 'win' ELSE 'loss' END,
    v_room.player_legs,
    v_room.dartbot_legs,
    CASE 
      WHEN v_player_stats.valid_darts > 0 
      THEN ROUND((v_player_stats.valid_score::numeric / v_player_stats.valid_darts) * 3, 2)
      ELSE 0 
    END,
    v_player_first9_avg,
    v_player_stats.highest_checkout,
    CASE 
      WHEN v_player_stats.checkout_attempts > 0 
      THEN ROUND((v_player_stats.checkouts_made::numeric / v_player_stats.checkout_attempts) * 100, 2)
      ELSE 0 
    END,
    v_player_stats.total_darts,
    v_player_stats.total_score,
    v_player_stats.checkouts_made,
    v_player_stats.checkout_attempts,
    v_player_stats.count_100_plus,
    v_player_stats.count_140_plus,
    v_player_stats.count_180,
    now(),
    v_room.dartbot_level -- Store the bot level (1-5 or target average)
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
    played_at = EXCLUDED.played_at,
    bot_level = EXCLUDED.bot_level;
  
  -- Update player_stats aggregate table
  PERFORM update_player_stats_from_dartbot(
    v_room.player_id,
    v_room.game_mode,
    CASE WHEN p_winner_id = v_room.player_id THEN 'win' ELSE 'loss' END,
    v_player_stats.total_darts,
    v_player_stats.valid_score,
    v_player_stats.count_100_plus,
    v_player_stats.count_140_plus,
    v_player_stats.count_180,
    v_player_stats.checkouts_made,
    v_player_stats.checkout_attempts,
    v_player_stats.highest_checkout
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Backfill existing dartbot matches in match_history with bot_level
UPDATE match_history mh
SET bot_level = subquery.dartbot_level
FROM (
  SELECT 
    dmr.id as room_id,
    dmr.dartbot_level
  FROM dartbot_match_rooms dmr
  WHERE dmr.status IN ('finished', 'forfeited')
) subquery
WHERE mh.room_id = subquery.room_id
  AND mh.match_format = 'dartbot'
  AND mh.bot_level IS NULL;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION finalize_dartbot_match(uuid, uuid) TO authenticated;
