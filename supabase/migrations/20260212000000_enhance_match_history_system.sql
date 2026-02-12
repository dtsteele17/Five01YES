-- ============================================================================
-- MATCH HISTORY ENHANCEMENT
-- 
-- This migration ensures that:
-- 1. All match types (quick, dartbot, ranked, private) save to match_history
-- 2. A function exists to get recent matches with complete stats
-- 3. The record_dartbot_match_completion function also saves to match_history
-- ============================================================================

-- ============================================================================
-- 1. FUNCTION: Get Recent Match History with Stats
-- Returns the last N matches for a user with full stats and opponent info
-- ============================================================================

CREATE OR REPLACE FUNCTION get_recent_match_history(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_game_mode integer DEFAULT NULL,
  p_match_format text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  user_id uuid,
  opponent_id uuid,
  opponent_username text,
  opponent_avatar_url text,
  game_mode integer,
  match_format text,
  result text,
  legs_won integer,
  legs_lost integer,
  three_dart_avg numeric,
  first9_avg numeric,
  highest_checkout integer,
  checkout_percentage numeric,
  darts_thrown integer,
  total_score integer,
  total_checkouts integer,
  checkout_attempts integer,
  visits_100_plus integer,
  visits_140_plus integer,
  visits_180 integer,
  bot_level integer,
  played_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mh.id,
    mh.room_id,
    mh.user_id,
    mh.opponent_id,
    p.username as opponent_username,
    p.avatar_url as opponent_avatar_url,
    mh.game_mode,
    mh.match_format,
    mh.result,
    mh.legs_won,
    mh.legs_lost,
    mh.three_dart_avg,
    mh.first9_avg,
    mh.highest_checkout,
    mh.checkout_percentage,
    mh.darts_thrown,
    mh.total_score,
    mh.total_checkouts,
    mh.checkout_attempts,
    mh.visits_100_plus,
    mh.visits_140_plus,
    mh.visits_180,
    mh.bot_level,
    mh.played_at,
    mh.created_at
  FROM match_history mh
  LEFT JOIN profiles p ON p.user_id = mh.opponent_id
  WHERE mh.user_id = p_user_id
    AND (p_game_mode IS NULL OR mh.game_mode = p_game_mode)
    AND (p_match_format IS NULL OR mh.match_format = p_match_format)
  ORDER BY mh.played_at DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_recent_match_history(uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_match_history(uuid, integer, integer, text) TO anon;

-- ============================================================================
-- 2. FUNCTION: Record Dartbot Match with match_history entry
-- Enhanced version that saves to both dartbot_match_rooms and match_history
-- ============================================================================

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode integer,
  p_match_format text,
  p_dartbot_level integer,
  p_player_legs integer,
  p_dartbot_legs integer,
  p_winner text,
  p_started_at timestamp with time zone,
  p_completed_at timestamp with time zone,
  p_three_dart_avg numeric,
  p_first9_avg numeric,
  p_highest_checkout integer,
  p_checkout_percentage numeric,
  p_darts_thrown integer,
  p_total_score integer,
  p_total_checkouts integer,
  p_checkout_attempts integer,
  p_visits_100_plus integer,
  p_visits_140_plus integer,
  p_visits_180 integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_room_id uuid;
  v_result text;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- Determine result
  v_result := CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END;

  -- Create dartbot match room record
  INSERT INTO dartbot_match_rooms (
    player_id,
    dartbot_level,
    game_mode,
    match_format,
    status,
    player_legs,
    dartbot_legs,
    winner_id,
    summary,
    completed_at
  ) VALUES (
    v_user_id,
    p_dartbot_level,
    p_game_mode,
    p_match_format,
    'finished',
    p_player_legs,
    p_dartbot_legs,
    CASE WHEN p_winner = 'player' THEN v_user_id ELSE NULL END,
    jsonb_build_object(
      'three_dart_avg', p_three_dart_avg,
      'first9_avg', p_first9_avg,
      'highest_checkout', p_highest_checkout,
      'checkout_percentage', p_checkout_percentage,
      'darts_thrown', p_darts_thrown,
      'total_score', p_total_score,
      'visits_100_plus', p_visits_100_plus,
      'visits_140_plus', p_visits_140_plus,
      'visits_180', p_visits_180
    ),
    p_completed_at
  )
  RETURNING id INTO v_room_id;

  -- ALSO insert into match_history for unified history view
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
    bot_level,
    played_at
  ) VALUES (
    v_room_id,
    v_user_id,
    NULL, -- No opponent user for dartbot matches
    p_game_mode,
    'dartbot', -- Use 'dartbot' as match_format
    v_result,
    p_player_legs,
    p_dartbot_legs,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_checkout_percentage,
    p_darts_thrown,
    p_total_score,
    p_total_checkouts,
    p_checkout_attempts,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    p_dartbot_level,
    p_completed_at
  );

  -- Update user_stats
  INSERT INTO user_stats (
    user_id,
    total_matches,
    wins,
    losses,
    total_points_scored,
    total_darts_thrown,
    total_180s,
    total_checkout_attempts,
    total_checkouts_made,
    highest_checkout,
    best_average,
    best_first9_average,
    total_100_plus,
    total_140_plus,
    updated_at
  )
  VALUES (
    v_user_id,
    1,
    CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    p_total_score,
    p_darts_thrown,
    p_visits_180,
    p_checkout_attempts,
    p_total_checkouts,
    p_highest_checkout,
    p_three_dart_avg,
    p_first9_avg,
    p_visits_100_plus,
    p_visits_140_plus,
    p_completed_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = user_stats.total_matches + 1,
    wins = user_stats.wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    losses = user_stats.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    total_points_scored = user_stats.total_points_scored + p_total_score,
    total_darts_thrown = user_stats.total_darts_thrown + p_darts_thrown,
    total_180s = user_stats.total_180s + p_visits_180,
    total_checkout_attempts = user_stats.total_checkout_attempts + p_checkout_attempts,
    total_checkouts_made = user_stats.total_checkouts_made + p_total_checkouts,
    highest_checkout = GREATEST(user_stats.highest_checkout, p_highest_checkout),
    best_average = GREATEST(user_stats.best_average, p_three_dart_avg),
    best_first9_average = GREATEST(user_stats.best_first9_average, p_first9_avg),
    total_100_plus = user_stats.total_100_plus + p_visits_100_plus,
    total_140_plus = user_stats.total_140_plus + p_visits_140_plus,
    updated_at = p_completed_at;

  -- Update player_stats
  INSERT INTO player_stats (
    user_id,
    total_matches,
    wins,
    losses,
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
    updated_at
  )
  VALUES (
    v_user_id,
    1,
    CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    p_darts_thrown,
    p_total_score,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_total_checkouts,
    p_checkout_attempts,
    p_checkout_percentage,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    p_completed_at
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + p_darts_thrown,
    total_score = player_stats.total_score + p_total_score,
    overall_3dart_avg = ((player_stats.overall_3dart_avg * player_stats.total_darts_thrown) + (p_three_dart_avg * p_darts_thrown)) / (player_stats.total_darts_thrown + p_darts_thrown),
    overall_first9_avg = ((player_stats.overall_first9_avg * (player_stats.total_matches * 9)) + (p_first9_avg * 9)) / ((player_stats.total_matches + 1) * 9),
    highest_checkout = GREATEST(player_stats.highest_checkout, p_highest_checkout),
    total_checkouts = player_stats.total_checkouts + p_total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + p_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (player_stats.checkout_attempts + p_checkout_attempts) > 0 
      THEN ((player_stats.total_checkouts + p_total_checkouts)::numeric / (player_stats.checkout_attempts + p_checkout_attempts)) * 100
      ELSE 0 
    END,
    visits_100_plus = player_stats.visits_100_plus + p_visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + p_visits_140_plus,
    visits_180 = player_stats.visits_180 + p_visits_180,
    updated_at = p_completed_at;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(integer, text, integer, integer, integer, text, timestamp with time zone, timestamp with time zone, numeric, numeric, integer, numeric, integer, integer, integer, integer, integer, integer, integer) TO authenticated;

-- ============================================================================
-- 3. FUNCTION: Record Quick Match to match_history
-- Called when a quick match is completed - can be called from client or trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION record_quick_match_history(
  p_room_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_opponent_id uuid DEFAULT NULL,
  p_game_mode integer DEFAULT NULL,
  p_match_format text DEFAULT 'quick',
  p_result text DEFAULT 'loss',
  p_legs_won integer DEFAULT 0,
  p_legs_lost integer DEFAULT 0,
  p_three_dart_avg numeric DEFAULT 0,
  p_first9_avg numeric DEFAULT 0,
  p_highest_checkout integer DEFAULT 0,
  p_checkout_percentage numeric DEFAULT 0,
  p_darts_thrown integer DEFAULT 0,
  p_total_score integer DEFAULT 0,
  p_total_checkouts integer DEFAULT 0,
  p_checkout_attempts integer DEFAULT 0,
  p_visits_100_plus integer DEFAULT 0,
  p_visits_140_plus integer DEFAULT 0,
  p_visits_180 integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    played_at
  ) VALUES (
    p_room_id,
    COALESCE(p_user_id, auth.uid()),
    p_opponent_id,
    COALESCE(p_game_mode, 501),
    p_match_format,
    p_result,
    p_legs_won,
    p_legs_lost,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    p_checkout_percentage,
    p_darts_thrown,
    p_total_score,
    p_total_checkouts,
    p_checkout_attempts,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    NOW()
  );

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION record_quick_match_history TO authenticated;

-- ============================================================================
-- 4. FUNCTION: Calculate stats from quick_match_visits and save to match_history
-- This is called when a match ends to compute and store final stats
-- ============================================================================

CREATE OR REPLACE FUNCTION finalize_quick_match_to_history(p_room_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_p1_visits RECORD;
  v_p2_visits RECORD;
  v_p1_stats RECORD;
  v_p2_stats RECORD;
  v_p1_first9_score INTEGER := 0;
  v_p1_first9_darts INTEGER := 0;
  v_p2_first9_score INTEGER := 0;
  v_p2_first9_darts INTEGER := 0;
  v_p1_checkouts INTEGER := 0;
  v_p2_checkouts INTEGER := 0;
  v_p1_checkout_attempts INTEGER := 0;
  v_p2_checkout_attempts INTEGER := 0;
  v_p1_highest_checkout INTEGER := 0;
  v_p2_highest_checkout INTEGER := 0;
BEGIN
  -- Get room details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND OR v_room.status != 'finished' THEN
    RETURN false;
  END IF;

  -- Calculate Player 1 stats from visits
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_bust THEN score ELSE 0 END), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts,
    COALESCE(SUM(CASE WHEN is_checkout THEN darts_thrown ELSE 0 END), 0) as checkout_darts
  INTO v_p1_visits
  FROM quick_match_visits
  WHERE room_id = p_room_id AND player_id = v_room.player1_id;

  -- Calculate Player 2 stats from visits
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_bust THEN score ELSE 0 END), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN score >= 100 AND score < 140 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 AND score < 180 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts,
    COALESCE(SUM(CASE WHEN is_checkout THEN darts_thrown ELSE 0 END), 0) as checkout_darts
  INTO v_p2_visits
  FROM quick_match_visits
  WHERE room_id = p_room_id AND player_id = v_room.player2_id;

  -- Calculate first 9 for player 1 (first 3 visits per leg)
  WITH p1_first9 AS (
    SELECT score, darts_thrown, 
           ROW_NUMBER() OVER (PARTITION BY leg ORDER BY turn_no) as rn
    FROM quick_match_visits
    WHERE room_id = p_room_id 
      AND player_id = v_room.player1_id
      AND NOT is_bust
  )
  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(darts_thrown), 0)
  INTO v_p1_first9_score, v_p1_first9_darts
  FROM p1_first9 WHERE rn <= 3;

  -- Calculate first 9 for player 2
  WITH p2_first9 AS (
    SELECT score, darts_thrown,
           ROW_NUMBER() OVER (PARTITION BY leg ORDER BY turn_no) as rn
    FROM quick_match_visits
    WHERE room_id = p_room_id 
      AND player_id = v_room.player2_id
      AND NOT is_bust
  )
  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(darts_thrown), 0)
  INTO v_p2_first9_score, v_p2_first9_darts
  FROM p2_first9 WHERE rn <= 3;

  -- Get highest checkout for each player
  SELECT COALESCE(MAX(remaining_before), 0)
  INTO v_p1_highest_checkout
  FROM quick_match_visits
  WHERE room_id = p_room_id 
    AND player_id = v_room.player1_id 
    AND is_checkout;

  SELECT COALESCE(MAX(remaining_before), 0)
  INTO v_p2_highest_checkout
  FROM quick_match_visits
  WHERE room_id = p_room_id 
    AND player_id = v_room.player2_id 
    AND is_checkout;

  -- Insert for Player 1
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg,
    highest_checkout, checkout_percentage, darts_thrown, total_score,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id,
    v_room.player1_id,
    v_room.player2_id,
    v_room.game_mode,
    COALESCE(v_room.source, 'quick'),
    CASE WHEN v_room.winner_id = v_room.player1_id THEN 'win' ELSE 'loss' END,
    v_room.player1_legs,
    v_room.player2_legs,
    CASE WHEN v_p1_visits.total_darts > 0 THEN ROUND((v_p1_visits.total_score::numeric / v_p1_visits.total_darts) * 3, 2) ELSE 0 END,
    CASE WHEN v_p1_first9_darts > 0 THEN ROUND((v_p1_first9_score::numeric / v_p1_first9_darts) * 3, 2) ELSE 0 END,
    v_p1_highest_checkout,
    CASE WHEN v_p1_visits.checkout_darts > 0 THEN ROUND((v_p1_visits.checkouts::numeric / v_p1_visits.checkout_darts) * 100, 2) ELSE 0 END,
    v_p1_visits.total_darts,
    v_p1_visits.total_score,
    v_p1_visits.checkouts,
    v_p1_visits.checkout_darts,
    v_p1_visits.count_100_plus,
    v_p1_visits.count_140_plus,
    v_p1_visits.count_180,
    NOW()
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates

  -- Insert for Player 2
  INSERT INTO match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg,
    highest_checkout, checkout_percentage, darts_thrown, total_score,
    total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id,
    v_room.player2_id,
    v_room.player1_id,
    v_room.game_mode,
    COALESCE(v_room.source, 'quick'),
    CASE WHEN v_room.winner_id = v_room.player2_id THEN 'win' ELSE 'loss' END,
    v_room.player2_legs,
    v_room.player1_legs,
    CASE WHEN v_p2_visits.total_darts > 0 THEN ROUND((v_p2_visits.total_score::numeric / v_p2_visits.total_darts) * 3, 2) ELSE 0 END,
    CASE WHEN v_p2_first9_darts > 0 THEN ROUND((v_p2_first9_score::numeric / v_p2_first9_darts) * 3, 2) ELSE 0 END,
    v_p2_highest_checkout,
    CASE WHEN v_p2_visits.checkout_darts > 0 THEN ROUND((v_p2_visits.checkouts::numeric / v_p2_visits.checkout_darts) * 100, 2) ELSE 0 END,
    v_p2_visits.total_darts,
    v_p2_visits.total_score,
    v_p2_visits.checkouts,
    v_p2_visits.checkout_darts,
    v_p2_visits.count_100_plus,
    v_p2_visits.count_140_plus,
    v_p2_visits.count_180,
    NOW()
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in finalize_quick_match_to_history: %', SQLERRM;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_quick_match_to_history TO authenticated;

