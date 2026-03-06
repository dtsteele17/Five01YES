-- ============================================================
-- Fix League Fixtures - Simple Version Using Only League Members  
-- Generate exactly 4 fixtures for the 8 league players
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_get_week_fixtures(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_next_event career_events;
  v_player_match career_matches;
  v_player_opponent_name TEXT;
  v_player_opponent_id UUID;
  v_fixtures JSON[] := '{}';
  fixture_obj JSON;
  league_opponent RECORD;
  opponent_pairs RECORD[];
  pair_count INT := 0;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RAISE EXCEPTION 'Career not found: %', p_career_id;
  END IF;

  -- Get the current league event
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.event_type = 'league'
    AND ce.status IN ('active', 'pending')
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  IF v_next_event.id IS NULL THEN
    RAISE EXCEPTION 'No active league event found for career %', p_career_id;
  END IF;

  -- Get player's opponent (first opponent from league standings alphabetically)
  SELECT 
    co.first_name || ' ' || co.last_name as opponent_name,
    ls.opponent_id
  INTO v_player_opponent_name, v_player_opponent_id
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id 
    AND ls.season = v_career.season 
    AND ls.tier = v_career.tier
    AND ls.is_player = FALSE
  ORDER BY co.first_name, co.last_name
  LIMIT 1;

  IF v_player_opponent_name IS NULL THEN
    RAISE EXCEPTION 'No league opponent found for player';
  END IF;

  -- Get or create the player's match
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.event_id = v_next_event.id
  LIMIT 1;

  -- If no match exists, create one
  IF v_player_match.id IS NULL THEN
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_next_event.id, v_player_opponent_id, v_next_event.format_legs, 'pending'
    ) RETURNING * INTO v_player_match;
  END IF;

  -- Add player's match to fixtures (Fixture 1 of 4)
  fixture_obj := json_build_object(
    'id', v_player_match.id::TEXT,
    'home_team', 'You',
    'away_team', v_player_opponent_name,
    'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won ELSE NULL END,
    'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won ELSE NULL END,
    'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
    'is_player_match', true,
    'event_id', v_next_event.id::TEXT,
    'match_id', v_player_match.id::TEXT
  );
  v_fixtures := v_fixtures || fixture_obj;

  -- Generate 3 more fixtures from remaining 6 league opponents
  -- Get pairs of opponents (excluding the one playing against the player)
  FOR league_opponent IN
    SELECT 
      co.first_name || ' ' || co.last_name as name,
      ROW_NUMBER() OVER (ORDER BY co.first_name, co.last_name) as rn
    FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id != v_player_opponent_id
    ORDER BY co.first_name, co.last_name
  LOOP
    pair_count := pair_count + 1;
    
    -- Create fixtures by pairing opponents: 1vs2, 3vs4, 5vs6
    IF pair_count % 2 = 1 THEN
      -- This is the home team, store it
      v_player_opponent_name := league_opponent.name; -- Reuse variable as temp storage
    ELSE 
      -- This is the away team, create fixture
      fixture_obj := json_build_object(
        'id', gen_random_uuid()::TEXT,
        'home_team', v_player_opponent_name, -- Home team from previous iteration
        'away_team', league_opponent.name,   -- Away team (current)
        'home_score', CASE WHEN random() > 0.5 THEN 2 ELSE floor(random() * 2)::INT END,
        'away_score', CASE WHEN random() > 0.5 THEN floor(random() * 2)::INT ELSE 2 END,
        'status', 'completed',
        'is_player_match', false
      );
      v_fixtures := v_fixtures || fixture_obj;
      
      -- Stop after 3 more fixtures (total 4 including player's)
      IF array_length(v_fixtures, 1) >= 4 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- Return result
  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_next_event.event_name,
    'fixtures', array_to_json(v_fixtures)
  );
END;
$$;

-- Ensure all Tier 2+ careers have proper 8-player leagues
DO $$
DECLARE
    career_record RECORD;
    standings_count INT;
    opponent_record RECORD;
    opponent_count INT;
BEGIN
    FOR career_record IN 
        SELECT id, tier, season FROM career_profiles 
        WHERE status = 'active' AND tier >= 2
    LOOP
        -- Check league standings count
        SELECT COUNT(*) INTO standings_count
        FROM career_league_standings
        WHERE career_id = career_record.id 
          AND season = career_record.season
          AND tier = career_record.tier;
          
        IF standings_count != 8 THEN
            RAISE NOTICE 'Fixing league for career % (currently % players)', career_record.id, standings_count;
            
            -- Clear existing standings
            DELETE FROM career_league_standings
            WHERE career_id = career_record.id 
              AND season = career_record.season
              AND tier = career_record.tier;
            
            -- Ensure we have enough opponents
            SELECT COUNT(*) INTO opponent_count
            FROM career_opponents 
            WHERE career_id = career_record.id AND tier = career_record.tier;
            
            IF opponent_count < 7 THEN
                -- Generate enough opponents  
                PERFORM rpc_generate_career_opponents(
                    career_record.id, 
                    career_record.tier::SMALLINT, 
                    10, 
                    extract(epoch from now())::BIGINT % 2147483647
                );
            END IF;
            
            -- Add player to standings
            INSERT INTO career_league_standings (
                career_id, season, tier, is_player, 
                played, won, lost, legs_for, legs_against, points, average
            ) VALUES (
                career_record.id, career_record.season, career_record.tier, TRUE,
                0, 0, 0, 0, 0, 0, 0.0
            );
            
            -- Add exactly 7 opponents to make 8 total
            FOR opponent_record IN
                SELECT * FROM career_opponents 
                WHERE career_id = career_record.id AND tier = career_record.tier
                ORDER BY first_name, last_name
                LIMIT 7
            LOOP
                INSERT INTO career_league_standings (
                    career_id, season, tier, opponent_id, is_player,
                    played, won, lost, legs_for, legs_against, points, average
                ) VALUES (
                    career_record.id, career_record.season, career_record.tier, 
                    opponent_record.id, FALSE,
                    0, 0, 0, 0, 0, 0, opponent_record.skill_rating
                );
            END LOOP;
            
            RAISE NOTICE 'League fixed: 8 players (1 user + 7 opponents)';
        END IF;
    END LOOP;
END $$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed league fixtures: 4 fixtures using ONLY the 8 actual league members';
END $$;