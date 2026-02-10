/*
  # Integrate Dartbot Stats with Stats Filtering System
  
  ## Overview
  This migration ensures that dartbot match stats are properly integrated with the
  existing stats filtering system. Dartbot matches will appear under:
  - Game Mode: 301 or 501 (as selected)
  - Match Type: "Dartbot" (new filter option)
  
  ## Changes
  1. Verify match_history table can handle 'dartbot' match_format
  2. Create view for dartbot-specific stats
  3. Update filtered stats function to include dartbot option
  4. Add helper functions for dartbot stat calculations
*/

-- ============================================================
-- 1. Ensure match_history accepts 'dartbot' match_format
-- ============================================================

-- Check current constraint
DO $$
BEGIN
  -- Drop and recreate constraint to include 'dartbot' if needed
  ALTER TABLE match_history 
  DROP CONSTRAINT IF EXISTS match_history_match_format_check;
  
  ALTER TABLE match_history 
  ADD CONSTRAINT match_history_match_format_check 
  CHECK (match_format IN (
    'quick',      -- Quick Match
    'ranked',     -- Ranked Match
    'private',    -- Private Match
    'local',      -- Local Match
    'tournament', -- Tournament Match
    'league',     -- League Match
    'training',   -- Training Mode
    'dartbot'     -- vs Dartbot
  ));
END $$;

-- ============================================================
-- 2. Create View: Dartbot Match Summary
-- ============================================================

