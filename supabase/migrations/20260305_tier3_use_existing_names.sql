-- ============================================================
-- Career Tier 3 - Use Existing Name Generation System
-- Updates Tier 3 to use your existing rpc_generate_career_opponents function
-- ============================================================

-- RPC: Generate tier 3 league using existing name system
CREATE OR REPLACE FUNCTION rpc_career_generate_tier3_league(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing tier 3 opponents
  SELECT COUNT(*) INTO v_existing_opponents
  FROM career_opponents
  WHERE career_id = p_career_id AND tier = 3;
  
  -- Generate additional opponents to reach 9 total (10 including player)
  v_opponents_needed := 9 - v_existing_opponents;
  
  -- Use your existing name generation function instead of hardcoded lists
  IF v_opponents_needed > 0 THEN
    PERFORM rpc_generate_career_opponents(
      p_career_id,
      3::SMALLINT,  -- tier 3
      v_opponents_needed,
      v_career.career_seed + (v_career.season * 1000) + (v_career.tier * 100)
    );
  END IF;
  
  -- Initialize league table for the new season
  -- Player row
  INSERT INTO career_league_standings (
    career_id,
    season,
    tier,
    is_player,
    played,
    won,
    lost,
    legs_for,
    legs_against,
    points,
    average
  ) VALUES (
    p_career_id,
    v_career.season,
    3,
    TRUE,
    0, 0, 0, 0, 0, 0, 0.0
  ) ON CONFLICT DO NOTHING;
  
  -- Opponent rows
  INSERT INTO career_league_standings (
    career_id,
    season,
    tier,
    opponent_id,
    is_player,
    played,
    won,
    lost,
    legs_for,
    legs_against,
    points,
    average
  )
  SELECT 
    p_career_id,
    v_career.season,
    3,
    id,
    FALSE,
    0, 0, 0, 0, 0, 0, skill_rating
  FROM career_opponents
  WHERE career_id = p_career_id 
    AND tier = 3
  ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'total_opponents', v_existing_opponents + v_opponents_needed,
    'new_opponents_created', v_opponents_needed,
    'league_size', 10,
    'message', 'Tier 3 league generated with existing naming system'
  );
END;
$$;

-- RPC: Tier 2 opponent generation for relegation (also use existing system)
CREATE OR REPLACE FUNCTION rpc_career_generate_tier2_opponents(
  p_career_id UUID,
  p_count INTEGER DEFAULT 4
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Use your existing name generation function
  PERFORM rpc_generate_career_opponents(
    p_career_id,
    2::SMALLINT,  -- tier 2
    p_count,
    v_career.career_seed + (v_career.season * 1000) + (v_career.tier * 100) + 999
  );
  
  RETURN json_build_object(
    'success', true,
    'opponents_created', p_count,
    'message', 'Tier 2 opponents generated using existing naming system'
  );
END;
$$;

-- RPC: Handle tier 2 season completion and potential relegation (updated)
CREATE OR REPLACE FUNCTION rpc_career_tier2_season_complete(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_player_position INTEGER;
  v_promoted BOOLEAN := FALSE;
  v_relegation_event_id UUID;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Check player's final position in tier 2
  SELECT 
    ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) as position
  INTO v_player_position
  FROM career_league_standings 
  WHERE career_id = p_career_id 
    AND season = v_career.season 
    AND tier = 2 
    AND is_player = TRUE;
  
  -- Check if promoted (top 2)
  IF v_player_position <= 2 THEN
    v_promoted := TRUE;
    
    -- Promote to tier 3
    UPDATE career_profiles SET 
      tier = 3,
      season = season + 1,
      week = 0,
      day = 1
    WHERE id = p_career_id;
    
    -- Generate tier 3 opponents using existing system
    PERFORM rpc_career_generate_tier3_league(p_career_id);
    
    -- Add promotion milestone
    INSERT INTO career_milestones (
      career_id,
      milestone_type,
      title,
      description,
      tier,
      season,
      week,
      day
    ) VALUES (
      p_career_id,
      'promotion',
      'Promoted to County Circuit!',
      'Finished ' || 
      CASE v_player_position 
        WHEN 1 THEN '1st' 
        WHEN 2 THEN '2nd' 
      END || ' in the Pub Leagues',
      3,
      v_career.season + 1,
      0,
      1
    );
    
    RETURN json_build_object(
      'promoted', true,
      'new_tier', 3,
      'position', v_player_position,
      'message', 'Congratulations! You have been promoted to the County Circuit!'
    );
  ELSE
    -- Not promoted - create relegation tournament
    INSERT INTO career_events (
      career_id,
      season,
      sequence_no,
      event_type,
      event_name,
      format_legs,
      bracket_size,
      day,
      status
    ) VALUES (
      p_career_id,
      v_career.season,
      (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM career_schedule_templates WHERE tier = 2),
      'relegation_tournament',
      'Pub League Playoff',
      3,
      8,
      COALESCE(v_career.day, 1) + 1,
      'pending'
    ) RETURNING id INTO v_relegation_event_id;
    
    RETURN json_build_object(
      'promoted', false,
      'position', v_player_position,
      'relegation_tournament_id', v_relegation_event_id,
      'message', 'Season complete. One final tournament to prove yourself before starting fresh!'
    );
  END IF;
END;
$$;

-- RPC: Handle relegation tournament completion and start new tier 2 season
CREATE OR REPLACE FUNCTION rpc_career_tier2_relegation_complete(
  p_career_id UUID,
  p_tournament_won BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_new_season SMALLINT;
  v_opponents_to_replace UUID[];
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Start new tier 2 season
  v_new_season := v_career.season + 1;
  
  UPDATE career_profiles SET 
    season = v_new_season,
    week = 0,
    day = 1
  WHERE id = p_career_id;
  
  -- Get opponents that finished 1st, 2nd, 7th, 8th in previous season to replace
  SELECT ARRAY_AGG(opponent_id) INTO v_opponents_to_replace
  FROM (
    SELECT 
      opponent_id,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC) as position
    FROM career_league_standings 
    WHERE career_id = p_career_id 
      AND season = v_career.season 
      AND tier = 2 
      AND is_player = FALSE
  ) ranked
  WHERE position IN (1, 2, 7, 8);
  
  -- Mark old opponents as replaced (keep for history)
  UPDATE career_opponents 
  SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{replaced_in_season}', to_jsonb(v_new_season))
  WHERE id = ANY(v_opponents_to_replace);
  
  -- Generate new opponents using existing naming system (4 new ones to replace 1st, 2nd, 7th, 8th)
  PERFORM rpc_career_generate_tier2_opponents(p_career_id, 4);
  
  -- Add milestone for season restart
  INSERT INTO career_milestones (
    career_id,
    milestone_type,
    title,
    description,
    tier,
    season,
    week,
    day
  ) VALUES (
    p_career_id,
    'season_restart',
    CASE 
      WHEN p_tournament_won THEN 'Tournament Winner - New Season!'
      ELSE 'Fresh Start - New Season!'
    END,
    'Starting a new Pub League season with refreshed competition',
    2,
    v_new_season,
    0,
    1
  );
  
  RETURN json_build_object(
    'success', true,
    'new_season', v_new_season,
    'opponents_refreshed', COALESCE(array_length(v_opponents_to_replace, 1), 0),
    'tournament_won', p_tournament_won,
    'message', 'New season started! Fresh faces and another chance at promotion.'
  );
END;
$$;