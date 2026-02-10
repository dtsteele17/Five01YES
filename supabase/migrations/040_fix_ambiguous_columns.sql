-- ============================================
-- FIX AMBIGUOUS COLUMN REFERENCES
-- ============================================

-- Drop existing function
DROP FUNCTION IF EXISTS public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT);

-- Recreate with proper table aliases to avoid ambiguity
CREATE OR REPLACE FUNCTION public.fn_get_filtered_player_stats(
  p_user_id UUID,
  p_game_mode INTEGER DEFAULT NULL,
  p_match_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_matches BIGINT,
  wins BIGINT,
  losses BIGINT,
  draws BIGINT,
  avg_3dart NUMERIC,
  highest_checkout INTEGER,
  checkout_pct NUMERIC,
  total_checkouts BIGINT,
  checkout_attempts BIGINT,
  visits_100_plus BIGINT,
  visits_140_plus BIGINT,
  visits_180 BIGINT,
  total_darts BIGINT,
  total_score BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_matches,
    COUNT(CASE WHEN mh.result = 'win' THEN 1 END)::BIGINT as wins,
    COUNT(CASE WHEN mh.result = 'loss' THEN 1 END)::BIGINT as losses,
    COUNT(CASE WHEN mh.result = 'draw' THEN 1 END)::BIGINT as draws,
    ROUND(((SUM(mh.total_score)::DECIMAL / NULLIF(SUM(mh.darts_thrown), 0)) * 3), 2)::NUMERIC as avg_3dart,
    MAX(mh.highest_checkout)::INTEGER as highest_checkout,
    CASE WHEN SUM(mh.checkout_attempts) > 0 
      THEN ROUND(((SUM(mh.total_checkouts)::DECIMAL / SUM(mh.checkout_attempts)) * 100), 2)
      ELSE 0 
    END::NUMERIC as checkout_pct,
    SUM(mh.total_checkouts)::BIGINT as total_checkouts,
    SUM(mh.checkout_attempts)::BIGINT as checkout_attempts,
    SUM(mh.visits_100_plus)::BIGINT as visits_100_plus,
    SUM(mh.visits_140_plus)::BIGINT as visits_140_plus,
    SUM(mh.visits_180)::BIGINT as visits_180,
    SUM(mh.darts_thrown)::BIGINT as total_darts,
    SUM(mh.total_score)::BIGINT as total_score
  FROM public.match_history mh
  WHERE mh.user_id = p_user_id
    AND (p_game_mode IS NULL OR mh.game_mode = p_game_mode)
    AND (p_match_type IS NULL OR mh.match_format = p_match_type);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO authenticated;

SELECT 'Fixed ambiguous column references!' as status;
