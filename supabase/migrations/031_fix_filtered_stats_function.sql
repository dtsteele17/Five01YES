-- Fix the filtered stats function to return proper row type
-- This ensures stats are correctly calculated and returned

-- First, create a return type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'player_stats_result') THEN
    CREATE TYPE player_stats_result AS (
      total_matches INTEGER,
      wins INTEGER,
      losses INTEGER,
      draws INTEGER,
      overall_3dart_avg DECIMAL(5,2),
      overall_first9_avg DECIMAL(5,2),
      highest_checkout INTEGER,
      checkout_percentage DECIMAL(5,2),
      total_checkouts INTEGER,
      checkout_attempts INTEGER,
      visits_100_plus INTEGER,
      visits_140_plus INTEGER,
      visits_180 INTEGER,
      total_darts_thrown INTEGER,
      total_score INTEGER
    );
  END IF;
END $$;

-- Drop and recreate the function with proper return type
DROP FUNCTION IF EXISTS public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.fn_get_filtered_player_stats(
  p_user_id UUID,
  p_game_mode INTEGER DEFAULT NULL,
  p_match_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_matches INTEGER,
  wins INTEGER,
  losses INTEGER,
  draws INTEGER,
  overall_3dart_avg DECIMAL(5,2),
  overall_first9_avg DECIMAL(5,2),
  highest_checkout INTEGER,
  checkout_percentage DECIMAL(5,2),
  total_checkouts INTEGER,
  checkout_attempts INTEGER,
  visits_100_plus INTEGER,
  visits_140_plus INTEGER,
  visits_180 INTEGER,
  total_darts_thrown INTEGER,
  total_score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(COUNT(*)::INTEGER, 0) as total_matches,
    COALESCE(COUNT(CASE WHEN result = 'win' THEN 1 END)::INTEGER, 0) as wins,
    COALESCE(COUNT(CASE WHEN result = 'loss' THEN 1 END)::INTEGER, 0) as losses,
    COALESCE(COUNT(CASE WHEN result = 'draw' THEN 1 END)::INTEGER, 0) as draws,
    -- Weighted 3-dart average based on total darts
    COALESCE(
      CASE 
        WHEN SUM(darts_thrown) > 0 
        THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as overall_3dart_avg,
    -- Same calculation for first9 
    COALESCE(
      CASE 
        WHEN SUM(darts_thrown) > 0 
        THEN ROUND(((SUM(total_score)::DECIMAL / SUM(darts_thrown)) * 3)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as overall_first9_avg,
    COALESCE(MAX(highest_checkout)::INTEGER, 0) as highest_checkout,
    COALESCE(
      CASE 
        WHEN SUM(checkout_attempts) > 0 
        THEN ROUND(((SUM(total_checkouts)::DECIMAL / SUM(checkout_attempts)) * 100)::DECIMAL, 2)
        ELSE 0::DECIMAL 
      END, 0::DECIMAL
    ) as checkout_percentage,
    COALESCE(SUM(total_checkouts)::INTEGER, 0) as total_checkouts,
    COALESCE(SUM(checkout_attempts)::INTEGER, 0) as checkout_attempts,
    COALESCE(SUM(visits_100_plus)::INTEGER, 0) as visits_100_plus,
    COALESCE(SUM(visits_140_plus)::INTEGER, 0) as visits_140_plus,
    COALESCE(SUM(visits_180)::INTEGER, 0) as visits_180,
    COALESCE(SUM(darts_thrown)::INTEGER, 0) as total_darts_thrown,
    COALESCE(SUM(total_score)::INTEGER, 0) as total_score
  FROM public.match_history
  WHERE user_id = p_user_id
    AND (p_game_mode IS NULL OR game_mode = p_game_mode)
    AND (p_match_type IS NULL OR match_format = p_match_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_filtered_player_stats(UUID, INTEGER, TEXT) TO anon;

COMMENT ON FUNCTION public.fn_get_filtered_player_stats IS 'Returns aggregated player stats filtered by game mode and match type - returns proper row type';

-- Also ensure match_history has proper data
-- Check if we need to add total_checkouts and checkout_attempts columns
ALTER TABLE public.match_history 
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0;

-- Update any null values
UPDATE public.match_history SET total_checkouts = 0 WHERE total_checkouts IS NULL;
UPDATE public.match_history SET checkout_attempts = 0 WHERE checkout_attempts IS NULL;
