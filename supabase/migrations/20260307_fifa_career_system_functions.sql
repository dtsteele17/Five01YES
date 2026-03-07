-- ============================================================
-- FIFA-STYLE CAREER SYSTEM - CORE FUNCTIONS
-- All the RPC functions needed for FIFA-style career mode
-- ============================================================

-- 1. FIFA FUNCTION: Initialize 8-player Pub League (Tier 2)
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_pub_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_opponents_needed INTEGER := 7;
  v_existing_count INTEGER;
  v_names TEXT[] := ARRAY[
    'Dave','Mike','Steve','Chris','Andy','Rob','Tom','Phil','Mark','James',
    'Gary','Paul','Kev','Dan','Lee','Terry','Wayne','Craig','Neil','Barry'
  ];
  v_surnames TEXT[] := ARRAY[
    'Smith','Jones','Taylor','Brown','Wilson','Evans','Thomas','Roberts','Johnson','Walker',
    'Wright','Thompson','White','Hall','Clarke','Jackson','Green','Harris','Wood','King'
  ];
  v_hometowns TEXT[] := ARRAY[
    'Manchester', 'Liverpool', 'Leeds', 'Sheffield', 'Newcastle', 'Birmingham',
    'Bristol', 'Cardiff', 'Glasgow', 'Edinburgh', 'Belfast', 'Brighton'
  ];
  v_i INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier
  SELECT COUNT(*) INTO v_existing_count 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2;
  
  -- Generate new opponents if needed
  FOR v_i IN 1..(v_opponents_needed - v_existing_count) LOOP
    INSERT INTO career_opponents (
      career_id, tier, first_name, last_name, hometown, archetype, skill_rating
    ) VALUES (
      p_career_id, 2,
      v_names[1 + (random() * (array_length(v_names, 1) - 1))::integer],
      v_surnames[1 + (random() * (array_length(v_surnames, 1) - 1))::integer],
      v_hometowns[1 + (random() * (array_length(v_hometowns, 1) - 1))::integer],
      (ARRAY['scorer','finisher','grinder','streaky','clutch','allrounder'])[1 + (random() * 5)::integer],
      40 + (random() * 25)::real  -- Skill rating 40-65 for Pub League
    );
  END LOOP;
  
  -- Clear existing league standings for this season
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 2;
  
  -- Create player standing
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, wins, losses, points
  ) VALUES (
    p_career_id, p_season, 2, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings (7 opponents for 8-player league)
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, wins, losses, points)
  SELECT p_career_id, p_season, 2, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2
  ORDER BY random() 
  LIMIT 7;
  
  RETURN json_build_object('success', true, 'league_size', 8, 'opponents_created', v_opponents_needed - v_existing_count);
END;
$$;

-- 2. FIFA FUNCTION: Initialize 12-player County League (Tier 3)
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_county_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON  
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_opponents_needed INTEGER := 11;
  v_existing_count INTEGER;
  v_names TEXT[] := ARRAY[
    'Marcus','Liam','Theo','Callum','Declan','Sven','Nico','Ruben',
    'Finn','Oscar','Erik','Hugo','Felix','Connor','Archie','Owen'
  ];
  v_surnames TEXT[] := ARRAY[
    'Steele','Reeves','Fox','Knight','Griffin','Cole','Spencer','Rhodes',
    'Pearce','Burton','Walsh','Brennan','Gallagher','Keane','Sullivan','Webb'
  ];
  v_hometowns TEXT[] := ARRAY[
    'Oxford', 'Cambridge', 'Norwich', 'Canterbury', 'Chester', 'Durham',
    'Worcester', 'Gloucester', 'Winchester', 'Lancaster'
  ];
  v_i INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier  
  SELECT COUNT(*) INTO v_existing_count 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3;
  
  -- Generate new opponents if needed
  FOR v_i IN 1..(v_opponents_needed - v_existing_count) LOOP
    INSERT INTO career_opponents (
      career_id, tier, first_name, last_name, hometown, archetype, skill_rating
    ) VALUES (
      p_career_id, 3,
      v_names[1 + (random() * (array_length(v_names, 1) - 1))::integer],
      v_surnames[1 + (random() * (array_length(v_surnames, 1) - 1))::integer],
      v_hometowns[1 + (random() * (array_length(v_hometowns, 1) - 1))::integer],
      (ARRAY['scorer','finisher','grinder','streaky','clutch','allrounder'])[1 + (random() * 5)::integer],
      50 + (random() * 30)::real  -- Skill rating 50-80 for County League
    );
  END LOOP;
  
  -- Clear existing league standings
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 3;
  
  -- Create player standing
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, wins, losses, points
  ) VALUES (
    p_career_id, p_season, 3, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings (11 opponents for 12-player league)
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, wins, losses, points)
  SELECT p_career_id, p_season, 3, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3
  ORDER BY random() 
  LIMIT 11;
  
  RETURN json_build_object('success', true, 'league_size', 12, 'opponents_created', v_opponents_needed - v_existing_count);
