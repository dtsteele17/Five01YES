-- ============================================================
-- CAREER FLOW V2 — Full implementation
-- 1. Relegation (bottom 2 in County+)
-- 2. County end-of-season group stage + 32-player knockout
-- 3. Alternative promotion via tournament win (County only)
-- 4. Bottom 2 excluded from end-of-season tournament
-- 5. Training game on starter failure
-- ============================================================

-- ============================================
-- 1. RELEGATION SYSTEM
-- ============================================

-- Update advance_to_next_season with relegation for bottom 2 in Tier 3+
DROP FUNCTION IF EXISTS rpc_career_advance_to_next_season(UUID);
CREATE OR REPLACE FUNCTION rpc_career_advance_to_next_season(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_total_players SMALLINT;
  v_new_season SMALLINT;
  v_new_tier SMALLINT;
  v_new_day SMALLINT;
  v_ranked_opponents UUID[];
  v_keep_opponents UUID[];
  v_top2_opponents UUID[];
  v_is_promotion BOOLEAN := FALSE;
  v_is_relegation BOOLEAN := FALSE;
  v_is_tournament_promotion BOOLEAN := FALSE;
  v_tier_name TEXT;
  v_old_tier_name TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Tier names
  v_old_tier_name := CASE v_career.tier
    WHEN 1 THEN 'Local Circuit' WHEN 2 THEN 'Pub Leagues' WHEN 3 THEN 'County Circuit'
    WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_career.tier
  END;

  -- Count total players in league
  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  -- Calculate player rank
  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- Check for alternative tournament promotion (County only: won end-of-season 32-player knockout)
  IF v_career.tier = 3 AND v_player_rank > 2 THEN
    IF EXISTS (
      SELECT 1 FROM career_milestones
      WHERE career_id = p_career_id AND season = v_career.season 
        AND milestone_type = 'tournament_win'
        AND title LIKE '%Championship%'
    ) THEN
      v_is_tournament_promotion := TRUE;
    END IF;
  END IF;

  -- ========== MILESTONES ==========
  IF v_player_rank = 1 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'league_champion', v_old_tier_name || ' Champion',
      'Won the ' || v_old_tier_name || ' Season ' || v_career.season || ' with a 1st place finish!',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  ELSIF v_player_rank = 2 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'league_runner_up', v_old_tier_name || ' Runner-Up',
      'Finished 2nd in ' || v_old_tier_name || ' Season ' || v_career.season || '.',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END IF;

  v_new_season := v_career.season + 1;
  v_new_day := v_career.day + 5;

  -- Rank opponents
  SELECT ARRAY_AGG(opponent_id ORDER BY points DESC, (legs_for - legs_against) DESC)
  INTO v_ranked_opponents
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

  -- ===========================
  -- PROMOTED (top 2 or tournament win)
  -- ===========================
  IF v_player_rank <= 2 OR v_is_tournament_promotion THEN
    v_is_promotion := TRUE;
    v_new_tier := LEAST(v_career.tier + 1, 5);

    v_tier_name := CASE v_new_tier
      WHEN 3 THEN 'County Circuit' WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_new_tier
    END;

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'promotion', 'Promoted to ' || v_tier_name,
      CASE WHEN v_is_tournament_promotion 
        THEN 'Won the County Championship to earn promotion to ' || v_tier_name || '!'
        ELSE 'Earned promotion from ' || v_old_tier_name || ' to ' || v_tier_name || '!'
      END,
      v_new_tier, v_new_season, 1, v_new_day);

    -- Welcome email
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'email', 'Welcome to the ' || v_tier_name || '!',
      'You''ve earned your place. The ' || v_tier_name || ' is a step up — tougher opponents, higher stakes. Time to prove you belong.',
      v_new_tier, v_new_season, 1, v_new_day);

    UPDATE career_profiles SET
      tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day, updated_at = now()
    WHERE id = p_career_id;

    -- Generate opponents for new tier
    IF v_new_tier = 3 THEN
      PERFORM rpc_career_generate_tier3_league(p_career_id);
    ELSE
      PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT,
        CASE v_new_tier WHEN 4 THEN 11 WHEN 5 THEN 13 ELSE 9 END,
        v_career.career_seed + v_new_season * 100);
    END IF;

    -- Create new season events
    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    RETURN json_build_object(
      'success', true, 'promoted', true, 'relegated', false,
      'tournament_promotion', v_is_tournament_promotion,
      'new_tier', v_new_tier, 'new_season', v_new_season,
      'player_rank', v_player_rank, 'tier_name', v_tier_name
    );

  -- ===========================
  -- RELEGATED (bottom 2 in Tier 3+)
  -- ===========================
  ELSIF v_career.tier >= 3 AND v_player_rank > (v_total_players - 2) THEN
    v_is_relegation := TRUE;
    v_new_tier := v_career.tier - 1;

    v_tier_name := CASE v_new_tier
      WHEN 2 THEN 'Pub Leagues' WHEN 3 THEN 'County Circuit' WHEN 4 THEN 'Regional Tour' ELSE 'Tier ' || v_new_tier
    END;

    -- Relegation milestone
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'relegation', 'Relegated to ' || v_tier_name,
      'Dropped from ' || v_old_tier_name || ' to ' || v_tier_name || '. Time to rebuild.',
      v_new_tier, v_new_season, 1, v_new_day);

    -- Lose REP (10% penalty, minimum 0)
    UPDATE career_profiles SET
      tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day,
      rep = GREATEST(0, rep - GREATEST(5, (rep * 0.1)::integer)),
      updated_at = now()
    WHERE id = p_career_id;

    -- Remove active sponsors
    UPDATE career_sponsor_contracts SET status = 'terminated'
    WHERE career_id = p_career_id AND status = 'active';

    -- Generate opponents for lower tier
    IF v_new_tier = 2 THEN
      PERFORM rpc_generate_career_opponents(p_career_id, 2::SMALLINT, 7,
        v_career.career_seed + v_new_season * 100);
    ELSE
      PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT,
        CASE v_new_tier WHEN 3 THEN 9 WHEN 4 THEN 11 ELSE 7 END,
        v_career.career_seed + v_new_season * 100);
    END IF;

    -- Player + opponent standings for new season
    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, v_new_season, v_new_tier, TRUE);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_new_tier
    ORDER BY created_at DESC
    LIMIT CASE v_new_tier WHEN 2 THEN 7 WHEN 3 THEN 9 WHEN 4 THEN 11 ELSE 7 END;

    -- Create new season events
    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    RETURN json_build_object(
      'success', true, 'promoted', false, 'relegated', true,
      'new_tier', v_new_tier, 'new_season', v_new_season,
      'player_rank', v_player_rank, 'tier_name', v_tier_name,
      'rep_lost', GREATEST(5, (v_career.rep * 0.1)::integer)
    );

  -- ===========================
  -- STAY IN SAME TIER
  -- ===========================
  ELSE
    v_new_tier := v_career.tier;
    v_top2_opponents := v_ranked_opponents[1:2];
    v_keep_opponents := v_ranked_opponents[3:array_length(v_ranked_opponents, 1)];

    UPDATE career_profiles SET 
      season = v_new_season, week = 1, day = v_new_day, updated_at = now()
    WHERE id = p_career_id;

    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, v_new_season, v_new_tier, TRUE);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, unnest(v_keep_opponents), FALSE;

    PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT, 2, v_career.career_seed + v_new_season * 100);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_new_tier
      AND id NOT IN (SELECT unnest(v_keep_opponents))
      AND id NOT IN (SELECT unnest(v_top2_opponents))
      AND id NOT IN (SELECT unnest(v_ranked_opponents))
    ORDER BY created_at DESC
    LIMIT 2;

    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    RETURN json_build_object(
      'success', true, 'promoted', false, 'relegated', false,
      'new_tier', v_new_tier, 'new_season', v_new_season,
      'player_rank', v_player_rank, 'tier_name', v_old_tier_name
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_advance_to_next_season(UUID) TO authenticated;

-- ============================================
-- 2. BOTTOM 2 CHECK FOR END-OF-SEASON TOURNAMENT
-- ============================================

-- Update rpc_create_end_season_tournaments to exclude bottom 2
DROP FUNCTION IF EXISTS rpc_create_end_season_tournaments(UUID);
CREATE OR REPLACE FUNCTION rpc_create_end_season_tournaments(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_total_players SMALLINT;
  v_name1 TEXT;
  v_name2 TEXT;
  v_size1 INTEGER;
  v_size2 INTEGER;
  v_id1 UUID;
  v_id2 UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  
  -- Check if already offered
  IF EXISTS (
    SELECT 1 FROM career_events 
    WHERE career_id = p_career_id AND season = v_career.season 
      AND event_type = 'open' AND sequence_no >= 200
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  -- Count total players and player rank
  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- Bottom 2 in County+ = no tournament
  IF v_career.tier >= 3 AND v_player_rank > (v_total_players - 2) THEN
    RETURN json_build_object('excluded', true, 'reason', 'Bottom 2 in league — no end-of-season tournament');
  END IF;
  
  v_name1 := _random_pub_tournament_name();
  v_name2 := _random_pub_tournament_name();
  WHILE v_name2 = v_name1 LOOP
    v_name2 := _random_pub_tournament_name();
  END LOOP;
  
  IF v_career.tier >= 3 THEN
    v_size1 := CASE WHEN random() < 0.5 THEN 16 ELSE 32 END;
    v_size2 := CASE WHEN random() < 0.5 THEN 32 ELSE 16 END;
  ELSE
    v_size1 := (ARRAY[8, 16, 32])[1 + floor(random() * 3)::int];
    v_size2 := (ARRAY[8, 16, 32])[1 + floor(random() * 3)::int];
  END IF;
  
  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, 200, 'open', v_name1,
    CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size1, 'pending_invite', v_career.day + 3)
  RETURNING id INTO v_id1;
  
  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, 201, 'open', v_name2,
    CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size2, 'pending_invite', v_career.day + 5)
  RETURNING id INTO v_id2;
  
  RETURN json_build_object('success', true, 'id1', v_id1, 'id2', v_id2);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_end_season_tournaments(UUID) TO authenticated;
