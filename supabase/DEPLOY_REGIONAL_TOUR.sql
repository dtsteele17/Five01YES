-- ============================================================
-- REGIONAL TOUR (Tier 4) — Complete implementation
-- 15 players, 14 league matches BO7, 2pts/win
-- 3 tournaments integrated into season with league points
-- T3 = 64-player Major with qualification
-- Q School for 3rd-6th place
-- ============================================================

-- ============================================
-- 0. Expand event type constraints
-- ============================================
ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_event_type_check
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament','season_end',
    'regional_tournament','regional_t3_qualification','regional_qual_match',
    'q_school_semi','q_school_final',
    'county_championship_group','county_championship_knockout'
  ));

ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;
ALTER TABLE career_events ADD CONSTRAINT career_events_event_type_check
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament','season_end',
    'regional_tournament','regional_t3_qualification','regional_qual_match',
    'q_school_semi','q_school_final',
    'county_championship_group','county_championship_knockout'
  ));

-- ============================================
-- 1. Replace Tier 4 schedule templates
-- ============================================
DELETE FROM career_schedule_templates WHERE tier = 4;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
-- Block 1: 5 league matches
(4, 1,  'league', 'Regional Tour — Matchday 1',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 2,  'league', 'Regional Tour — Matchday 2',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 3,  'league', 'Regional Tour — Matchday 3',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 4,  'league', 'Regional Tour — Matchday 4',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 5,  'league', 'Regional Tour — Matchday 5',  'regional_league', 7, NULL, FALSE, '{}'),
-- Tournament 1
(4, 6,  'regional_tournament', 'Regional Tour Event 1', 'regional_t1', 7, 32, FALSE,
  '{"tournament_number": 1, "points_table": {"L32": 0, "L16": 1, "QF": 2, "SF": 3, "RU": 4, "W": 5}}'),
-- Block 2: 5 league matches
(4, 7,  'league', 'Regional Tour — Matchday 6',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 8,  'league', 'Regional Tour — Matchday 7',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 9,  'league', 'Regional Tour — Matchday 8',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 10, 'league', 'Regional Tour — Matchday 9',  'regional_league', 7, NULL, FALSE, '{}'),
(4, 11, 'league', 'Regional Tour — Matchday 10', 'regional_league', 7, NULL, FALSE, '{}'),
-- Tournament 2
(4, 12, 'regional_tournament', 'Regional Tour Event 2', 'regional_t2', 7, 32, FALSE,
  '{"tournament_number": 2, "points_table": {"L32": 0, "L16": 1, "QF": 2, "SF": 3, "RU": 4, "W": 5}}'),
-- Block 3: 4 league matches
(4, 13, 'league', 'Regional Tour — Matchday 11', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 14, 'league', 'Regional Tour — Matchday 12', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 15, 'league', 'Regional Tour — Matchday 13', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 16, 'league', 'Regional Tour — Matchday 14', 'regional_league', 7, NULL, FALSE, '{}'),
-- Tournament 3 Qualification + Major
(4, 17, 'regional_t3_qualification', 'Tour Championship Qualification', 'regional_t3_qual', 7, NULL, FALSE,
  '{"description": "Top 8 auto-qualify. Ranks 9-15 play qualification matches."}'),
(4, 18, 'regional_tournament', 'Tour Championship', 'regional_t3', 7, 64, FALSE,
  '{"tournament_number": 3, "is_major": true, "points_table": {"L64": 0, "L32": 2, "L16": 3, "QF": 4, "SF": 5, "RU": 6, "W": 7}}');

