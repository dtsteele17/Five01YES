-- ============================================================
-- FIX CAREER TOURNAMENTS SYNTAX ERROR
-- Fix PostgreSQL variable declaration and use existing opponents
-- ============================================================

-- Fix the function with the syntax error
CREATE OR REPLACE FUNCTION rpc_fifa_check_mid_season_tournament(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_completed_matches INTEGER;
  v_existing_tournament career_tournaments%ROWTYPE;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Only trigger for Tier 2
  IF v_career.tier != 2 THEN
    RETURN json_build_object('trigger_tournament', false);
  END IF;
  
  -- Count completed league matches this season
  SELECT COUNT(*) INTO v_completed_matches
  FROM career_events ce
  JOIN career_matches cm ON cm.event_id = ce.id
  WHERE ce.career_id = p_career_id 
    AND ce.season = v_career.season
    AND ce.event_type = 'league'
    AND cm.result IN ('win', 'loss');
  
  -- Check if already triggered
  SELECT * INTO v_existing_tournament
  FROM career_tournaments 
  WHERE career_id = p_career_id 
    AND season = v_career.season 
    AND tournament_type = 'mid_season';
  
  -- Trigger after 4th match if not already triggered
  IF v_completed_matches >= 4 AND v_existing_tournament.id IS NULL THEN
    RETURN json_build_object(
      'trigger_tournament', true,
      'tournament_options', json_build_array(
        json_build_object('name', 'County Championship', 'description', '16-player elimination tournament'),
        json_build_object('name', 'Regional Masters', 'description', '16-player cup competition')
      )
    );
  END IF;
  
  RETURN json_build_object('trigger_tournament', false);
END;
$$;

-- Updated function to use EXISTING opponents instead of creating new ones
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_pub_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER := 7;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier
  SELECT COUNT(*) INTO v_existing_opponents 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2;
  
  -- Use existing opponents first, only create new ones if really needed
  IF v_existing_opponents < v_opponents_needed THEN
    -- Generate minimal new opponents using simple approach
    INSERT INTO career_opponents (career_id, tier, first_name, last_name, hometown, archetype, skill_rating)
    SELECT 
      p_career_id, 
      2,
      'Player' || generate_series(v_existing_opponents + 1, v_opponents_needed),
      'Opponent',
      'Local',
      'allrounder',
      50.0
    FROM generate_series(v_existing_opponents + 1, v_opponents_needed);
  END IF;
  
  -- Clear existing league standings for this season
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 2;
  
  -- Create player standing
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, wins, losses, points
  ) VALUES (
    p_career_id, p_season, 2, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings using existing opponents
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, wins, losses, points)
  SELECT p_career_id, p_season, 2, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2
  ORDER BY id
  LIMIT 7;
  
  RETURN json_build_object('success', true, 'league_size', 8);
END;
$$;

-- Updated function to use EXISTING opponents for County League too
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_county_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON  
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER := 11;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier  
  SELECT COUNT(*) INTO v_existing_opponents 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3;
  
  -- Use existing opponents first
  IF v_existing_opponents < v_opponents_needed THEN
    INSERT INTO career_opponents (career_id, tier, first_name, last_name, hometown, archetype, skill_rating)
    SELECT 
      p_career_id, 
      3,
      'County' || generate_series(v_existing_opponents + 1, v_opponents_needed),
      'Player',
      'Regional',
      'allrounder',
      60.0
    FROM generate_series(v_existing_opponents + 1, v_opponents_needed);
  END IF;
  
  -- Clear existing league standings
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 3;
  
  -- Create player standing
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, wins, losses, points
  ) VALUES (
    p_career_id, p_season, 3, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings using existing opponents
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, wins, losses, points)
  SELECT p_career_id, p_season, 3, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3
  ORDER BY id
  LIMIT 11;
  
  RETURN json_build_object('success', true, 'league_size', 12);
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🔧 FIFA Career syntax fixes completed!';
  RAISE NOTICE '✅ Fixed PostgreSQL %ROWTYPE syntax error';
  RAISE NOTICE '✅ Updated to use existing opponents instead of creating random names';
  RAISE NOTICE 'Should deploy without errors now! 🎯';
END $$;