END;
$$;

-- 3. FIFA FUNCTION: Check if mid-season tournament should be triggered
CREATE OR REPLACE FUNCTION rpc_fifa_check_mid_season_tournament(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed_matches INTEGER;
  v_existing_tournament career_tournaments;
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

-- 4. FIFA FUNCTION: Check if sponsor offer should be triggered (Tier 3+)
CREATE OR REPLACE FUNCTION rpc_fifa_check_sponsor_offer(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_consecutive_wins INTEGER := 0;
  v_sponsor1 career_sponsor_catalog;
  v_sponsor2 career_sponsor_catalog;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Only for Tier 3+ without existing sponsor
  IF v_career.tier < 3 OR v_career.current_sponsor_id IS NOT NULL THEN
    RETURN json_build_object('sponsor_offer', false);
  END IF;
  
  -- Check for 3 consecutive league wins
  WITH recent_matches AS (
    SELECT cm.result, ROW_NUMBER() OVER (ORDER BY ce.created_at DESC) as rn
    FROM career_events ce
    JOIN career_matches cm ON cm.event_id = ce.id
    WHERE ce.career_id = p_career_id 
      AND ce.season = v_career.season
      AND ce.event_type = 'league'
      AND cm.result IN ('win', 'loss')
    ORDER BY ce.created_at DESC
    LIMIT 3
  )
  SELECT COUNT(*) INTO v_consecutive_wins
  FROM recent_matches
  WHERE result = 'win';
  
  -- Trigger sponsor offer if 3 consecutive wins
  IF v_consecutive_wins >= 3 THEN
    -- Get 2 random sponsors
    SELECT * INTO v_sponsor1 FROM career_sponsor_catalog 
    WHERE tier_min <= v_career.tier 
    ORDER BY random() LIMIT 1;
    
    SELECT * INTO v_sponsor2 FROM career_sponsor_catalog 
    WHERE tier_min <= v_career.tier AND id != v_sponsor1.id
    ORDER BY random() LIMIT 1;
    
    RETURN json_build_object(
      'sponsor_offer', true,
      'trigger_type', 'win_streak',
      'sponsors', json_build_array(
        json_build_object(
          'id', v_sponsor1.id,
          'name', v_sponsor1.name,
          'rep_bonus_pct', v_sponsor1.rep_bonus_pct,
          'flavour_text', v_sponsor1.flavour_text
        ),
        json_build_object(
          'id', v_sponsor2.id,
          'name', v_sponsor2.name,
          'rep_bonus_pct', v_sponsor2.rep_bonus_pct,
          'flavour_text', v_sponsor2.flavour_text
        )
      )
    );
  END IF;
  
  RETURN json_build_object('sponsor_offer', false);
END;
$$;

-- 5. FIFA FUNCTION: Accept sponsor offer
CREATE OR REPLACE FUNCTION rpc_fifa_accept_sponsor(p_career_id UUID, p_sponsor_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_sponsor career_sponsor_catalog;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  SELECT * INTO v_sponsor FROM career_sponsor_catalog WHERE id = p_sponsor_id;
  
  IF v_sponsor.id IS NULL THEN
    RETURN json_build_object('error', 'Sponsor not found');
  END IF;
  
  -- Sign sponsor contract
  UPDATE career_profiles SET 
    current_sponsor_id = p_sponsor_id,
    sponsor_contract_started_season = season
  WHERE id = p_career_id;
  
  -- Create sponsor contract record  
  INSERT INTO career_sponsor_contracts (
    career_id, sponsor_id, slot, accepted_at_week, accepted_at_season
  ) VALUES (
    p_career_id, p_sponsor_id, 1, v_career.week, v_career.season
  );
  
  -- Send confirmation email
  INSERT INTO career_emails (career_id, season, email_type, subject, body) VALUES (
    p_career_id, v_career.season, 'sponsor_offer',
    'Sponsorship Deal Signed!',
    'Congratulations! You''ve signed with ' || v_sponsor.name || '. +' || (v_sponsor.rep_bonus_pct * 100)::integer || '% REP bonus per match.'
  );
  
  RETURN json_build_object(
    'success', true,
    'sponsor_name', v_sponsor.name,
    'rep_bonus_pct', v_sponsor.rep_bonus_pct
  );
END;
$$;

-- 6. FIFA FUNCTION: Process season end with promotion/relegation
CREATE OR REPLACE FUNCTION rpc_fifa_process_season_end(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_final_position INTEGER;
  v_promoted BOOLEAN := false;
  v_relegated BOOLEAN := false;
  v_total_matches INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Get expected matches for tier (7 for Tier 2, 11 for Tier 3)
  v_total_matches := CASE WHEN v_career.tier = 2 THEN 7 ELSE 11 END;
  
  -- Calculate final position in league
  WITH final_table AS (
    SELECT 
      ls.*,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, wins DESC) as position
    FROM career_league_standings ls
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
  )
  SELECT position INTO v_final_position
  FROM final_table
  WHERE is_player = TRUE;
  
  -- TIER 2 PROMOTION LOGIC
  IF v_career.tier = 2 THEN
    IF v_final_position <= 2 THEN
      -- Promoted to Tier 3
      v_promoted := true;
      UPDATE career_profiles SET 
        tier = 3, 
        season = season + 1,
        consecutive_seasons_in_tier2 = 0
      WHERE id = p_career_id;
      
      -- Send promotion email
      INSERT INTO career_emails (career_id, season, email_type, subject, body) VALUES (
        p_career_id, v_career.season + 1, 'promotion',
        'Welcome to the County Circuit!',
        'You''ve earned your place in the County Circuit. This is a step up — tougher opponents, higher stakes. Sponsors will start to look at you!'
      );
      
      -- Initialize Tier 3 league
      PERFORM rpc_fifa_initialize_county_league(p_career_id, v_career.season + 1);
    ELSE
      -- Stay in Tier 2
      UPDATE career_profiles SET 
        season = season + 1,
        consecutive_seasons_in_tier2 = COALESCE(consecutive_seasons_in_tier2, 0) + 1
      WHERE id = p_career_id;
      
      -- Initialize new Tier 2 season
      PERFORM rpc_fifa_initialize_pub_league(p_career_id, v_career.season + 1);
    END IF;
  END IF;
  
  -- TIER 3 RELEGATION LOGIC
  IF v_career.tier = 3 AND v_final_position >= 11 THEN -- Bottom 2 in 12-player league
    v_relegated := true;
    UPDATE career_profiles SET 
      tier = 2, 
      season = season + 1,
      current_sponsor_id = NULL, -- Remove sponsor
      sponsor_contract_started_season = NULL,
      consecutive_seasons_in_tier2 = 1 -- Start counting again
    WHERE id = p_career_id;
    
    -- Send relegation email
    INSERT INTO career_emails (career_id, season, email_type, subject, body) VALUES (
      p_career_id, v_career.season + 1, 'relegation',
      'Relegation Notice',
      'That season didn''t go the way we hoped. You''ve been relegated back to the Pub League. Reset, rebuild, go again.'
    );
    
    -- Initialize new Tier 2 season
    PERFORM rpc_fifa_initialize_pub_league(p_career_id, v_career.season + 1);
  ELSIF v_career.tier = 3 THEN
    -- Stay in Tier 3
    UPDATE career_profiles SET season = season + 1 WHERE id = p_career_id;
    PERFORM rpc_fifa_initialize_county_league(p_career_id, v_career.season + 1);
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'final_position', v_final_position,
    'promoted', v_promoted,
    'relegated', v_relegated,
    'new_tier', (SELECT tier FROM career_profiles WHERE id = p_career_id),
    'new_season', (SELECT season FROM career_profiles WHERE id = p_career_id)
  );
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '⚽ FIFA-Style Career Functions completed!';
  RAISE NOTICE '✅ Created Pub League (8 players) initialization';
  RAISE NOTICE '✅ Created County League (12 players) initialization';  
  RAISE NOTICE '✅ Created mid-season tournament trigger';
  RAISE NOTICE '✅ Created sponsor offer system';
  RAISE NOTICE '✅ Created season end processing with promotion/relegation';
  RAISE NOTICE 'FIFA career system is now fully functional! 🏆';
END $$;