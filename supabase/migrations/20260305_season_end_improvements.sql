-- ============================================================
-- Season End Improvements: Manual Advancement + Performance Emails
-- Fixes automatic season advancement, adds season review
-- ============================================================

-- 1. ADD SEASON END EVENT TYPE
-- Update event type constraints to include season_end
DO $$
BEGIN
  ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
  ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_event_type_check 
    CHECK (event_type IN (
      'league','open','qualifier','promotion','training','rest',
      'trial_tournament','premier_league_night','major','season_finals',
      'tournament_choice','relegation_tournament','season_end'
    ));
    
  ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;
  ALTER TABLE career_events ADD CONSTRAINT career_events_event_type_check 
    CHECK (event_type IN (
      'league','open','qualifier','promotion','training','rest',
      'trial_tournament','premier_league_night','major','season_finals',
      'tournament_choice','relegation_tournament','season_end'
    ));
END $$;

-- 2. ADD SEASON END TEMPLATE FOR TIER 2
-- Add season end event after the last league match
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) 
VALUES (
  2, 
  (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM career_schedule_templates WHERE tier = 2),
  'season_end',
  'Season Complete',
  'pub_season_end',
  0,
  NULL,
  FALSE,
  '{
    "description": "Review your season performance and advance to the next season",
    "requires_manual_advance": true,
    "shows_final_table": true
  }'::jsonb
) ON CONFLICT DO NOTHING;

