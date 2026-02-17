-- ============================================================================
-- FIX DARTBOT FUNCTION SIGNATURE MISMATCH
-- ============================================================================
-- There are conflicting function signatures across migrations.
-- This migration ensures the correct 25-parameter version is the only one active.

-- First ensure all opponent stats columns exist
ALTER TABLE public.match_history
ADD COLUMN IF NOT EXISTS opponent_three_dart_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_first9_avg DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_highest_checkout INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_checkout_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_darts_thrown INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_100_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_140_plus INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_visits_180 INTEGER DEFAULT 0;

-- ============================================================================
-- DROP ALL VERSIONS OF THE FUNCTION COMPLETELY
-- ============================================================================

-- Drop all existing versions with different signatures
DROP FUNCTION IF EXISTS record_dartbot_match_completion(
  integer, text, integer, integer, integer, text, timestamptz, timestamptz,
  numeric, numeric, integer, numeric, integer, integer, integer, integer,
  integer, integer, integer, numeric, numeric, integer, numeric, integer,
  integer, integer, integer
);

DROP FUNCTION IF EXISTS record_dartbot_match_completion(
  integer, text, integer, integer, integer, text,
  numeric, numeric, numeric, integer, integer, integer,
  integer, integer, integer, numeric, numeric, numeric,
  integer, integer, integer, integer, integer, integer, integer
);

DROP FUNCTION IF EXISTS record_dartbot_match_completion(
  integer, text, integer, integer, integer, text,
  decimal, decimal, decimal, integer, integer, integer,
  integer, integer, integer, decimal, decimal, decimal,
  integer, integer, integer, integer, integer, integer, integer
);

-- Use DO block as fallback to catch any other signatures
DO $$
DECLARE
  func_record RECORD;
BEGIN
  FOR func_record IN 
    SELECT oid::regprocedure as func_name
    FROM pg_proc 
    WHERE proname = 'record_dartbot_match_completion'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || func_record.func_name || ' CASCADE';
  END LOOP;
END $$;

-- ============================================================================
-- CREATE THE CORRECT 25-PARAMETER VERSION (matches frontend)
-- ============================================================================

CREATE OR REPLACE FUNCTION record_dartbot_match_completion(
  p_game_mode INTEGER,
  p_match_format TEXT,
  p_dartbot_level INTEGER,
  p_player_legs_won INTEGER,
  p_bot_legs_won INTEGER,
  p_winner TEXT,
  p_player_three_dart_avg DECIMAL DEFAULT 0,
  p_player_first9_avg DECIMAL DEFAULT 0,
  p_player_checkout_pct DECIMAL DEFAULT 0,
  p_player_highest_checkout INTEGER DEFAULT 0,
  p_player_darts_at_double INTEGER DEFAULT 0,
  p_player_total_darts INTEGER DEFAULT 0,
  p_player_100_plus INTEGER DEFAULT 0,
  p_player_140_plus INTEGER DEFAULT 0,
  p_player_180s INTEGER DEFAULT 0,
  -- Bot stats as opponent stats
  p_bot_three_dart_avg DECIMAL DEFAULT 0,
  p_bot_first9_avg DECIMAL DEFAULT 0,
  p_bot_checkout_pct DECIMAL DEFAULT 0,
  p_bot_highest_checkout INTEGER DEFAULT 0,
  p_bot_darts_at_double INTEGER DEFAULT 0,
  p_bot_total_darts INTEGER DEFAULT 0,
  p_bot_100_plus INTEGER DEFAULT 0,
  p_bot_140_plus INTEGER DEFAULT 0,
  p_bot_180s INTEGER DEFAULT 0,
  p_bot_total_score INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_room_id UUID;
  v_player_total_score INTEGER := 0;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Calculate player total score from average and darts thrown
  IF p_player_total_darts > 0 AND p_player_three_dart_avg > 0 THEN
    v_player_total_score := ROUND((p_player_three_dart_avg / 3) * p_player_total_darts);
  END IF;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Generate a unique room_id for this match
  v_room_id := gen_random_uuid();
  
    -- Insert into match_history with bot stats stored as opponent stats
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
      bot_level,
      -- Bot stats as opponent stats
      opponent_three_dart_avg,
      opponent_first9_avg,
      opponent_highest_checkout,
      opponent_checkout_percentage,
      opponent_darts_thrown,
      opponent_visits_100_plus,
      opponent_visits_140_plus,
      opponent_visits_180
    ) VALUES (
      v_room_id,
      v_user_id,
      NULL, -- No opponent_id for bot matches
      p_game_mode,
      'dartbot',
      CASE WHEN p_winner = 'player' THEN 'win' ELSE 'loss' END,
      p_player_legs_won,
      p_bot_legs_won,
      p_player_three_dart_avg,
      p_player_first9_avg,
      p_player_highest_checkout,
      p_player_checkout_pct,
      p_player_total_darts,
      v_player_total_score,
      -- Calculate total checkouts from legs won (approximation)
      p_player_legs_won,
      p_player_darts_at_double,
      p_player_100_plus,
      p_player_140_plus,
      p_player_180s,
      NOW(),
      p_dartbot_level,
      -- Bot stats as opponent stats
      p_bot_three_dart_avg,
      p_bot_first9_avg,
      p_bot_highest_checkout,
      p_bot_checkout_pct,
      p_bot_total_darts,
      p_bot_100_plus,
      p_bot_140_plus,
      p_bot_180s
    );
  
  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'message', 'Dartbot match recorded with opponent stats'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, DECIMAL,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION record_dartbot_match_completion(
  INTEGER, TEXT, INTEGER, INTEGER, INTEGER, TEXT,
  DECIMAL, DECIMAL, DECIMAL, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, INTEGER, DECIMAL, DECIMAL, DECIMAL,
  INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER
) TO service_role;

-- ============================================================================
-- VERIFY THE FUNCTION WAS CREATED CORRECTLY
-- ============================================================================

DO $$
DECLARE
  func_oid OID;
  param_count INTEGER;
BEGIN
  SELECT oid, pronargs 
  INTO func_oid, param_count
  FROM pg_proc 
  WHERE proname = 'record_dartbot_match_completion';
  
  IF func_oid IS NULL THEN
    RAISE NOTICE 'ERROR: Function record_dartbot_match_completion was not created!';
  ELSE
    RAISE NOTICE 'SUCCESS: Function record_dartbot_match_completion created with % parameters', param_count;
    IF param_count != 25 THEN
      RAISE WARNING 'WARNING: Function has % parameters, expected 25!', param_count;
    END IF;
  END IF;
END $$;

SELECT 'Dartbot function signature fix complete - 25 parameter version active' as status;
