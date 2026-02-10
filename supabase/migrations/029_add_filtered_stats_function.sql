-- Function to get filtered player stats by game mode and match type

CREATE OR REPLACE FUNCTION public.fn_get_filtered_player_stats(
  p_user_id UUID,
  p_game_mode INTEGER DEFAULT NULL, -- NULL means all modes
  p_match_type TEXT DEFAULT NULL    -- NULL means all types
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Calculate aggregated stats from match_history with filters
  SELECT 
    COUNT(*) as total_matches,
    COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN result = 'draw' THEN 1 END) as draws,
    -- Weighted 3-dart average based on total darts
    CASE 
      WHEN SUM(darts_thrown) > 0 
      THEN (SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3
      ELSE 0 
    END as overall_3dart_avg,
    -- Same calculation for first9 (we'll use overall as approximation from history)
    CASE 
      WHEN SUM(darts_thrown) > 0 
      THEN (SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3
      ELSE 0 
    END as overall_first9_avg,
    MAX(highest_checkout) as highest_checkout,
    SUM(total_checkouts) as total_checkouts,
    SUM(checkout_attempts) as checkout_attempts,
    CASE 
      WHEN SUM(checkout_attempts) > 0 
      THEN (SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100
      ELSE 0 
    END as checkout_percentage,
    SUM(visits_100_plus) as visits_100_plus,
    SUM(visits_140_plus) as visits_140_plus,
    SUM(visits_180) as visits_180,
    SUM(darts_thrown) as total_darts_thrown,
    SUM(total_score) as total_score
  INTO v_result
  FROM public.match_history
  WHERE user_id = p_user_id
    AND (p_game_mode IS NULL OR game_mode = p_game_mode)
    AND (p_match_type IS NULL OR match_format = p_match_type);

  RETURN jsonb_build_object(
    'total_matches', COALESCE(v_result.total_matches, 0),
    'wins', COALESCE(v_result.wins, 0),
    'losses', COALESCE(v_result.losses, 0),
    'draws', COALESCE(v_result.draws, 0),
    'overall_3dart_avg', COALESCE(v_result.overall_3dart_avg, 0),
    'overall_first9_avg', COALESCE(v_result.overall_first9_avg, 0),
    'highest_checkout', COALESCE(v_result.highest_checkout, 0),
    'total_checkouts', COALESCE(v_result.total_checkouts, 0),
    'checkout_attempts', COALESCE(v_result.checkout_attempts, 0),
    'checkout_percentage', COALESCE(v_result.checkout_percentage, 0),
    'visits_100_plus', COALESCE(v_result.visits_100_plus, 0),
    'visits_140_plus', COALESCE(v_result.visits_140_plus, 0),
    'visits_180', COALESCE(v_result.visits_180, 0),
    'total_darts_thrown', COALESCE(v_result.total_darts_thrown, 0),
    'total_score', COALESCE(v_result.total_score, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO anon;

COMMENT ON FUNCTION public.fn_get_filtered_player_stats IS 'Returns aggregated player stats filtered by game mode and match type';
