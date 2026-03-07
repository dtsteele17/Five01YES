-- ============================================================
-- FIFA-STYLE CAREER SYSTEM - MISSING TOURNAMENT FUNCTIONS
-- Create the functions referenced by the frontend tournament page
-- ============================================================

-- Function to enter mid-season tournament
CREATE OR REPLACE FUNCTION rpc_fifa_enter_mid_season_tournament(
  p_career_id UUID,
  p_tournament_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Record tournament entry in career_tournaments table
  INSERT INTO career_tournaments (
    career_id, season, tier, tournament_type, tournament_name, 
    triggered_after_match, user_entered, bracket_size
  ) VALUES (
    p_career_id, v_career.season, v_career.tier, 'mid_season', 
    p_tournament_name, 4, TRUE, 16
  );
  
  -- Create tournament event
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, v_career.season, 50, 'open', p_tournament_name,
    3, 16, 'pending', v_career.day + 1
  ) RETURNING id INTO v_event_id;
  
  RETURN json_build_object(
    'success', true,
    'event_id', v_event_id,
    'tournament_name', p_tournament_name
  );
END;
$$;

-- Function to check if County League tournament choice should be offered (every 3 matches)
CREATE OR REPLACE FUNCTION rpc_fifa_check_county_tournament_choice(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed_matches INTEGER;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Only for Tier 3 (County League)
  IF v_career.tier != 3 THEN
    RETURN json_build_object('tournament_choice', false);
  END IF;
  
  -- Count completed league matches this season
  SELECT COUNT(*) INTO v_completed_matches
  FROM career_events ce
  JOIN career_matches cm ON cm.event_id = ce.id
  WHERE ce.career_id = p_career_id 
    AND ce.season = v_career.season
    AND ce.event_type = 'league'
    AND cm.result IN ('win', 'loss');
  
  -- Offer choice every 3 matches (3rd, 6th, 9th match)
  IF v_completed_matches > 0 AND v_completed_matches % 3 = 0 AND v_completed_matches < 11 THEN
    RETURN json_build_object(
      'tournament_choice', true,
      'can_decline', true,
      'tournament_options', json_build_array(
        json_build_object(
          'name', 'County Open', 
          'description', 'Traditional county-level competition'
        ),
        json_build_object(
          'name', 'Masters Cup', 
          'description', 'Elite invitational tournament'
        )
      )
    );
  END IF;
  
  RETURN json_build_object('tournament_choice', false);
END;
$$;

-- Function to decline tournament (for County League)
CREATE OR REPLACE FUNCTION rpc_fifa_decline_tournament(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Just log the decline - no special action needed
  -- League continues normally
  
  RETURN json_build_object(
    'success', true,
    'message', 'Tournament declined - league continues'
  );
END;
$$;

-- Enhanced career home function that includes FIFA features
CREATE OR REPLACE FUNCTION rpc_get_career_home_fifa_enhanced(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_career career_profiles;
  v_league_standings JSON[];
  v_emails JSON[];
  v_sponsor JSON;
  v_tournament_check JSON;
  v_county_tournament_check JSON;
  v_sponsor_check JSON;
BEGIN
  -- Get the base career home data
  SELECT rpc_get_career_home(p_career_id) INTO v_result;
  
  IF v_result ? 'error' THEN
    RETURN v_result;
  END IF;
  
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Add FIFA-style league standings for Tier 2+
  IF v_career.tier >= 2 THEN
    SELECT ARRAY(
      SELECT json_build_object(
        'name', CASE WHEN ls.is_player THEN 'You' 
                     ELSE co.first_name || ' ' || co.last_name END,
        'is_player', ls.is_player,
        'played', ls.played,
        'wins', ls.wins,
        'losses', ls.losses,
        'points', ls.points,
        'legs_for', ls.legs_for,
        'legs_against', ls.legs_against,
        'legs_diff', (ls.legs_for - ls.legs_against),
        'position', ROW_NUMBER() OVER (ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC)
      )
    ) INTO v_league_standings
    FROM career_league_standings ls
    LEFT JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
    ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC;
  END IF;
  
  -- Add recent emails
  SELECT ARRAY(
    SELECT json_build_object(
      'id', ce.id,
      'subject', ce.subject,
      'body', ce.body,
      'type', ce.email_type,
      'sent_at', ce.sent_at,
      'is_read', ce.is_read
    )
  ) INTO v_emails
  FROM career_emails ce
  WHERE ce.career_id = p_career_id
    AND ce.season = v_career.season
  ORDER BY ce.sent_at DESC
  LIMIT 5;
  
  -- Add current sponsor info
  IF v_career.current_sponsor_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', sc.id,
      'name', sc.name,
      'rep_bonus_pct', sc.rep_bonus_pct,
      'flavour_text', sc.flavour_text
    ) INTO v_sponsor
    FROM career_sponsor_catalog sc
    WHERE sc.id = v_career.current_sponsor_id;
  END IF;
  
  -- Check FIFA triggers
  SELECT rpc_fifa_check_mid_season_tournament(p_career_id) INTO v_tournament_check;
  SELECT rpc_fifa_check_county_tournament_choice(p_career_id) INTO v_county_tournament_check;
  SELECT rpc_fifa_check_sponsor_offer(p_career_id) INTO v_sponsor_check;
  
  -- Enhance result with FIFA data
  RETURN json_build_object(
    'career', (v_result->'career') || json_build_object(
      'current_sponsor', v_sponsor,
      'consecutive_seasons_in_tier2', v_career.consecutive_seasons_in_tier2
    ),
    'next_event', v_result->'next_event',
    'recent_milestones', v_result->'recent_milestones',
    'awards', v_result->'awards',
    'season_end', v_result->'season_end',
    'fifa_features', json_build_object(
      'league_standings', COALESCE(v_league_standings, '[]'::JSON[]),
      'emails', COALESCE(v_emails, '[]'::JSON[]),
      'current_sponsor', v_sponsor,
      'pending_notifications', json_build_object(
        'mid_season_tournament', (v_tournament_check->>'trigger_tournament')::boolean,
        'county_tournament_choice', (v_county_tournament_check->>'tournament_choice')::boolean,
        'sponsor_offer', (v_sponsor_check->>'sponsor_offer')::boolean
      )
    )
  );
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🏆 FIFA Missing Tournament Functions completed!';
  RAISE NOTICE '✅ Created rpc_fifa_enter_mid_season_tournament';
  RAISE NOTICE '✅ Created rpc_fifa_check_county_tournament_choice';  
  RAISE NOTICE '✅ Created rpc_fifa_decline_tournament';
  RAISE NOTICE '✅ Enhanced career home with FIFA features';
  RAISE NOTICE 'Tournament system should now work end-to-end! 🎯';
END $$;