CREATE OR REPLACE VIEW v_dartbot_match_summary AS
SELECT 
  dmr.id as room_id,
  dmr.player_id as user_id,
  dmr.dartbot_level,
  dmr.game_mode,
  dmr.match_format,
  dmr.double_out,
  dmr.status,
  dmr.player_legs,
  dmr.dartbot_legs,
  CASE 
    WHEN dmr.winner_id = dmr.player_id THEN 'win'
    ELSE 'loss'
  END as result,
  dmr.player_first9_score,
  dmr.player_first9_darts,
  dmr.created_at,
  dmr.completed_at,
  -- Aggregated stats from visits
  (
    SELECT COALESCE(SUM(score), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as total_score,
  (
    SELECT COALESCE(SUM(darts_thrown), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as total_darts,
  (
    SELECT COALESCE(MAX(score), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as highest_score,
  (
    SELECT COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
  ) as total_checkouts,
  (
    SELECT COALESCE(SUM(CASE WHEN score >= 100 THEN 1 ELSE 0 END), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as count_100_plus,
  (
    SELECT COALESCE(SUM(CASE WHEN score >= 140 THEN 1 ELSE 0 END), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as count_140_plus,
  (
    SELECT COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0)
    FROM dartbot_visits dv
    WHERE dv.room_id = dmr.id 
      AND dv.player_type = 'player'
      AND dv.is_bust = false
  ) as count_180
FROM dartbot_match_rooms dmr
WHERE dmr.status IN ('finished', 'forfeited');

-- Enable RLS on the view (inherits from underlying table)
ALTER VIEW v_dartbot_match_summary OWNER TO postgres;

-- ============================================================
-- 3. RPC: Get Filtered Dartbot Stats
-- ============================================================

CREATE OR REPLACE FUNCTION get_dartbot_player_stats(
  p_game_mode integer DEFAULT NULL -- NULL = all, 301 or 501
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'success', true,
    'match_format', 'dartbot',
    'game_mode_filter', p_game_mode,
    'stats', jsonb_build_object(
      'total_matches', COALESCE(COUNT(*), 0),
      'wins', COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0),
      'losses', COALESCE(SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END), 0),
      'total_darts', COALESCE(SUM(total_darts), 0),
      'total_score', COALESCE(SUM(total_score), 0),
      'three_dart_avg', CASE 
        WHEN COALESCE(SUM(total_darts), 0) > 0 
        THEN ROUND((COALESCE(SUM(total_score), 0)::numeric / SUM(total_darts)) * 3, 2)
        ELSE 0 
      END,
      'highest_score', COALESCE(MAX(highest_score), 0),
      'total_checkouts', COALESCE(SUM(total_checkouts), 0),
      'visits_100_plus', COALESCE(SUM(count_100_plus), 0),
      'visits_140_plus', COALESCE(SUM(count_140_plus), 0),
      'visits_180', COALESCE(SUM(count_180), 0)
    ),
    'by_dartbot_level', (
      SELECT jsonb_object_agg(
        'level_' || dartbot_level,
        jsonb_build_object(
          'matches', level_count,
          'wins', level_wins,
          'win_rate', CASE WHEN level_count > 0 THEN ROUND((level_wins::numeric / level_count) * 100, 1) ELSE 0 END
        )
      )
      FROM (
        SELECT 
          dartbot_level,
          COUNT(*) as level_count,
          SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as level_wins
        FROM v_dartbot_match_summary
        WHERE user_id = auth.uid()
          AND (p_game_mode IS NULL OR game_mode = p_game_mode)
        GROUP BY dartbot_level
      ) levels
    )
  ) INTO v_result
  FROM v_dartbot_match_summary
  WHERE user_id = auth.uid()
    AND (p_game_mode IS NULL OR game_mode = p_game_mode);
  
  RETURN COALESCE(v_result, jsonb_build_object(
    'success', true,
    'match_format', 'dartbot',
    'game_mode_filter', p_game_mode,
    'stats', jsonb_build_object(
      'total_matches', 0,
      'wins', 0,
      'losses', 0,
      'three_dart_avg', 0,
      'visits_180', 0
    ),
    'by_dartbot_level', '{}'::jsonb
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RPC: Get Combined Stats (All Match Types)
-- ============================================================

CREATE OR REPLACE FUNCTION get_player_stats_all_formats(
  p_game_mode integer DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'success', true,
    'game_mode_filter', p_game_mode,
    'formats', jsonb_build_object(
      'all', jsonb_build_object(
        'matches', COALESCE(SUM(total_matches), 0),
        'wins', COALESCE(SUM(wins), 0),
        'losses', COALESCE(SUM(losses), 0),
        'avg', CASE 
          WHEN COALESCE(SUM(total_darts_thrown), 0) > 0 
          THEN ROUND((COALESCE(SUM(total_score), 0)::numeric / SUM(total_darts_thrown)) * 3, 2)
          ELSE 0 
        END
      ),
      'quick', jsonb_build_object(
        'matches', COALESCE(SUM(CASE WHEN match_format = 'quick' THEN total_matches ELSE 0 END), 0),
        'wins', COALESCE(SUM(CASE WHEN match_format = 'quick' THEN wins ELSE 0 END), 0)
      ),
      'ranked', jsonb_build_object(
        'matches', COALESCE(SUM(CASE WHEN match_format = 'ranked' THEN total_matches ELSE 0 END), 0),
        'wins', COALESCE(SUM(CASE WHEN match_format = 'ranked' THEN wins ELSE 0 END), 0)
      ),
      'dartbot', jsonb_build_object(
        'matches', COALESCE(SUM(CASE WHEN match_format = 'dartbot' THEN total_matches ELSE 0 END), 0),
        'wins', COALESCE(SUM(CASE WHEN match_format = 'dartbot' THEN wins ELSE 0 END), 0)
      ),
      'private', jsonb_build_object(
        'matches', COALESCE(SUM(CASE WHEN match_format = 'private' THEN total_matches ELSE 0 END), 0),
        'wins', COALESCE(SUM(CASE WHEN match_format = 'private' THEN wins ELSE 0 END), 0)
      )
    )
  ) INTO v_result
  FROM (
    -- From player_stats (aggregate table)
    SELECT 
      total_matches,
      wins,
      losses,
      total_darts_thrown,
      total_score,
      'aggregate'::text as match_format
    FROM player_stats
    WHERE user_id = auth.uid()
    
    UNION ALL
    
    -- From match_history (detailed records including dartbot)
    SELECT 
      1 as total_matches,
      CASE WHEN result = 'win' THEN 1 ELSE 0 END as wins,
      CASE WHEN result = 'loss' THEN 1 ELSE 0 END as losses,
      darts_thrown as total_darts_thrown,
      total_score,
      match_format
    FROM match_history
    WHERE user_id = auth.uid()
      AND (p_game_mode IS NULL OR game_mode = p_game_mode)
  ) combined;
  
  RETURN COALESCE(v_result, jsonb_build_object(
    'success', true,
    'game_mode_filter', p_game_mode,
    'formats', jsonb_build_object(
      'all', jsonb_build_object('matches', 0, 'wins', 0, 'losses', 0, 'avg', 0),
      'quick', jsonb_build_object('matches', 0, 'wins', 0),
      'ranked', jsonb_build_object('matches', 0, 'wins', 0),
      'dartbot', jsonb_build_object('matches', 0, 'wins', 0),
      'private', jsonb_build_object('matches', 0, 'wins', 0)
    )
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Verify/Update fn_get_filtered_player_stats to include dartbot
-- ============================================================

-- This is the main function used by the stats page
-- Ensure it handles 'dartbot' as a valid match_format
CREATE OR REPLACE FUNCTION fn_get_filtered_player_stats(
  p_user_id uuid,
  p_game_mode integer DEFAULT NULL,  -- NULL = all, 301 or 501
  p_match_format text DEFAULT NULL   -- NULL = all, 'quick', 'ranked', 'private', 'dartbot', etc.
)
RETURNS jsonb AS $$
DECLARE
  v_stats record;
BEGIN
  SELECT 
    COUNT(*) as total_matches,
    SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as draws,
    SUM(darts_thrown) as total_darts,
    SUM(total_score) as total_score,
    AVG(three_dart_avg) as avg_three_dart,
    AVG(first9_avg) as avg_first9,
    MAX(highest_checkout) as highest_checkout,
    AVG(checkout_percentage) as avg_checkout_pct,
    SUM(visits_100_plus) as total_100_plus,
    SUM(visits_140_plus) as total_140_plus,
    SUM(visits_180) as total_180s,
    SUM(total_checkouts) as total_checkouts,
    SUM(checkout_attempts) as total_checkout_attempts
  INTO v_stats
  FROM match_history
  WHERE user_id = p_user_id
    AND (p_game_mode IS NULL OR game_mode = p_game_mode)
    AND (p_match_format IS NULL OR match_format = p_match_format);
  
  RETURN jsonb_build_object(
    'success', true,
    'filters', jsonb_build_object(
      'game_mode', p_game_mode,
      'match_format', p_match_format
    ),
    'stats', jsonb_build_object(
      'total_matches', COALESCE(v_stats.total_matches, 0),
      'wins', COALESCE(v_stats.wins, 0),
      'losses', COALESCE(v_stats.losses, 0),
      'draws', COALESCE(v_stats.draws, 0),
      'three_dart_average', COALESCE(ROUND(v_stats.avg_three_dart::numeric, 2), 0),
      'first9_average', COALESCE(ROUND(v_stats.avg_first9::numeric, 2), 0),
      'highest_checkout', COALESCE(v_stats.highest_checkout, 0),
      'checkout_percentage', COALESCE(ROUND(v_stats.avg_checkout_pct::numeric, 2), 0),
      'visits_100_plus', COALESCE(v_stats.total_100_plus, 0),
      'visits_140_plus', COALESCE(v_stats.total_140_plus, 0),
      'visits_180', COALESCE(v_stats.total_180s, 0),
      'total_darts_thrown', COALESCE(v_stats.total_darts, 0),
      'total_score', COALESCE(v_stats.total_score, 0),
      'total_checkouts', COALESCE(v_stats.total_checkouts, 0),
      'checkout_attempts', COALESCE(v_stats.total_checkout_attempts, 0)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Create Index for Dartbot Stats Queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_match_history_dartbot 
ON match_history(match_format, game_mode, user_id) 
WHERE match_format = 'dartbot';

-- ============================================================
-- 7. Grant Execute Permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION get_dartbot_player_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_stats_all_formats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_filtered_player_stats(uuid, integer, text) TO authenticated;

-- ============================================================
-- 8. Add Comment Documentation
-- ============================================================

COMMENT ON TABLE dartbot_match_rooms IS 'Stores dartbot match state. Stats are recorded to match_history with match_format=''dartbot'' on completion.';
COMMENT ON TABLE dartbot_visits IS 'Detailed visit tracking for dartbot matches. Each 3-dart visit is recorded here.';
COMMENT ON FUNCTION finalize_dartbot_match(uuid, uuid) IS 'Finalizes match and records stats to match_history (match_format=''dartbot'') and player_stats';
