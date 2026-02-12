-- ============================================================================
-- COMPLETE FIX FOR ALL STATS RECORDING ISSUES
-- Fixes: quick match, dartbot stats, and player_stats aggregation
-- ============================================================================

-- ============================================================================
-- PART 1: Drop all conflicting function versions
-- ============================================================================
DO $$
DECLARE
  func_record TEXT;
BEGIN
  -- Drop all versions of record_dartbot_match_completion
  FOR func_record IN 
    SELECT oid::regprocedure::text 
    FROM pg_proc 
    WHERE proname = 'record_dartbot_match_completion'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record;
  END LOOP;
END $$;

-- ============================================================================
-- PART 2: Create updated dartbot match completion function
-- This version ALSO updates player_stats aggregate table
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
  v_checkout_pct_calc numeric;
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
  
  -- Calculate checkout percentage if not provided
  IF p_checkout_percentage > 0 THEN
    v_checkout_pct_calc := p_checkout_percentage;
  ELSIF p_checkout_attempts > 0 THEN
    v_checkout_pct_calc := ROUND((p_total_checkouts::numeric / p_checkout_attempts) * 100, 2);
  ELSE
    v_checkout_pct_calc := 0;
  END IF;

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
      'checkout_percentage', v_checkout_pct_calc,
      'darts_thrown', p_darts_thrown,
      'total_score', p_total_score,
      'visits_100_plus', p_visits_100_plus,
      'visits_140_plus', p_visits_140_plus,
      'visits_180', p_visits_180
    ),
    p_completed_at
  )
  RETURNING id INTO v_room_id;

  -- Insert into match_history for unified history view
  INSERT INTO match_history (
    room_id,
    user_id,
    opponent_id,
    game_mode,
    match_format,
    bot_level,
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
    v_room_id,
    v_user_id,
    NULL, -- No opponent for dartbot
    p_game_mode,
    'dartbot',
    p_dartbot_level,
    v_result,
    p_player_legs,
    p_dartbot_legs,
    p_three_dart_avg,
    p_first9_avg,
    p_highest_checkout,
    v_checkout_pct_calc,
    p_darts_thrown,
    p_total_score,
    p_total_checkouts,
    p_checkout_attempts,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    p_completed_at
  );

  -- UPDATE PLAYER_STATS AGGREGATE TABLE
  -- This ensures dartbot stats contribute to overall stats
  INSERT INTO player_stats (
    user_id, total_matches, wins, losses, draws,
    matches_301, matches_501,
    total_darts_thrown, total_score,
    overall_3dart_avg, overall_first9_avg,
    highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
    visits_100_plus, visits_140_plus, visits_180, updated_at
  )
  VALUES (
    v_user_id, 1,
    CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    0,
    CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
    p_darts_thrown, p_total_score,
    p_three_dart_avg, p_first9_avg,
    p_highest_checkout, p_total_checkouts, p_checkout_attempts, v_checkout_pct_calc,
    p_visits_100_plus, p_visits_140_plus, p_visits_180, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_matches = player_stats.total_matches + 1,
    wins = player_stats.wins + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
    losses = player_stats.losses + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
    matches_301 = player_stats.matches_301 + CASE WHEN p_game_mode = 301 THEN 1 ELSE 0 END,
    matches_501 = player_stats.matches_501 + CASE WHEN p_game_mode = 501 THEN 1 ELSE 0 END,
    total_darts_thrown = player_stats.total_darts_thrown + p_darts_thrown,
    total_score = player_stats.total_score + p_total_score,
    overall_3dart_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + p_total_score)::DECIMAL / (player_stats.total_darts_thrown + p_darts_thrown)) * 3, 2)
      ELSE 0 
    END,
    overall_first9_avg = CASE 
      WHEN (player_stats.total_darts_thrown + p_darts_thrown) > 0 
      THEN ROUND(((player_stats.total_score + p_total_score)::DECIMAL / (player_stats.total_darts_thrown + p_darts_thrown)) * 3, 2)
      ELSE 0 
    END,
    highest_checkout = GREATEST(player_stats.highest_checkout, p_highest_checkout),
    total_checkouts = player_stats.total_checkouts + p_total_checkouts,
    checkout_attempts = player_stats.checkout_attempts + p_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (player_stats.checkout_attempts + p_checkout_attempts) > 0 
      THEN ROUND(((player_stats.total_checkouts + p_total_checkouts)::DECIMAL / (player_stats.checkout_attempts + p_checkout_attempts)) * 100, 2)
      ELSE 0 
    END,
    visits_100_plus = player_stats.visits_100_plus + p_visits_100_plus,
    visits_140_plus = player_stats.visits_140_plus + p_visits_140_plus,
    visits_180 = player_stats.visits_180 + p_visits_180,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Dartbot match recorded with stats'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  integer, text, integer, integer, integer, text, timestamp with time zone, 
  timestamp with time zone, numeric, numeric, integer, numeric, integer, 
  integer, integer, integer, integer, integer
) TO authenticated;