-- 3. RPC: Handle season completion with manual advancement
CREATE OR REPLACE FUNCTION rpc_career_complete_season(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_final_position INTEGER;
  v_promoted BOOLEAN := FALSE;
  v_final_table JSON;
  v_performance_email JSON;
  v_top_performers UUID[];
  v_bottom_performers UUID[];
  v_season_stats RECORD;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get final league table
  SELECT json_agg(row_to_json(st) ORDER BY st.position) INTO v_final_table
  FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC, ls.legs_for DESC) as position,
      ls.is_player,
      CASE WHEN ls.is_player THEN 'You' 
           ELSE (SELECT o.first_name || CASE WHEN o.nickname IS NOT NULL THEN ' ''' || o.nickname || '''' ELSE '' END || ' ' || o.last_name 
                FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
      ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
      (ls.legs_for - ls.legs_against) AS legs_diff,
      ls.points, ls.average,
      ls.opponent_id
    FROM career_league_standings ls
    WHERE ls.career_id = p_career_id 
      AND ls.season = v_career.season 
      AND ls.tier = v_career.tier
  ) st;
  
  -- Get player's final position and stats
  SELECT 
    ROW_NUMBER() OVER (ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC) as position,
    ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against, ls.points, ls.average
  INTO v_final_position, v_season_stats.played, v_season_stats.won, v_season_stats.lost, 
       v_season_stats.legs_for, v_season_stats.legs_against, v_season_stats.points, v_season_stats.average
  FROM career_league_standings ls
  WHERE ls.career_id = p_career_id 
    AND ls.season = v_career.season 
    AND ls.tier = v_career.tier
    AND ls.is_player = TRUE;
  
  -- Check promotion (top 2 in tier 2)
  IF v_career.tier = 2 AND v_final_position <= 2 THEN
    v_promoted := TRUE;
  END IF;
  
  -- Generate performance email
  v_performance_email := json_build_object(
    'id', gen_random_uuid()::text,
    'subject', CASE 
      WHEN v_promoted THEN '🎉 Season ' || v_career.season || ' Complete - PROMOTED!'
      WHEN v_final_position <= 3 THEN '👍 Season ' || v_career.season || ' Complete - Strong Finish!'
      WHEN v_final_position >= 6 THEN '⚠️ Season ' || v_career.season || ' Complete - Work To Do'
      ELSE '📊 Season ' || v_career.season || ' Complete - Mid-Table Finish'
    END,
    'body', 
      'Season ' || v_career.season || ' is complete! Here''s how you performed:' || E'\n\n' ||
      '🏆 Final Position: ' || v_final_position || 
      CASE v_career.tier 
        WHEN 2 THEN ' out of 8' 
        WHEN 3 THEN ' out of 10'
        ELSE ' out of ' || (v_season_stats.played + 1)::text
      END || E'\n' ||
      '📊 Record: ' || v_season_stats.won || ' wins, ' || v_season_stats.lost || ' losses' || E'\n' ||
      '🎯 Average: ' || ROUND(v_season_stats.average, 1) || E'\n' ||
      '⚽ Legs: ' || v_season_stats.legs_for || ' for, ' || v_season_stats.legs_against || ' against' || E'\n' ||
      '📈 Points: ' || v_season_stats.points || E'\n\n' ||
      CASE 
        WHEN v_promoted THEN 'Congratulations! You''ve been promoted to the next tier. Time to face tougher competition!'
        WHEN v_final_position = 1 THEN 'Season champion! Great performance throughout.'
        WHEN v_final_position <= 3 THEN 'Solid season - you''re building momentum!'
        WHEN v_final_position >= 6 THEN 'Room for improvement next season. Focus on consistency!'
        ELSE 'Decent season - aim higher next time!'
      END,
    'type', 'season_performance',
    'isNew', true
  );
  
  -- Get opponents to refresh for next season (positions 1, 2, 7, 8)
  SELECT 
    ARRAY_AGG(CASE WHEN position IN (1, 2) THEN opponent_id ELSE NULL END),
    ARRAY_AGG(CASE WHEN position IN (7, 8) THEN opponent_id ELSE NULL END)
  INTO v_top_performers, v_bottom_performers
  FROM (
    SELECT 
      opponent_id,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC) as position
    FROM career_league_standings 
    WHERE career_id = p_career_id 
      AND season = v_career.season 
      AND tier = v_career.tier
      AND is_player = FALSE
  ) ranked;
  
  -- Create season_end event if it doesn't exist
  INSERT INTO career_events (
    career_id,
    season,
    sequence_no,
    event_type,
    event_name,
    format_legs,
    bracket_size,
    status,
    result
  ) VALUES (
    p_career_id,
    v_career.season,
    (SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season),
    'season_end',
    'Season Complete',
    0,
    NULL,
    'active',
    json_build_object(
      'final_position', v_final_position,
      'promoted', v_promoted,
      'final_table', v_final_table,
      'performance_email', v_performance_email,
      'opponents_to_refresh', json_build_object(
        'top_performers', v_top_performers,
        'bottom_performers', v_bottom_performers
      )
    )
  ) ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'season_complete', true,
    'final_position', v_final_position,
    'promoted', v_promoted,
    'final_table', v_final_table,
    'performance_email', v_performance_email,
    'requires_manual_advance', true,
    'message', CASE 
      WHEN v_promoted THEN 'Season complete! You''ve been promoted - click "Advance Season" when ready.'
      ELSE 'Season complete! Review your performance and click "Advance Season" to continue.'
    END
  );
END;
$$;

-- 4. RPC: Manually advance to next season
CREATE OR REPLACE FUNCTION rpc_career_advance_season(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_season_end_event career_events;
  v_promoted BOOLEAN;
  v_opponents_to_refresh JSONB;
  v_new_season SMALLINT;
  v_new_tier SMALLINT;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get the season_end event
  SELECT * INTO v_season_end_event 
  FROM career_events 
  WHERE career_id = p_career_id 
    AND event_type = 'season_end' 
    AND status = 'active'
  ORDER BY sequence_no DESC 
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No active season end event found');
  END IF;
  
  -- Extract data from season end event
  v_promoted := (v_season_end_event.result->>'promoted')::boolean;
  v_opponents_to_refresh := v_season_end_event.result->'opponents_to_refresh';
  
  -- Calculate new season and tier
  v_new_season := v_career.season + 1;
  v_new_tier := CASE WHEN v_promoted THEN v_career.tier + 1 ELSE v_career.tier END;
  
  -- Mark season end event as completed
  UPDATE career_events 
  SET status = 'completed', completed_at = now()
  WHERE id = v_season_end_event.id;
  
  -- Update career profile
  UPDATE career_profiles 
  SET 
    season = v_new_season,
    tier = v_new_tier,
    week = 1,
    day = CASE WHEN v_new_tier = 1 THEN 1 ELSE NULL END
  WHERE id = p_career_id;
  
  -- If staying in same tier, refresh opponents (remove top 2 and bottom 2)
  IF NOT v_promoted AND v_career.tier = 2 THEN
    -- Mark old opponents as replaced
    UPDATE career_opponents 
    SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{replaced_in_season}', to_jsonb(v_new_season))
    WHERE id = ANY(
      SELECT jsonb_array_elements_text(v_opponents_to_refresh->'top_performers')::uuid
      UNION ALL
      SELECT jsonb_array_elements_text(v_opponents_to_refresh->'bottom_performers')::uuid
    );
    
    -- Generate 4 new opponents
    PERFORM rpc_generate_career_opponents(
      p_career_id, 
      v_career.tier::SMALLINT, 
      4, 
      v_career.career_seed + (v_new_season * 1000) + (v_career.tier * 100)
    );
  END IF;
  
  -- If promoted, generate new opponents for new tier
  IF v_promoted THEN
    PERFORM rpc_career_generate_tier3_league(p_career_id);
  END IF;
  
  -- Seed new season events
  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status)
  SELECT 
    p_career_id, 
    t.id, 
    v_new_season, 
    t.sequence_no, 
    t.event_type, 
    t.event_name, 
    t.format_legs, 
    t.bracket_size,
    'pending'
  FROM career_schedule_templates t 
  WHERE t.tier = v_new_tier 
    AND t.event_type != 'season_end'  -- Don't create season_end event yet
  ORDER BY t.sequence_no;
  
  -- Initialize league standings for new season
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = v_new_season AND tier = v_new_tier;
  
  -- Player row
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, won, lost, legs_for, legs_against, points, average
  ) VALUES (
    p_career_id, v_new_season, v_new_tier, TRUE, 0, 0, 0, 0, 0, 0, 0.0
  );
  
  -- Opponent rows
  INSERT INTO career_league_standings (
    career_id, season, tier, opponent_id, is_player, played, won, lost, legs_for, legs_against, points, average
  )
  SELECT 
    p_career_id, v_new_season, v_new_tier, id, FALSE, 0, 0, 0, 0, 0, 0, skill_rating
  FROM career_opponents
  WHERE career_id = p_career_id 
    AND tier = v_new_tier
    AND COALESCE(metadata->>'replaced_in_season', '0')::int != v_new_season;
  
  RETURN json_build_object(
    'success', true,
    'new_season', v_new_season,
    'new_tier', v_new_tier,
    'promoted', v_promoted,
    'message', CASE 
      WHEN v_promoted THEN 'Welcome to Tier ' || v_new_tier || '! New challenges await.'
      ELSE 'Season ' || v_new_season || ' begins! Fresh opponents and another shot at promotion.'
    END
  );
END;
$$;

-- 5. Update career home to handle season_end events
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_season_end(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_next_event career_events;
  v_season_end_data JSONB;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Check for active season_end event first
  SELECT * INTO v_next_event FROM career_events
    WHERE career_id = p_career_id AND event_type = 'season_end' AND status = 'active'
    ORDER BY sequence_no DESC
    LIMIT 1;
    
  IF v_next_event.id IS NOT NULL THEN
    -- Return season end data
    RETURN json_build_object(
      'career', json_build_object(
        'id', v_career.id,
        'tier', v_career.tier,
        'season', v_career.season,
        'week', v_career.week,
        'day', v_career.day,
        'rep', v_career.rep,
        'form', v_career.form,
        'difficulty', v_career.difficulty
      ),
      'season_end', json_build_object(
        'active', true,
        'final_position', v_next_event.result->'final_position',
        'promoted', v_next_event.result->'promoted',
        'final_table', v_next_event.result->'final_table',
        'performance_email', v_next_event.result->'performance_email'
      )
    );
  END IF;
  
  -- Otherwise return normal home data (call original function)
  RETURN rpc_get_career_home(p_career_id);
END;
$$;

-- 6. Update match completion to check for season end
CREATE OR REPLACE FUNCTION rpc_career_match_complete_with_season_check(
  p_career_id UUID,
  p_match_id UUID,
  p_player_legs INTEGER,
  p_opponent_legs INTEGER,
  p_player_average REAL DEFAULT NULL,
  p_player_180s INTEGER DEFAULT 0,
  p_player_highest_checkout INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_match career_matches;
  v_event career_events;
  v_result TEXT;
  v_is_last_league_match BOOLEAN := FALSE;
  v_total_league_matches INTEGER;
  v_completed_league_matches INTEGER;
BEGIN
  -- Verify ownership and get career
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get match and event
  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id AND career_id = p_career_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Match not found');
  END IF;
  
  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;
  
  -- Determine result
  v_result := CASE WHEN p_player_legs > p_opponent_legs THEN 'win' ELSE 'loss' END;
  
  -- Update match record
  UPDATE career_matches SET
    result = v_result,
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    player_average = p_player_average,
    player_180s = p_player_180s,
    player_highest_checkout = p_player_highest_checkout,
    played_at = now()
  WHERE id = p_match_id;
  
  -- Track achievements for this match (if achievements system exists)
  BEGIN
    PERFORM rpc_track_match_achievements(json_build_object(
      'won', v_result = 'win',
      'average', COALESCE(p_player_average, 0),
      'one_eighties', COALESCE(p_player_180s, 0),
      'hundreds', 0, -- TODO: track hundreds separately
      'highest_checkout', COALESCE(p_player_highest_checkout, 0),
      'checkouts', CASE WHEN v_result = 'win' THEN p_player_legs ELSE 0 END,
      'match_type', CASE 
        WHEN v_event.event_type = 'league' THEN 'career'
        WHEN v_event.event_type IN ('open', 'qualifier', 'major') THEN 'tournament'
        ELSE 'career'
      END,
      'legs_won', p_player_legs,
      'legs_lost', p_opponent_legs
    ));
  EXCEPTION WHEN OTHERS THEN
    -- Ignore achievement tracking errors, don't fail the match
    NULL;
  END;
  
  -- Mark event as completed
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now()
  WHERE id = v_match.event_id;
  
  -- Update league standings if this was a league match
  IF v_event.event_type = 'league' THEN
    -- Update player stats
    UPDATE career_league_standings SET
      played = played + 1,
      won = won + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      lost = lost + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      legs_for = legs_for + p_player_legs,
      legs_against = legs_against + p_opponent_legs,
      points = points + CASE WHEN v_result = 'win' THEN 2 ELSE 0 END
    WHERE career_id = p_career_id 
      AND season = v_career.season 
      AND tier = v_career.tier 
      AND is_player = TRUE;
    
    -- Update opponent stats
    UPDATE career_league_standings SET
      played = played + 1,
      won = won + CASE WHEN v_result = 'loss' THEN 1 ELSE 0 END,
      lost = lost + CASE WHEN v_result = 'win' THEN 1 ELSE 0 END,
      legs_for = legs_for + p_opponent_legs,
      legs_against = legs_against + p_player_legs,
      points = points + CASE WHEN v_result = 'loss' THEN 2 ELSE 0 END
    WHERE career_id = p_career_id 
      AND season = v_career.season 
      AND tier = v_career.tier 
      AND opponent_id = v_match.opponent_id;
    
    -- Check if this was the last league match of the season
    SELECT COUNT(*) INTO v_total_league_matches
    FROM career_schedule_templates
    WHERE tier = v_career.tier AND event_type = 'league';
    
    SELECT COUNT(*) INTO v_completed_league_matches
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.season = v_career.season 
      AND ce.event_type = 'league' 
      AND ce.status = 'completed';
    
    v_is_last_league_match := (v_completed_league_matches >= v_total_league_matches);
    
    -- If last league match, trigger season completion
    IF v_is_last_league_match THEN
      PERFORM rpc_career_complete_season(p_career_id);
    END IF;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'result', v_result,
    'season_complete', v_is_last_league_match,
    'message', CASE 
      WHEN v_is_last_league_match THEN 'Season complete! Check your final position.'
      WHEN v_result = 'win' THEN 'Victory!'
      ELSE 'Tough loss, but keep fighting!'
    END
  );
END;
$$;

-- Log this enhancement
DO $$
BEGIN
  RAISE NOTICE 'Added season end improvements: manual advancement, final table review, performance emails, opponent refresh, auto season completion';
END $$;