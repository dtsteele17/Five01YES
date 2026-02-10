-- Debug and fix any missing columns or data issues

-- 1. Ensure match_rooms has the leg count columns
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS player1_legs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS player2_legs INTEGER DEFAULT 0;

UPDATE public.match_rooms SET player1_legs = 0 WHERE player1_legs IS NULL;
UPDATE public.match_rooms SET player2_legs = 0 WHERE player2_legs IS NULL;

-- 2. Add missing columns to match_history if needed
ALTER TABLE public.match_history 
ADD COLUMN IF NOT EXISTS total_checkouts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS checkout_attempts INTEGER DEFAULT 0;

-- 3. Verify match_format values are consistent
-- Check what values exist
SELECT DISTINCT match_format, COUNT(*) as count 
FROM public.match_history 
GROUP BY match_format;

-- 4. Create a view for easy stats debugging
CREATE OR REPLACE VIEW public.v_match_stats_summary AS
SELECT 
  user_id,
  game_mode,
  match_format,
  COUNT(*) as total_matches,
  SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
  SUM(darts_thrown) as total_darts,
  SUM(total_score) as total_score,
  ROUND((SUM(total_score)::DECIMAL / NULLIF(SUM(darts_thrown), 0)) * 3, 2) as avg_3dart
FROM public.match_history
GROUP BY user_id, game_mode, match_format;

-- Grant access
GRANT SELECT ON public.v_match_stats_summary TO authenticated;
GRANT SELECT ON public.v_match_stats_summary TO anon;

-- 5. Add helpful comment
COMMENT ON VIEW public.v_match_stats_summary IS 'Debug view to verify stats are being recorded correctly by game mode and match type';

SELECT 'Stats system debugged!' as status;