-- ============================================================================
-- 5. TRIGGER: Auto-save to match_history when match_rooms status changes to finished
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_match_finished_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process when status changes to 'finished'
  IF NEW.status = 'finished' AND (OLD.status IS NULL OR OLD.status != 'finished') THEN
    -- Skip dartbot matches (they use their own function)
    IF NEW.source = 'dartbot' OR NEW.match_type = 'dartbot' THEN
      RETURN NEW;
    END IF;
    
    -- Call the finalize function for quick/private matches
    PERFORM finalize_quick_match_to_history(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_match_finished_to_history ON match_rooms;

-- Create trigger
CREATE TRIGGER trg_match_finished_to_history
  AFTER UPDATE OF status ON match_rooms
  FOR EACH ROW
  WHEN (NEW.status = 'finished')
  EXECUTE FUNCTION trigger_match_finished_to_history();

-- ============================================================================
-- 6. VIEW: Simplified match history for dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_user_match_history AS
SELECT 
  mh.id,
  mh.room_id,
  mh.user_id,
  mh.opponent_id,
  p.username as opponent_username,
  p.avatar_url as opponent_avatar_url,
  mh.game_mode,
  mh.match_format,
  CASE 
    WHEN mh.match_format = 'dartbot' THEN 'DartBot'
    WHEN p.username IS NOT NULL THEN p.username
    ELSE 'Unknown'
  END as opponent_display_name,
  mh.result,
  mh.legs_won,
  mh.legs_lost,
  mh.three_dart_avg,
  mh.first9_avg,
  mh.highest_checkout,
  mh.checkout_percentage,
  mh.darts_thrown,
  mh.total_score,
  mh.visits_100_plus,
  mh.visits_140_plus,
  mh.visits_180,
  mh.bot_level,
  mh.played_at,
  mh.created_at
FROM match_history mh
LEFT JOIN profiles p ON p.user_id = mh.opponent_id
ORDER BY mh.played_at DESC;

-- Grant access to the view
GRANT SELECT ON v_user_match_history TO authenticated;
GRANT SELECT ON v_user_match_history TO anon;

-- ============================================================================
-- 7. INDEXES for better performance
-- ============================================================================

-- Index for recent matches query
CREATE INDEX IF NOT EXISTS idx_match_history_user_played_at 
  ON match_history(user_id, played_at DESC);

-- Index for filtering by game mode
CREATE INDEX IF NOT EXISTS idx_match_history_user_game_mode 
  ON match_history(user_id, game_mode, played_at DESC);

-- Index for filtering by match format
CREATE INDEX IF NOT EXISTS idx_match_history_user_match_format 
  ON match_history(user_id, match_format, played_at DESC);

-- Index for dartbot matches
CREATE INDEX IF NOT EXISTS idx_match_history_bot_level 
  ON match_history(user_id, bot_level) 
  WHERE bot_level IS NOT NULL;

-- Index for room lookups
CREATE INDEX IF NOT EXISTS idx_match_history_room_id 
  ON match_history(room_id);

-- ============================================================================
-- 8. UPDATE EXISTING match_history records to ensure consistency
-- ============================================================================

-- Update any records missing opponent info (for display purposes)
UPDATE match_history mh
SET 
  match_format = COALESCE(mh.match_format, 'quick')
WHERE mh.match_format IS NULL;

-- Update dartbot records to have consistent match_format
UPDATE match_history mh
SET match_format = 'dartbot'
WHERE mh.bot_level IS NOT NULL 
  AND mh.match_format != 'dartbot';

-- ============================================================================
-- DONE
-- ============================================================================
