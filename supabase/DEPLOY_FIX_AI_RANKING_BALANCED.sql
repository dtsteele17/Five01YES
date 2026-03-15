-- =============================================================================
-- BALANCED AI RANKING POINT SYSTEM
-- =============================================================================
-- Key goals:
-- 1. Zero-sum-ish for AI players as a group (points don't inflate over time)
-- 2. Top players are sticky but can fall on bad runs
-- 3. Lower players can rise on good runs but it's gradual
-- 4. Season decay (30%) already exists, keeping it
-- 5. No AI player can exceed starting_points + 100 over their career
-- =============================================================================

-- Add starting_points column to track initial points for bounding
ALTER TABLE career_pro_rankings ADD COLUMN IF NOT EXISTS starting_points NUMERIC;

-- Initialize starting_points for existing rankings that don't have it
UPDATE career_pro_rankings 
SET starting_points = ranking_points 
WHERE starting_points IS NULL;

-- =============================================================================
-- rpc_world_rankings_simulate - Pre-Pro Tour AI Simulation
-- =============================================================================
-- Called when player hasn't reached Pro Tour yet
-- Simulates tournament results for AI players with balanced point changes
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_world_rankings_simulate(UUID);
CREATE OR REPLACE FUNCTION rpc_world_rankings_simulate(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_ai RECORD;
  v_total_ai INT;
  v_tournaments_to_sim INT := 2;  -- Simulate 2 tournaments per call
  v_t INT;
  v_simulated_results JSON[];
  v_placement_points INT[];  -- Points per placement in a 64-player bracket
  v_expectation_penalty INT[];  -- Penalty matrix [rank_tier][exit_round]
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF NOT EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('no_rankings', true);
  END IF;

  -- Don't run simulation if player is already on Pro Tour
  IF v_career.tier >= 5 THEN
    RETURN json_build_object('skipped', true, 'reason', 'Pro Tour uses real award_points');
  END IF;

  -- Points awarded per placement (for 64-player bracket)
  -- W=50, RU=30, SF=18, QF=10, L16=5, L32=2, L64=0
  v_placement_points := ARRAY[50, 30, 18, 18, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  -- Simulate tournaments
  FOR v_t IN 1..v_tournaments_to_sim LOOP
    -- For each AI player, simulate a tournament result
    FOR v_ai IN
      SELECT id, ranking_points, ranking_position, starting_points
      FROM career_pro_rankings
      WHERE career_id = p_career_id AND is_player = FALSE
      ORDER BY ranking_position
    LOOP
      DECLARE
        v_skill_factor NUMERIC;
        v_finish_position INT;
        v_base_points INT;
        v_penalty INT := 0;
        v_final_change INT;
        v_rand NUMERIC;
        v_max_points NUMERIC;
      BEGIN
        -- Skill factor based on ranking (top players more likely to finish well)
        -- Position 1 = 0.95, Position 25 = 0.60, Position 99 = 0.20
        v_skill_factor := GREATEST(0.15, 0.98 - (v_ai.ranking_position - 1) * 0.008);
        
        -- Random factor with skill weighting
        -- Lower random = better placement
        v_rand := random() * (1.0 - v_skill_factor * 0.7);
        
        -- Convert to finish position (1-64)
        v_finish_position := GREATEST(1, LEAST(64, CEIL(v_rand * 64)));
        
        -- Get base points for this placement
        v_base_points := v_placement_points[v_finish_position];
        
        -- Calculate expectation penalty
        -- Top 2: Lose points if exit before SF (pos 3-4)
        IF v_ai.ranking_position <= 2 THEN
          IF v_finish_position >= 33 THEN v_penalty := 15;      -- R1 exit
          ELSIF v_finish_position >= 17 THEN v_penalty := 12;   -- L32
          ELSIF v_finish_position >= 9 THEN v_penalty := 8;     -- L16
          ELSIF v_finish_position >= 5 THEN v_penalty := 3;     -- QF
          END IF;
        -- Top 8: Lose points if exit before QF (pos 5-8)
        ELSIF v_ai.ranking_position <= 8 THEN
          IF v_finish_position >= 33 THEN v_penalty := 10;
          ELSIF v_finish_position >= 17 THEN v_penalty := 8;
          ELSIF v_finish_position >= 9 THEN v_penalty := 4;
          END IF;
        -- Top 15: Lose points if exit before L16 (pos 9-16)
        ELSIF v_ai.ranking_position <= 15 THEN
          IF v_finish_position >= 33 THEN v_penalty := 6;
          ELSIF v_finish_position >= 17 THEN v_penalty := 4;
          END IF;
        -- Top 25: Lose points if exit R1
        ELSIF v_ai.ranking_position <= 25 THEN
          IF v_finish_position >= 33 THEN v_penalty := 3;
          END IF;
        -- Below 25: Never lose points (no expectations)
        END IF;
        
        -- Final change: base points minus penalty
        v_final_change := v_base_points - v_penalty;
        
        -- Calculate max points (starting + 100 cap)
        v_max_points := COALESCE(v_ai.starting_points, v_ai.ranking_points) + 100;
        
        -- Apply the change, respecting the cap
        UPDATE career_pro_rankings
        SET 
          prev_points = ranking_points,
          ranking_points = GREATEST(5, LEAST(v_max_points, ranking_points + v_final_change))
        WHERE id = v_ai.id;
      END;
    END LOOP;
  END LOOP;

  -- Re-rank all players by points
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'tournaments_simulated', v_tournaments_to_sim);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_world_rankings_simulate(UUID) TO authenticated;

-- =============================================================================
-- rpc_pro_tour_init_rankings - Initialize Pro Tour Rankings (updated)
-- =============================================================================
-- Now stores starting_points for the cap calculation
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_pro_tour_init_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_init_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_i INT;
  v_points NUMERIC;
  v_names TEXT[];
  v_first_names TEXT[] := ARRAY[
    'Joel','Jasper','Felix','Ruben','Sven','Connor','Kal','Aidan','Roman','Ronan',
    'Kyle','Declan','Callum','Theo','Jake','Matty','Noel','Zach','Cillian','Ellis',
    'Hugo','Brendan','Liam','Oscar','Kai','Finn','Leon','Max','Owen','Tyler',
    'Bradley','Patrick','Dominic','Kieran','Marcus','Stefan','Lars','Kris','Marco','Fabio',
    'Klaus','Hans','Erik','Nils','Piotr','Tomas','Andrei','Viktor','Dmitri','Yuki',
    'Kenji','Raj','Arjun','Isaac','Gabriel','Rafael','Antonio','Pedro','Diego','Mateo',
    'Dan','Kyran','Josh','Ethan','Jordan','Matt','Harry','Chris','Gabe','Jacob',
    'Ollie','Freddie','George','Archie','Dylan','Logan','Charlie','Rory','Wayne','Craig',
    'Darren','Jason','Neil','Glen','Karl','Toby','Jack','Noah','Callum','Aiden',
    'Miguel','Carlos','Ali','Omar','Hamza','Vikram','Hugo','Felix','Soren','Axel'
  ];
  v_last_names TEXT[] := ARRAY[
    'Russell','Harvey','Holt','Cooper','Fletcher','Quinn','Murphy','Brennan','Gray','Visser',
    'Drake','Richter','Thorne','Hughes','Lawson','Reeves','Holmes','Hartley','Romano','Wells',
    'Langley','Jarvis','Conway','Steele','Hall','Maier','Baker','Hutchinson','Perry','Davies',
    'Smith','Jones','Brown','Wilson','Taylor','Clark','Lewis','Walker','Green','King',
    'Wright','Scott','Adams','Hill','Moore','Wood','Kelly','Evans','Cox','Webb',
    'Stone','Cole','Ford','Ross','Reed','Mills','West','Fox','Hayes','Day',
    'Hart','Long','Cross','Lane','Flynn','Nash','Burke','Walsh','Burns','Quinn',
    'Rhodes','Marshall','Hunter','Barker','Watson','Palmer','Ryan','Price','Bennett','Campbell',
    'Murray','Stewart','Crawford','Cameron','Davidson','Grant','Hamilton','Robertson','Thomson','Henderson',
    'Novak','Kowalski','Petrov','Mueller','Fischer','Weber','Schneider','Becker','Berg','Johansson'
  ];
  v_nicknames TEXT[] := ARRAY[
    'Big Dog','Voltage','The Phantom','Killer','Rapid','Razor','Crosshair','Lightning','Smooth','Stealth',
    'The Sniper','Sidewinder','The Gladiator','The General','Fireball','Apex','The Magician','Pitbull',
    'The Hammer','Ice','Bulletproof','The Ace','Dynamite','Ironside','The Flash','Viper','The Rock',
    'Blitz','Thunder','The Machine','Scorpion','Wildcard','The Wolf','Maverick','The Surgeon',
    'Skill Magill','The Dart','Hotshot','Cobra','The Natural','Laser','The Viking','Tornado',
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  ];
  v_archetypes TEXT[] := ARRAY['Scorer','Grinder','Clutch','Scorer','Grinder','Clutch','Scorer','Grinder'];
  v_fn TEXT;
  v_ln TEXT;
  v_nn TEXT;
  v_full_name TEXT;
  v_used_names TEXT[] := ARRAY[]::TEXT[];
  v_attempts INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('already_initialized', true);
  END IF;

  FOR v_i IN 1..99 LOOP
    v_attempts := 0;
    LOOP
      v_fn := v_first_names[1 + floor(random() * array_length(v_first_names, 1))::int];
      v_ln := v_last_names[1 + floor(random() * array_length(v_last_names, 1))::int];
      v_full_name := v_fn || ' ' || v_ln;
      v_attempts := v_attempts + 1;
      EXIT WHEN NOT (v_full_name = ANY(v_used_names)) OR v_attempts > 200;
    END LOOP;
    v_used_names := array_append(v_used_names, v_full_name);

    v_nn := v_nicknames[1 + floor(random() * array_length(v_nicknames, 1))::int];
    IF v_nn IS NOT NULL THEN
      v_full_name := v_fn || ' ''' || v_nn || ''' ' || v_ln;
    END IF;

    -- Starting points by tier
    IF v_i <= 3 THEN v_points := 450 + floor(random() * 100);
    ELSIF v_i <= 10 THEN v_points := 350 + floor(random() * 100);
    ELSIF v_i <= 25 THEN v_points := 250 + floor(random() * 100);
    ELSIF v_i <= 50 THEN v_points := 150 + floor(random() * 100);
    ELSIF v_i <= 75 THEN v_points := 80 + floor(random() * 70);
    ELSE v_points := 20 + floor(random() * 60);
    END IF;

    INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, starting_points, ranking_position, expected_round)
    VALUES (p_career_id, v_full_name, FALSE, v_points, v_points,  -- starting_points = initial ranking_points
      v_i,
      CASE WHEN v_i <= 10 THEN 'L16' WHEN v_i <= 25 THEN 'L32' WHEN v_i <= 60 THEN 'L64' ELSE NULL END);
  END LOOP;

  -- Player starts with modest points at rank 100
  DECLARE
    v_player_points NUMERIC := 15 + floor(random() * 20);
  BEGIN
    INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, starting_points, ranking_position)
    VALUES (p_career_id, 'You', TRUE, v_player_points, v_player_points, 100);
  END;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'players_created', 100);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_init_rankings(UUID) TO authenticated;

-- =============================================================================
-- rpc_pro_tour_award_ai_points - Balanced version for actual tournaments
-- =============================================================================
-- Called when player is on Pro Tour after each tournament
-- Uses the same balanced point system
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSON);
DROP FUNCTION IF EXISTS rpc_pro_tour_award_ai_points(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION rpc_pro_tour_award_ai_points(
  p_career_id UUID,
  p_event_id UUID,
  p_results JSON
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_name TEXT;
  v_placement TEXT;
  v_base_points INT;
  v_penalty INT;
  v_final_change INT;
  v_updated INT := 0;
  v_ranking_position INT;
  v_starting_pts NUMERIC;
  v_current_pts NUMERIC;
  v_max_points NUMERIC;
  v_event_subtype TEXT;
  v_multiplier NUMERIC := 1.0;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  v_event_subtype := COALESCE(v_event.event_subtype, 'players_championship');

  -- Tournament multiplier (majors/world series worth more)
  v_multiplier := CASE v_event_subtype
    WHEN 'players_championship' THEN 1.0
    WHEN 'pro_major' THEN 1.5
    WHEN 'world_series' THEN 1.8
    ELSE 1.0
  END;

  FOR v_name, v_placement IN SELECT key, value#>>'{}' FROM json_each(p_results)
  LOOP
    -- Get current rank and points for this player
    SELECT ranking_position, ranking_points, starting_points 
    INTO v_ranking_position, v_current_pts, v_starting_pts
    FROM career_pro_rankings
    WHERE career_id = p_career_id AND player_name = v_name AND is_player = FALSE;
    
    IF NOT FOUND THEN CONTINUE; END IF;
    
    -- Base points by placement
    v_base_points := CASE v_placement
      WHEN 'W' THEN 50
      WHEN 'RU' THEN 30
      WHEN 'SF' THEN 18
      WHEN 'QF' THEN 10
      WHEN 'L16' THEN 5
      WHEN 'L32' THEN 2
      WHEN 'L64' THEN 0
      WHEN 'L128' THEN 0
      ELSE 0
    END;
    
    -- Apply tournament multiplier
    v_base_points := ROUND(v_base_points * v_multiplier);
    
    -- Calculate expectation penalty
    v_penalty := 0;
    
    -- Placement ordering for comparison (lower = better)
    DECLARE
      v_place_rank INT;
    BEGIN
      v_place_rank := CASE v_placement
        WHEN 'W' THEN 1
        WHEN 'RU' THEN 2
        WHEN 'SF' THEN 3
        WHEN 'QF' THEN 5
        WHEN 'L16' THEN 9
        WHEN 'L32' THEN 17
        WHEN 'L64' THEN 33
        WHEN 'L128' THEN 65
        ELSE 65
      END;
      
      -- Top 2: Lose points if exit before SF
      IF v_ranking_position <= 2 THEN
        IF v_place_rank >= 33 THEN v_penalty := ROUND(15 * v_multiplier);
        ELSIF v_place_rank >= 17 THEN v_penalty := ROUND(12 * v_multiplier);
        ELSIF v_place_rank >= 9 THEN v_penalty := ROUND(8 * v_multiplier);
        ELSIF v_place_rank >= 5 THEN v_penalty := ROUND(3 * v_multiplier);
        END IF;
      -- Top 8: Lose points if exit before QF
      ELSIF v_ranking_position <= 8 THEN
        IF v_place_rank >= 33 THEN v_penalty := ROUND(10 * v_multiplier);
        ELSIF v_place_rank >= 17 THEN v_penalty := ROUND(8 * v_multiplier);
        ELSIF v_place_rank >= 9 THEN v_penalty := ROUND(4 * v_multiplier);
        END IF;
      -- Top 15: Lose points if exit before L16
      ELSIF v_ranking_position <= 15 THEN
        IF v_place_rank >= 33 THEN v_penalty := ROUND(6 * v_multiplier);
        ELSIF v_place_rank >= 17 THEN v_penalty := ROUND(4 * v_multiplier);
        END IF;
      -- Top 25: Lose points if exit R1
      ELSIF v_ranking_position <= 25 THEN
        IF v_place_rank >= 33 THEN v_penalty := ROUND(3 * v_multiplier);
        END IF;
      END IF;
    END;
    
    -- Final change
    v_final_change := v_base_points - v_penalty;
    
    -- Calculate max points (starting + 100 cap)
    v_max_points := COALESCE(v_starting_pts, v_current_pts) + 100;

    UPDATE career_pro_rankings
    SET ranking_points = GREATEST(5, LEAST(v_max_points, ranking_points + v_final_change)),
        prev_points = ranking_points,
        points_change = v_final_change
    WHERE career_id = p_career_id
      AND player_name = v_name
      AND is_player = FALSE;

    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  -- Re-rank all players by points
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS new_pos
    FROM career_pro_rankings
    WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r
  SET ranking_position = ranked.new_pos
  FROM ranked
  WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'updated', v_updated);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_award_ai_points(UUID, UUID, JSON) TO authenticated;
