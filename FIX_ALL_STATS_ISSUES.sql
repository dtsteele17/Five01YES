-- ============================================================================
-- COMPREHENSIVE FIX FOR ALL STATS RECORDING ISSUES
-- ============================================================================

-- ============================================================================
-- 1. FIX: Ensure record_dartbot_match_completion properly saves to match_history
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
  
  -- Generate a room_id for this match
  v_room_id := gen_random_uuid();

  -- Insert into match_history FIRST (this is what the stats page reads from)
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
    NULL, -- No opponent for dartbot
    p_game_mode,
    'dartbot',
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
    bot_level = EXCLUDED.bot_level,
    played_at = EXCLUDED.played_at;

  -- Update player_stats aggregate
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
    overall_3dart_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ((player_stats.total_score + p_total_score)::numeric / (player_stats.total_darts_thrown + p_darts_thrown)) * 3
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ((player_stats.total_score + p_total_score)::numeric / (player_stats.total_darts_thrown + p_darts_thrown)) * 3
      ELSE 0 
    END,
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
    'room_id', v_room_id,
    'message', 'Dartbot match recorded successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  integer, text, integer, integer, integer, text, timestamp with time zone, timestamp with time zone,
  numeric, numeric, integer, numeric, integer, integer, integer, integer,
  integer, integer, integer
) TO authenticated;

-- ============================================================================
-- 2. FIX: Ensure quick match stats are recorded properly
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_match_format TEXT;
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
BEGIN
  -- Check if already recorded
  IF EXISTS (
    SELECT 1 FROM public.match_history
    WHERE room_id = p_room_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Match already recorded',
      'duplicate', true
    );
  END IF;

  -- Get room details
  SELECT * INTO v_room FROM public.match_rooms WHERE id = p_room_id;
  
  IF v_room IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Room not found');
  END IF;
  
  v_match_format := COALESCE(v_room.source, v_room.match_type, 'quick');

  -- Calculate stats from visits
  FOR v_visit IN 
    SELECT * FROM public.quick_match_visits 
    WHERE room_id = p_room_id 
      AND player_id = p_user_id 
      AND is_bust = false
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
      IF v_visit.remaining_before > v_match_highest_checkout THEN
        v_match_highest_checkout := v_visit.remaining_before;
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

  -- Insert into match_history
  INSERT INTO public.match_history (
    room_id, user_id, opponent_id, game_mode, match_format, result,
    legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
    checkout_percentage, darts_thrown, total_score, total_checkouts, checkout_attempts,
    visits_100_plus, visits_140_plus, visits_180, played_at
  ) VALUES (
    p_room_id, p_user_id, p_opponent_id, p_game_mode, v_match_format, p_result,
    p_legs_won, p_legs_lost, v_match_avg, v_match_first9_avg, v_match_highest_checkout,
    v_match_checkout_pct, v_match_darts, v_match_score, v_match_checkouts, v_match_checkout_attempts,
    v_match_100_plus, v_match_140_plus, v_match_180s, now()
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
    played_at = EXCLUDED.played_at;

  -- Update player_stats
  INSERT INTO public.player_stats (
    user_id, total_matches, wins, losses, draws,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    p_user_id, 1,
    CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    v_match_darts, v_match_score,
    v_match_avg, v_match_first9_avg,
    v_match_highest_checkout, v_match_checkouts, v_match_checkout_attempts, v_match_checkout_pct,
    v_match_100_plus, v_match_140_plus, v_match_180s, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = public.player_stats.total_matches + 1,
    wins = public.player_stats.wins + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    losses = public.player_stats.losses + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    draws = public.player_stats.draws + CASE WHEN p_result = 'draw' THEN 1 ELSE 0 END,
    total_darts_thrown = public.player_stats.total_darts_thrown + v_match_darts,
    total_score = public.player_stats.total_score + v_match_score,
    overall_3dart_avg = CASE 
      WHEN (public.player_stats.total_darts_thrown + v_match_darts) > 0 
      THEN ROUND(((public.player_stats.total_score + v_match_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_match_darts)) * 3, 2)
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (public.player_stats.total_darts_thrown + v_match_darts) > 0 
      THEN ROUND(((public.player_stats.total_score + v_match_score)::DECIMAL / (public.player_stats.total_darts_thrown + v_match_darts)) * 3, 2)
      ELSE 0 
    END,
    highest_checkout = GREATEST(public.player_stats.highest_checkout, v_match_highest_checkout),
    total_checkouts = public.player_stats.total_checkouts + v_match_checkouts,
    checkout_attempts = public.player_stats.checkout_attempts + v_match_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (public.player_stats.checkout_attempts + v_match_checkout_attempts) > 0 
      THEN ROUND(((public.player_stats.total_checkouts + v_match_checkouts)::DECIMAL / (public.player_stats.checkout_attempts + v_match_checkout_attempts)) * 100, 2)
      ELSE 0 
    END,
    visits_100_plus = public.player_stats.visits_100_plus + v_match_100_plus,
    visits_140_plus = public.player_stats.visits_140_plus + v_match_140_plus,
    visits_180 = public.player_stats.visits_180 + v_match_180s,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Stats recorded',
    'match_avg', v_match_avg,
    'first9_avg', v_match_first9_avg,
    'game_mode', p_game_mode,
    'match_format', v_match_format
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_update_player_match_stats(UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- 3. FIX: Update existing dartbot records to have correct bot_level
-- ============================================================================

UPDATE match_history
SET bot_level = CASE 
  WHEN bot_level BETWEEN 20 AND 35 THEN 1  -- Beginner
  WHEN bot_level BETWEEN 36 AND 50 THEN 2  -- Intermediate
  WHEN bot_level BETWEEN 51 AND 65 THEN 3  -- Advanced
  WHEN bot_level BETWEEN 66 AND 80 THEN 4  -- Expert
  WHEN bot_level BETWEEN 81 AND 100 THEN 5 -- Professional
  ELSE bot_level
END
WHERE match_format = 'dartbot' 
  AND bot_level IS NOT NULL 
  AND bot_level > 5;

-- ============================================================================
-- 4. ADD INDEXES FOR BETTER PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_match_history_user_played_at 
  ON match_history(user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_history_user_format 
  ON match_history(user_id, match_format, played_at DESC);

-- ============================================================================
-- 5. BACKFILL: Process any finished matches that don't have history entries
-- ============================================================================

DO $$
DECLARE
  v_room RECORD;
BEGIN
  FOR v_room IN 
    SELECT mr.id 
    FROM match_rooms mr
    LEFT JOIN match_history mh ON mh.room_id = mr.id
    WHERE mr.status = 'finished'
      AND mh.id IS NULL
      AND mr.source != 'dartbot'
      AND mr.match_type != 'dartbot'
    LIMIT 100
  LOOP
    PERFORM finalize_quick_match_to_history(v_room.id);
  END LOOP;
END $$;

-- ============================================================================
-- DONE
-- ============================================================================
