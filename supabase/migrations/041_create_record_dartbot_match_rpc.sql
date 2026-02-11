-- Migration: Create RPC function to record dartbot match completion
-- This bypasses the matches view and inserts directly to match_history and stats tables

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode integer,
  p_match_format text,
  p_dartbot_level integer,
  p_player_legs integer,
  p_dartbot_legs integer,
  p_winner text, -- 'player' or 'dartbot'
  p_started_at timestamptz,
  p_completed_at timestamptz,
  
  -- Player stats
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
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_room_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Generate a unique room_id for this match
  v_room_id := gen_random_uuid();
  
  -- Insert into match_history for stats filtering
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
    v_room_id,
    v_user_id,
    NULL,
    p_game_mode,
    'dartbot',
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
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
    p_completed_at,
    p_dartbot_level
  );
  
  -- Update player_stats aggregate table
  PERFORM update_player_stats_from_dartbot(
    v_user_id,
    p_game_mode,
    CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
    p_darts_thrown,
    p_total_score,
    p_visits_100_plus,
    p_visits_140_plus,
    p_visits_180,
    p_total_checkouts,
    p_checkout_attempts,
    p_highest_checkout
  );
  
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  integer, text, integer, integer, integer, text, timestamptz, timestamptz,
  numeric, numeric, integer, numeric, integer, integer, integer, integer,
  integer, integer, integer
) TO authenticated;