-- ============================================
-- 2. Award tournament points to league standings
-- Called after a Regional Tour tournament bracket completes
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_award_tournament_points(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION rpc_regional_tour_award_tournament_points(
  p_career_id UUID,
  p_event_id UUID,
  p_placement TEXT  -- 'L32','L16','QF','SF','RU','W'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_metadata JSON;
  v_tournament_number INT;
  v_points_table JSON;
  v_points_awarded INT := 0;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events
    WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  -- Get points from template metadata
  SELECT metadata::json INTO v_metadata FROM career_schedule_templates
    WHERE tier = 4 AND event_subtype = v_event.event_subtype LIMIT 1;

  IF v_metadata IS NULL THEN
    -- Fallback: use event name to determine tournament number
    v_metadata := '{}'::json;
  END IF;

  v_points_table := v_metadata->'points_table';
  IF v_points_table IS NOT NULL THEN
    v_points_awarded := COALESCE((v_points_table->>p_placement)::int, 0);
  END IF;

  -- Add points to player's league standings
  IF v_points_awarded > 0 THEN
    UPDATE career_league_standings
    SET points = points + v_points_awarded
    WHERE career_id = p_career_id AND season = v_career.season
      AND tier = v_career.tier AND is_player = TRUE;
  END IF;

  -- Milestone
  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
  VALUES (p_career_id,
    CASE WHEN p_placement = 'W' THEN 'tournament_win' ELSE 'tournament_result' END,
    v_event.event_name || ' — ' || p_placement,
    'Earned ' || v_points_awarded || ' league points from ' || v_event.event_name,
    v_career.tier, v_career.season, v_career.week, v_career.day);

  RETURN json_build_object(
    'success', true,
    'points_awarded', v_points_awarded,
    'placement', p_placement,
    'event_name', v_event.event_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_award_tournament_points(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- 3. T3 Qualification check
-- Top 8 auto-qualify, 9-15 play qualification matches
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_t3_qualification(UUID);
CREATE OR REPLACE FUNCTION rpc_regional_tour_t3_qualification(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_auto_qualifies BOOLEAN;
  v_qual_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Calculate player rank (including tournament bonus points)
  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  v_auto_qualifies := (v_player_rank <= 8);

  -- Mark qualification event as completed
  UPDATE career_events SET status = 'completed'
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'regional_t3_qualification';

  IF v_auto_qualifies THEN
    -- Player auto-qualifies — mark T3 event as pending (ready to play)
    UPDATE career_events SET status = 'pending'
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_subtype = 'regional_t3';

    RETURN json_build_object(
      'success', true,
      'auto_qualified', true,
      'player_rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || ' — automatic qualification for the Tour Championship!'
    );
  ELSE
    -- Player must win a qualification match (BO7)
    INSERT INTO career_events (
      career_id, season, sequence_no, event_type, event_name,
      format_legs, bracket_size, day, status
    ) VALUES (
      p_career_id, v_career.season, 170,
      'regional_qual_match', 'Tour Championship Qualifier',
      7, NULL, v_career.day + 2, 'pending'
    ) RETURNING id INTO v_qual_event_id;

    RETURN json_build_object(
      'success', true,
      'auto_qualified', false,
      'player_rank', v_player_rank,
      'qual_event_id', v_qual_event_id,
      'message', 'Ranked ' || v_player_rank || ' — must win a qualification match to enter the Tour Championship'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_t3_qualification(UUID) TO authenticated;

-- ============================================
-- 4. Q School (after final league table)
-- 3rd-6th enter 4-player knockout BO9
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_q_school(UUID);
CREATE OR REPLACE FUNCTION rpc_regional_tour_q_school(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_total_players SMALLINT;
  v_semi_opponent_rank SMALLINT;
  v_semi_opponent_id UUID;
  v_semi_opponent_name TEXT;
  v_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF v_career.tier != 4 THEN
    RETURN json_build_object('error', 'Q School is only for Tier 4');
  END IF;

  -- Count players and calculate rank
  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- Only 3rd-6th qualify for Q School
  IF v_player_rank < 3 OR v_player_rank > 6 THEN
    RETURN json_build_object('error', 'Only ranks 3-6 enter Q School', 'player_rank', v_player_rank);
  END IF;

  -- Check if Q School already exists
  IF EXISTS (
    SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'q_school_semi'
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  -- Semi-final matchups: 3rd vs 6th, 4th vs 5th
  -- Determine player's opponent rank
  v_semi_opponent_rank := CASE v_player_rank
    WHEN 3 THEN 6
    WHEN 4 THEN 5
    WHEN 5 THEN 4
    WHEN 6 THEN 3
  END;

  -- Get opponent at that rank
  SELECT opponent_id INTO v_semi_opponent_id FROM (
    SELECT opponent_id, ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC) AS rn
    FROM career_league_standings
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE
  ) ranked
  WHERE rn = v_semi_opponent_rank - 1;  -- -1 because player is ranked among them

  -- If player rank is e.g. 3, opponents ranked above player exclude player
  -- Actually let's just get the Nth ranked AI opponent
  -- Rank 1 AI = rank 2 overall (since player could be rank 1)
  -- We need opponents at ranks 3,4,5,6 excluding the player
  -- Simpler: get all AI opponents sorted, player is at v_player_rank
  -- AI rank N = overall rank N if N < player_rank, else overall rank N+1
  
  -- Let's use a cleaner approach: get opponent by their standing position
  WITH ranked_opponents AS (
    SELECT opponent_id,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS ai_rank
    FROM career_league_standings
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE
  )
  SELECT opponent_id INTO v_semi_opponent_id FROM ranked_opponents
  WHERE ai_rank = CASE
    -- If player is 3rd, opponent is 6th overall = 5th AI (since one spot is player)
    -- If player is 4th, opponent is 5th overall = 4th AI
    -- If player is 5th, opponent is 4th overall = 3rd or 4th AI depending
    -- Actually: overall_rank = ai_rank if ai_rank < player_rank, else ai_rank + 1
    -- So ai_rank = overall_rank if overall_rank < player_rank, else overall_rank - 1
    WHEN v_semi_opponent_rank < v_player_rank THEN v_semi_opponent_rank
    ELSE v_semi_opponent_rank - 1
  END;

  SELECT co.name INTO v_semi_opponent_name FROM career_opponents co WHERE co.id = v_semi_opponent_id;

  -- Create Q School semi-final event
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, day, status
  ) VALUES (
    p_career_id, v_career.season, 400,
    'q_school_semi',
    'Q School Semi-Final — ' || v_player_rank || ' vs ' || v_semi_opponent_rank,
    9, v_career.day + 3, 'pending'
  ) RETURNING id INTO v_event_id;

  -- Store match
  INSERT INTO career_matches (career_id, event_id, opponent_id, best_of, status)
  VALUES (p_career_id, v_event_id, v_semi_opponent_id, 9, 'pending');

  -- Simulate the other semi (determine who player faces in final if they win)
  -- Other semi: the two ranks not involving the player
  -- Store in milestone for later
  DECLARE
    v_other_semi_winner_rank SMALLINT;
    v_other_winner_id UUID;
    v_other_winner_name TEXT;
  BEGIN
    -- Other semi matchup
    -- If player is 3 or 6 (3v6 semi), other semi is 4v5
    -- If player is 4 or 5 (4v5 semi), other semi is 3v6
    IF v_player_rank IN (3, 6) THEN
      -- Other semi is 4v5, random winner
      v_other_semi_winner_rank := CASE WHEN random() < 0.5 THEN 4 ELSE 5 END;
    ELSE
      -- Other semi is 3v6, random winner
      v_other_semi_winner_rank := CASE WHEN random() < 0.5 THEN 3 ELSE 6 END;
    END IF;

    -- Get that opponent
    WITH ranked_opponents AS (
      SELECT opponent_id,
        ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS ai_rank
      FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE
    )
    SELECT opponent_id INTO v_other_winner_id FROM ranked_opponents
    WHERE ai_rank = CASE
      WHEN v_other_semi_winner_rank < v_player_rank THEN v_other_semi_winner_rank
      ELSE v_other_semi_winner_rank - 1
    END;

    SELECT co.name INTO v_other_winner_name FROM career_opponents co WHERE co.id = v_other_winner_id;

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'q_school_data', 'Q School Data',
      json_build_object(
        'player_rank', v_player_rank,
        'semi_opponent_rank', v_semi_opponent_rank,
        'other_semi_winner_id', v_other_winner_id,
        'other_semi_winner_name', v_other_winner_name,
        'other_semi_winner_rank', v_other_semi_winner_rank
      )::text,
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END;

  RETURN json_build_object(
    'success', true,
    'player_rank', v_player_rank,
    'semi_opponent', v_semi_opponent_name,
    'semi_opponent_rank', v_semi_opponent_rank,
    'event_id', v_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_q_school(UUID) TO authenticated;

-- ============================================
-- 5. Q School semi-final complete → create final if won
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_q_school_semi_complete(UUID, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION rpc_regional_tour_q_school_semi_complete(
  p_career_id UUID,
  p_event_id UUID,
  p_player_won BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_q_data JSON;
  v_final_opponent_id UUID;
  v_final_opponent_name TEXT;
  v_final_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Mark semi as completed
  UPDATE career_events SET status = 'completed' WHERE id = p_event_id AND career_id = p_career_id;
  UPDATE career_matches SET status = 'completed',
    result = CASE WHEN p_player_won THEN 'win' ELSE 'loss' END
  WHERE event_id = p_event_id AND career_id = p_career_id;

  IF NOT p_player_won THEN
    -- Eliminated from Q School
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'q_school_eliminated', 'Q School — Semi-Final Exit',
      'Lost in the Q School semi-final. Staying in the Regional Tour next season.',
      v_career.tier, v_career.season, v_career.week, v_career.day);

    RETURN json_build_object('success', true, 'promoted', false, 'message', 'Q School semi-final loss — staying in Regional Tour');
  END IF;

  -- Won semi — create final
  SELECT (description::json)->>'other_semi_winner_id' INTO v_final_opponent_id::text
  FROM career_milestones
  WHERE career_id = p_career_id AND season = v_career.season AND milestone_type = 'q_school_data'
  LIMIT 1;

  -- Handle type conversion
  SELECT (description::json)->>'other_semi_winner_id' INTO v_final_opponent_name
  FROM career_milestones
  WHERE career_id = p_career_id AND season = v_career.season AND milestone_type = 'q_school_data'
  LIMIT 1;

  v_final_opponent_id := v_final_opponent_name::UUID;

  SELECT (description::json)->>'other_semi_winner_name' INTO v_final_opponent_name
  FROM career_milestones
  WHERE career_id = p_career_id AND season = v_career.season AND milestone_type = 'q_school_data'
  LIMIT 1;

  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, day, status
  ) VALUES (
    p_career_id, v_career.season, 410,
    'q_school_final',
    'Q School Final',
    9, v_career.day + 3, 'pending'
  ) RETURNING id INTO v_final_event_id;

  INSERT INTO career_matches (career_id, event_id, opponent_id, best_of, status)
  VALUES (p_career_id, v_final_event_id, v_final_opponent_id, 9, 'pending');

  RETURN json_build_object(
    'success', true,
    'advanced_to_final', true,
    'final_opponent', v_final_opponent_name,
    'final_event_id', v_final_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_q_school_semi_complete(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================
-- 6. Q School final complete → promotion if won
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_q_school_final_complete(UUID, UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION rpc_regional_tour_q_school_final_complete(
  p_career_id UUID,
  p_event_id UUID,
  p_player_won BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  UPDATE career_events SET status = 'completed' WHERE id = p_event_id AND career_id = p_career_id;
  UPDATE career_matches SET status = 'completed',
    result = CASE WHEN p_player_won THEN 'win' ELSE 'loss' END
  WHERE event_id = p_event_id AND career_id = p_career_id;

  IF p_player_won THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'q_school_winner', 'Q School Champion!',
      'Won Q School to earn promotion to the World Tour!',
      v_career.tier, v_career.season, v_career.week, v_career.day);

    RETURN json_build_object('success', true, 'promoted', true, 'message', 'Q School winner — promoted to World Tour!');
  ELSE
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'q_school_eliminated', 'Q School — Final Loss',
      'Lost the Q School final. Staying in the Regional Tour next season.',
      v_career.tier, v_career.season, v_career.week, v_career.day);

    RETURN json_build_object('success', true, 'promoted', false, 'message', 'Q School final loss — staying in Regional Tour');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_q_school_final_complete(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================
-- 7. Update advance_to_next_season for Regional Tour
-- Handles: top 2 auto-promote, 3rd-6th Q School, bottom 2 relegated, rest stay
-- ============================================
-- NOTE: The existing rpc_career_advance_to_next_season in DEPLOY_CAREER_FLOW_V2.sql
-- already handles promotion (top 2) and relegation (bottom 2) for all tiers.
-- Q School is handled separately BEFORE advance_to_next_season is called.
-- The frontend will:
--   1. Show final table after T3
--   2. If rank 3-6: trigger Q School flow
--   3. After Q School resolves: check for q_school_winner milestone
--   4. If winner: promote via advance_to_next_season (which checks tournament_win milestone)
--   5. If not: advance_to_next_season handles stay/relegate normally

-- Add Q School winner check to advance function
-- The existing function checks for 'tournament_win' milestone with 'Championship' in title
-- We need it to also check for 'q_school_winner' milestone
-- Update: override advance_to_next_season to also check q_school_winner

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
  v_is_q_school_promotion BOOLEAN := FALSE;
  v_tier_name TEXT;
  v_old_tier_name TEXT;
  v_num_opponents SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  v_old_tier_name := CASE v_career.tier
    WHEN 1 THEN 'Local Circuit' WHEN 2 THEN 'Pub Leagues' WHEN 3 THEN 'County Circuit'
    WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_career.tier
  END;

  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- Check for alternative tournament promotion (County: Championship win)
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

  -- Check for Q School promotion (Regional Tour)
  IF v_career.tier = 4 AND v_player_rank > 2 THEN
    IF EXISTS (
      SELECT 1 FROM career_milestones
      WHERE career_id = p_career_id AND season = v_career.season
        AND milestone_type = 'q_school_winner'
    ) THEN
      v_is_q_school_promotion := TRUE;
    END IF;
  END IF;

  -- Milestones
  IF v_player_rank = 1 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'league_champion', v_old_tier_name || ' Champion',
      'Won the ' || v_old_tier_name || ' Season ' || v_career.season || '!',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  ELSIF v_player_rank = 2 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'league_runner_up', v_old_tier_name || ' Runner-Up',
      'Finished 2nd in ' || v_old_tier_name || ' Season ' || v_career.season || '.',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END IF;

  v_new_season := v_career.season + 1;
  v_new_day := v_career.day + 5;

  SELECT ARRAY_AGG(opponent_id ORDER BY points DESC, (legs_for - legs_against) DESC)
  INTO v_ranked_opponents
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

  -- Number of opponents per tier
  v_num_opponents := CASE v_career.tier WHEN 2 THEN 7 WHEN 3 THEN 9 WHEN 4 THEN 14 WHEN 5 THEN 13 ELSE 7 END;

  -- ===========================
  -- PROMOTED
  -- ===========================
  IF v_player_rank <= 2 OR v_is_tournament_promotion OR v_is_q_school_promotion THEN
    v_is_promotion := TRUE;
    v_new_tier := LEAST(v_career.tier + 1, 5);

    v_tier_name := CASE v_new_tier
      WHEN 3 THEN 'County Circuit' WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_new_tier
    END;

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'promotion', 'Promoted to ' || v_tier_name,
      CASE
        WHEN v_is_q_school_promotion THEN 'Won Q School to earn promotion to ' || v_tier_name || '!'
        WHEN v_is_tournament_promotion THEN 'Won the County Championship to earn promotion to ' || v_tier_name || '!'
        ELSE 'Earned promotion from ' || v_old_tier_name || ' to ' || v_tier_name || '!'
      END,
      v_new_tier, v_new_season, 1, v_new_day);

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'email', 'Welcome to the ' || v_tier_name || '!',
      'You''ve earned your place. The ' || v_tier_name || ' is a step up — tougher opponents, higher stakes.',
      v_new_tier, v_new_season, 1, v_new_day);

    UPDATE career_profiles SET
      tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day, updated_at = now()
    WHERE id = p_career_id;

    -- Generate opponents for new tier
    v_num_opponents := CASE v_new_tier WHEN 2 THEN 7 WHEN 3 THEN 9 WHEN 4 THEN 14 WHEN 5 THEN 13 ELSE 7 END;

    IF v_new_tier = 3 THEN
      PERFORM rpc_career_generate_tier3_league(p_career_id);
    ELSE
      PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT, v_num_opponents,
        v_career.career_seed + v_new_season * 100);
    END IF;

    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    -- Create standings for new season
    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, v_new_season, v_new_tier, TRUE);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_new_tier
    ORDER BY created_at DESC
    LIMIT v_num_opponents;

    RETURN json_build_object(
      'success', true, 'promoted', true, 'relegated', false,
      'tournament_promotion', v_is_tournament_promotion,
      'q_school_promotion', v_is_q_school_promotion,
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

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'relegation', 'Relegated to ' || v_tier_name,
      'Dropped from ' || v_old_tier_name || ' to ' || v_tier_name || '. Time to rebuild.',
      v_new_tier, v_new_season, 1, v_new_day);

    UPDATE career_profiles SET
      tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day,
      rep = GREATEST(0, rep - GREATEST(5, (rep * 0.1)::integer)),
      updated_at = now()
    WHERE id = p_career_id;

    UPDATE career_sponsor_contracts SET status = 'terminated'
    WHERE career_id = p_career_id AND status = 'active';

    v_num_opponents := CASE v_new_tier WHEN 2 THEN 7 WHEN 3 THEN 9 WHEN 4 THEN 14 ELSE 7 END;

    IF v_new_tier = 3 THEN
      PERFORM rpc_career_generate_tier3_league(p_career_id);
    ELSE
      PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT, v_num_opponents,
        v_career.career_seed + v_new_season * 100);
    END IF;

    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, v_new_season, v_new_tier, TRUE);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_new_tier
    ORDER BY created_at DESC
    LIMIT v_num_opponents;

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
-- 8. Simulate AI tournament results for Regional Tour tournaments
-- AI opponents get random placements and points
-- ============================================
DROP FUNCTION IF EXISTS rpc_regional_tour_sim_ai_tournament(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION rpc_regional_tour_sim_ai_tournament(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_number INT  -- 1, 2, or 3
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_opp RECORD;
  v_placement TEXT;
  v_placements TEXT[] := CASE p_tournament_number
    WHEN 3 THEN ARRAY['L64','L64','L64','L64','L64','L64','L32','L32','L32','L16','L16','QF','QF','SF']
    ELSE ARRAY['L32','L32','L32','L32','L32','L32','L32','L16','L16','L16','QF','QF','SF','SF']
  END;
  v_points_map JSON := CASE p_tournament_number
    WHEN 3 THEN '{"L64":0,"L32":2,"L16":3,"QF":4,"SF":5,"RU":6,"W":7}'::json
    ELSE '{"L32":0,"L16":1,"QF":2,"SF":3,"RU":4,"W":5}'::json
  END;
  v_idx INT;
  v_pts INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- For each AI opponent, assign a random placement from the distribution
  FOR v_opp IN
    SELECT opponent_id FROM career_league_standings
    WHERE career_id = p_career_id AND season = v_career.season
      AND tier = v_career.tier AND is_player = FALSE
  LOOP
    v_idx := 1 + floor(random() * array_length(v_placements, 1))::int;
    v_placement := v_placements[v_idx];
    v_pts := COALESCE((v_points_map->>v_placement)::int, 0);

    IF v_pts > 0 THEN
      UPDATE career_league_standings
      SET points = points + v_pts
      WHERE career_id = p_career_id AND season = v_career.season
        AND tier = v_career.tier AND opponent_id = v_opp.opponent_id;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'tournament_number', p_tournament_number);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_regional_tour_sim_ai_tournament(UUID, UUID, INT) TO authenticated;
