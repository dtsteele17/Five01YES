-- Fix Tier 2 careers that have no opponents
-- Run this to generate opponents for any T2 career missing them

-- First, check and fix any career that has league standings but no opponents
DO $$
DECLARE
  v_career RECORD;
  v_opponent_count INT;
BEGIN
  FOR v_career IN 
    SELECT cp.id, cp.tier, cp.season, cp.career_seed
    FROM career_profiles cp
    WHERE cp.tier = 2 AND cp.status = 'active'
  LOOP
    -- Check if this career has opponents for tier 2
    SELECT COUNT(*) INTO v_opponent_count
    FROM career_opponents
    WHERE career_id = v_career.id AND tier = 2;
    
    IF v_opponent_count < 7 THEN
      RAISE NOTICE 'Generating opponents for career %', v_career.id;
      PERFORM rpc_generate_career_opponents(v_career.id, 2::SMALLINT, 7, v_career.career_seed + v_career.season * 100);
      
      -- Re-link league standings to opponents
      UPDATE career_league_standings ls
      SET opponent_id = (
        SELECT co.id FROM career_opponents co
        WHERE co.career_id = v_career.id AND co.tier = 2
        AND co.id NOT IN (
          SELECT opponent_id FROM career_league_standings 
          WHERE career_id = v_career.id AND season = v_career.season AND opponent_id IS NOT NULL
        )
        LIMIT 1
      )
      WHERE ls.career_id = v_career.id 
        AND ls.season = v_career.season 
        AND ls.is_player = FALSE 
        AND ls.opponent_id IS NULL;
    END IF;
  END LOOP;
END $$;
