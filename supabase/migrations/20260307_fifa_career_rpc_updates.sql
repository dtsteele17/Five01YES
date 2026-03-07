-- ============================================================
-- FIFA-STYLE CAREER MODE - RPC Function Updates
-- Update existing career functions to support FIFA-style flow
-- ============================================================

-- Update the existing career tournament choice function to support FIFA-style tournaments
CREATE OR REPLACE FUNCTION rpc_career_tournament_choice(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_choice INTEGER  -- 0 = first tournament, 1 = second tournament, -1 = decline
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_tournament_name TEXT;
  v_tournaments JSONB;
BEGIN
  -- Get career and event
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid();
  SELECT * INTO v_event FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id;
  
  IF v_career.id IS NULL OR v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Career or event not found');
  END IF;

  -- Get tournament options from metadata
  v_tournaments := v_event.metadata->'tournaments';
  
  -- Complete the tournament choice event
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now(),
    result = json_build_object('choice', p_tournament_choice)
  WHERE id = p_event_id;

  IF p_tournament_choice >= 0 THEN
    -- Player chose a tournament - create tournament event
    SELECT (v_tournaments->p_tournament_choice->>'name') INTO v_tournament_name;
    
    IF v_tournament_name IS NULL THEN
      v_tournament_name := CASE 
        WHEN p_tournament_choice = 0 THEN 'County Championship'
        ELSE 'Regional Masters'
      END;
    END IF;

    INSERT INTO career_events (
      career_id, season, sequence_no, event_type, event_name,
      format_legs, bracket_size, status, day
    ) VALUES (
      p_career_id, v_career.season, (200 + p_tournament_choice), 'open', v_tournament_name,
      CASE WHEN v_career.tier = 3 THEN 5 ELSE 3 END, 16, 'pending',
      v_career.day + 1
    );

    RETURN json_build_object(
      'success', true,
      'tournament_name', v_tournament_name,
      'action', 'tournament'
    );
  ELSE
    -- Player declined - continue with league
    RETURN json_build_object(
      'success', true,
      'declined', true,
      'action', 'continue_league'
    );
  END IF;
END;
$$;

-- Update the existing career completion function to handle FIFA-style completion
CREATE OR REPLACE FUNCTION rpc_complete_career_match_fifa_style(
  p_match_id UUID,
  p_player_legs_won INTEGER,
  p_opponent_legs_won INTEGER,
  p_player_stats JSON DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use the new FIFA-style completion function
  RETURN rpc_fifa_complete_career_match(
    p_match_id, 
    p_player_legs_won, 
    p_opponent_legs_won, 
    p_player_stats
  );
END;
$$;

-- Update the existing career home function to include FIFA-style data
CREATE OR REPLACE FUNCTION rpc_get_career_home_fifa_enhanced(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_career career_profiles;
  v_standings JSON[];
  v_emails JSON[];
  v_sponsor JSON;
BEGIN
  -- Get the base career home data using existing function
  SELECT rpc_get_career_home_with_season_end_locked_fixed_v3(p_career_id) INTO v_result;
  
  -- If that fails, return error
  IF v_result IS NULL OR v_result ? 'error' THEN
    RETURN v_result;
  END IF;
  
  -- Get career details
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid();
  
  -- Add FIFA-style league standings for Tier 2+
  IF v_career.tier >= 2 THEN
    SELECT ARRAY(
      SELECT json_build_object(
        'name', CASE WHEN ls.is_player THEN 'You' ELSE co.first_name || ' ' || co.last_name END,
        'is_player', ls.is_player,
        'played', ls.played,
        'wins', ls.wins,
        'losses', ls.losses,
        'points', ls.points,
        'legs_for', ls.legs_for,
        'legs_against', ls.legs_against,
        'legs_diff', (ls.legs_for - ls.legs_against)
      ) ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
    ) INTO v_standings
    FROM career_league_standings ls
    LEFT JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier;
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
    ) ORDER BY ce.sent_at DESC
  ) INTO v_emails
  FROM career_emails ce
  WHERE ce.career_id = p_career_id
    AND ce.season = v_career.season
  LIMIT 5;
  
  -- Add current sponsor info
  IF v_career.current_sponsor_id IS NOT NULL THEN
    SELECT json_build_object(
      'id', sc.id,
      'name', sc.name,
      'rep_bonus_pct', sc.rep_bonus_pct,
      'flavour_text', sc.flavour_text,
      'tier_min', sc.tier_min
    ) INTO v_sponsor
    FROM career_sponsor_catalog sc
    WHERE sc.id = v_career.current_sponsor_id;
  END IF;
  
  -- Enhance the result with FIFA-style data
  RETURN json_build_object(
    'career', v_result->'career',
    'next_event', v_result->'next_event',
    'recent_milestones', v_result->'recent_milestones',
    'awards', v_result->'awards',
    'season_end', v_result->'season_end',
    'fifa_standings', COALESCE(v_standings, '[]'::JSON[]),
    'fifa_emails', COALESCE(v_emails, '[]'::JSON[]),
    'fifa_sponsor', v_sponsor,
    'fifa_enabled', true
  );
END;
$$;

-- Create a function specifically for checking sponsor offers
CREATE OR REPLACE FUNCTION rpc_career_check_sponsor_offer(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use the FIFA-style sponsor check function
  RETURN rpc_fifa_check_sponsor_offers(p_career_id);
END;
$$;

-- Create function to handle match completion from the game engine
CREATE OR REPLACE FUNCTION rpc_career_match_complete(
  p_room_id TEXT,
  p_player_legs_won INTEGER,
  p_opponent_legs_won INTEGER,
  p_player_stats JSON DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match career_matches;
BEGIN
  -- Find the match by room ID
  SELECT * INTO v_match
  FROM career_matches
  WHERE match_room_id = p_room_id
    AND career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid());
  
  IF v_match.id IS NULL THEN
    RETURN json_build_object('error', 'Match not found');
  END IF;
  
  -- Use FIFA-style completion
  RETURN rpc_fifa_complete_career_match(
    v_match.id,
    p_player_legs_won,
    p_opponent_legs_won,
    p_player_stats
  );
END;
$$;

-- Create a wrapper for the weekend event function that supports FIFA style
CREATE OR REPLACE FUNCTION rpc_play_weekend_event_fifa(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Try FIFA-style first
  SELECT rpc_career_continue_fifa_style(p_career_id) INTO v_result;
  
  -- If no error, return FIFA result
  IF v_result IS NOT NULL AND NOT (v_result ? 'error') THEN
    RETURN v_result;
  END IF;
  
  -- Fallback to original function
  RETURN rpc_play_weekend_event(p_career_id);
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🔧 FIFA-Style Career RPC Updates completed!';
  RAISE NOTICE '✅ Tournament choice processing updated';
  RAISE NOTICE '✅ Career home function enhanced with FIFA data';
  RAISE NOTICE '✅ Match completion wrappers created';
  RAISE NOTICE '✅ Sponsor offer checking integrated';
  RAISE NOTICE 'FIFA-style career system is now fully integrated! 🎯';
END $$;