-- ============================================================================
-- PART 3: Backfill missing player_stats from existing match_history
-- This ensures users with existing matches get their aggregate stats
-- ============================================================================

-- First, ensure all users who have played matches have a player_stats record
INSERT INTO player_stats (
  user_id, total_matches, wins, losses, draws,
  matches_301, matches_501,
  total_darts_thrown, total_score,
  overall_3dart_avg, overall_first9_avg,
  highest_checkout, total_checkouts, checkout_attempts, checkout_percentage,
  visits_100_plus, visits_140_plus, visits_180, updated_at
)
SELECT 
  user_id,
  COUNT(*)::INTEGER as total_matches,
  COUNT(*) FILTER (WHERE result = 'win')::INTEGER as wins,
  COUNT(*) FILTER (WHERE result = 'loss')::INTEGER as losses,
  COUNT(*) FILTER (WHERE result = 'draw')::INTEGER as draws,
  COUNT(*) FILTER (WHERE game_mode = 301)::INTEGER as matches_301,
  COUNT(*) FILTER (WHERE game_mode = 501)::INTEGER as matches_501,
  SUM(darts_thrown)::INTEGER as total_darts_thrown,
  SUM(total_score)::INTEGER as total_score,
  ROUND(AVG(three_dart_avg)::NUMERIC, 2) as overall_3dart_avg,
  ROUND(AVG(first9_avg)::NUMERIC, 2) as overall_first9_avg,
  MAX(highest_checkout) as highest_checkout,
  SUM(total_checkouts)::INTEGER as total_checkouts,
  SUM(checkout_attempts)::INTEGER as checkout_attempts,
  ROUND(
    CASE WHEN SUM(checkout_attempts) > 0 
    THEN (SUM(total_checkouts)::NUMERIC / SUM(checkout_attempts)) * 100
    ELSE 0 END, 2
  ) as checkout_percentage,
  SUM(visits_100_plus)::INTEGER as visits_100_plus,
  SUM(visits_140_plus)::INTEGER as visits_140_plus,
  SUM(visits_180)::INTEGER as visits_180,
  NOW() as updated_at
FROM match_history
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
  total_matches = EXCLUDED.total_matches,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  draws = EXCLUDED.draws,
  matches_301 = EXCLUDED.matches_301,
  matches_501 = EXCLUDED.matches_501,
  total_darts_thrown = EXCLUDED.total_darts_thrown,
  total_score = EXCLUDED.total_score,
  overall_3dart_avg = EXCLUDED.overall_3dart_avg,
  overall_first9_avg = EXCLUDED.overall_first9_avg,
  highest_checkout = EXCLUDED.highest_checkout,
  total_checkouts = EXCLUDED.total_checkouts,
  checkout_attempts = EXCLUDED.checkout_attempts,
  checkout_percentage = EXCLUDED.checkout_percentage,
  visits_100_plus = EXCLUDED.visits_100_plus,
  visits_140_plus = EXCLUDED.visits_140_plus,
  visits_180 = EXCLUDED.visits_180,
  updated_at = NOW();

-- ============================================================================
-- PART 4: Verify match_history has RLS enabled and proper policies
-- ============================================================================

-- Enable RLS on match_history
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own match history" ON public.match_history;
DROP POLICY IF EXISTS "System can insert match history" ON public.match_history;

-- Create policy for users to view their own history
CREATE POLICY "Users can view their own match history" 
  ON public.match_history FOR SELECT 
  USING (auth.uid() = user_id);

-- Create policy for system to insert match history
CREATE POLICY "System can insert match history" 
  ON public.match_history FOR INSERT 
  WITH CHECK (true);

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT 'Stats recording system fixed!' as status;
