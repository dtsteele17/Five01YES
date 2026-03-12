-- ============================================================
-- FIX: AI fixture results inconsistency
-- Problem: AI vs AI fixture results were generated randomly in
-- THREE separate places (match completion, fixture display, results page)
-- with no coordination. So the displayed scores didn't match
-- the actual league standings updates.
--
-- Fix:
-- 1) rpc_career_complete_match now STORES AI fixture results
--    in career_events.result JSONB under 'simulated_fixtures' key
-- 2) rpc_get_week_fixtures_with_match_lock READS stored fixtures
-- 3) rpc_get_week_results_with_standings READS stored fixtures
-- 4) Winner legs now correctly uses legs_to_win from format_legs
-- ============================================================

-- ======================
-- 1) Fix rpc_career_complete_match
--    - Store AI fixture results in career_events.result
--    - Use correct legs_to_win calculation
-- ======================
CREATE OR REPLACE FUNCTION rpc_career_complete_match(
  p_career_id UUID,
  p_match_id UUID,
  p_won BOOLEAN,
  p_player_legs SMALLINT,
  p_opponent_legs SMALLINT,
  p_player_average REAL DEFAULT NULL,
  p_opponent_average REAL DEFAULT NULL,
  p_player_checkout_pct REAL DEFAULT NULL,
  p_player_180s SMALLINT DEFAULT 0,
  p_player_highest_checkout SMALLINT DEFAULT NULL
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
  v_rep_earned BIGINT := 0;
  v_base_rep BIGINT;
  v_difficulty_bonus REAL;
  v_tier_mult REAL;
  v_milestone_bonus BIGINT := 0;
  v_form_delta REAL;
  v_rep_breakdown JSONB;
  v_new_week SMALLINT;
  v_is_promotion BOOLEAN := FALSE;
BEGIN
  -- Validate
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id AND career_id = p_career_id;
  IF v_match.id IS NULL THEN
    RETURN json_build_object('error', 'Match not found');
  END IF;

  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;

  -- Update match result
  UPDATE career_matches SET
    result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    player_average = p_player_average,
    opponent_average = p_opponent_average,
    player_checkout_pct = p_player_checkout_pct,
    player_180s = p_player_180s,
    player_highest_checkout = p_player_highest_checkout,
    played_at = now()
  WHERE id = p_match_id;

  -- Calculate REP
  v_base_rep := CASE v_event.event_type
    WHEN 'league' THEN CASE WHEN p_won THEN 5 ELSE 1 END
    WHEN 'open' THEN CASE WHEN p_won THEN 8 ELSE 2 END
    WHEN 'qualifier' THEN CASE WHEN p_won THEN 10 ELSE 3 END
    WHEN 'trial_tournament' THEN CASE WHEN p_won THEN 3 ELSE 1 END
    WHEN 'major' THEN CASE WHEN p_won THEN 15 ELSE 4 END
    WHEN 'season_finals' THEN CASE WHEN p_won THEN 25 ELSE 5 END
    WHEN 'promotion' THEN CASE WHEN p_won THEN 10 ELSE 2 END
    ELSE CASE WHEN p_won THEN 5 ELSE 1 END
  END;

  v_difficulty_bonus := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.8
    WHEN 'amateur' THEN 0.9
    WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.2
    WHEN 'world-class' THEN 1.5
    WHEN 'nightmare' THEN 2.0
    ELSE 1.0
  END;

  v_tier_mult := CASE v_career.tier
    WHEN 1 THEN 0.10
    WHEN 2 THEN 0.25
    WHEN 3 THEN 0.50
    WHEN 4 THEN 0.80
    WHEN 5 THEN 1.00
    ELSE 0.10
  END;

  IF p_player_180s > 0 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(p_player_180s * 2 * v_tier_mult);
  END IF;
  IF p_player_highest_checkout IS NOT NULL AND p_player_highest_checkout >= 100 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(3 * v_tier_mult);
  END IF;
  IF p_player_average IS NOT NULL AND p_player_average >= 80 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(5 * v_tier_mult);
  END IF;

  v_rep_earned := ROUND(v_base_rep * v_difficulty_bonus * v_tier_mult) + v_milestone_bonus;
  v_rep_earned := ROUND(v_rep_earned * (1.0 + v_career.form));

  v_rep_breakdown := jsonb_build_object(
    'base', v_base_rep,
    'difficulty_mult', v_difficulty_bonus,
    'milestone_bonus', v_milestone_bonus,
    'form_modifier', v_career.form,
    'total', v_rep_earned
  );

  UPDATE career_matches SET rep_earned = v_rep_earned, rep_breakdown = v_rep_breakdown WHERE id = p_match_id;

  v_form_delta := CASE WHEN p_won THEN 0.01 ELSE -0.01 END;

  -- Mark event completed (basic result — simulated_fixtures added below)
  UPDATE career_events SET status = 'completed', completed_at = now(),
    result = jsonb_build_object('won', p_won, 'player_legs', p_player_legs, 'opponent_legs', p_opponent_legs)
  WHERE id = v_match.event_id;

  -- Advance career
  IF v_career.tier = 1 THEN
    UPDATE career_profiles SET
      rep = rep + v_rep_earned,
      form = GREATEST(-0.05, LEAST(0.05, form + v_form_delta)),
      day = COALESCE(v_event.day, day + 1),
      updated_at = now()
    WHERE id = p_career_id;
  ELSE
    v_new_week := v_career.week + 1;
    UPDATE career_profiles SET
      rep = rep + v_rep_earned,
      form = GREATEST(-0.05, LEAST(0.05, form + v_form_delta)),
      week = v_new_week,
      day = COALESCE(v_event.day, day + 1),
      updated_at = now()
    WHERE id = p_career_id;
  END IF;

  -- Update league standings if league match
  IF v_event.event_type = 'league' AND v_career.tier >= 2 THEN
    -- Ensure player row exists
    INSERT INTO career_league_standings (career_id, season, tier, is_player, played, won, lost, legs_for, legs_against, points, average)
    VALUES (p_career_id, v_career.season, v_career.tier, TRUE, 0, 0, 0, 0, 0, 0, 0)
    ON CONFLICT (career_id, season, tier) WHERE is_player = TRUE DO NOTHING;

    -- Update player standing
    UPDATE career_league_standings SET
      played = played + 1,
      won = won + CASE WHEN p_won THEN 1 ELSE 0 END,
      lost = lost + CASE WHEN p_won THEN 0 ELSE 1 END,
      legs_for = legs_for + p_player_legs,
      legs_against = legs_against + p_opponent_legs,
      points = points + CASE WHEN p_won THEN 2 ELSE 0 END,
      average = CASE WHEN p_player_average IS NOT NULL THEN
        (average * (played) + p_player_average) / (played + 1)
        ELSE average END
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE;

    -- Update player's opponent standings (inverse of player result)
    UPDATE career_league_standings SET
      played = played + 1,
      won = won + CASE WHEN p_won THEN 0 ELSE 1 END,
      lost = lost + CASE WHEN p_won THEN 1 ELSE 0 END,
      legs_for = legs_for + p_opponent_legs,
      legs_against = legs_against + p_player_legs,
      points = points + CASE WHEN p_won THEN 0 ELSE 2 END
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
      AND opponent_id = v_match.opponent_id;

    -- Simulate remaining AI vs AI matches and STORE results
    <<ai_sim>>
    DECLARE
      v_ai_ids UUID[];
      v_ai_count INT;
      v_idx INT;
      v_home_id UUID;
      v_away_id UUID;
      v_home_won BOOLEAN;
      v_w_legs SMALLINT;
      v_l_legs SMALLINT;
      v_legs_to_win SMALLINT;
      v_sim_fixtures JSONB := '[]'::JSONB;
    BEGIN
      -- Calculate correct legs_to_win from event format
      v_legs_to_win := ceil(v_event.format_legs / 2.0)::SMALLINT;

      SELECT ARRAY_AGG(opponent_id ORDER BY random()) INTO v_ai_ids
      FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
        AND is_player = FALSE AND opponent_id != v_match.opponent_id;

      v_ai_count := COALESCE(array_length(v_ai_ids, 1), 0);
      v_idx := 1;
      WHILE v_idx + 1 <= v_ai_count LOOP
        v_home_id := v_ai_ids[v_idx];
        v_away_id := v_ai_ids[v_idx + 1];
        v_home_won := random() < 0.55;
        -- Winner ALWAYS gets exactly legs_to_win (correct for best-of format)
        v_w_legs := v_legs_to_win;
        -- Loser gets 0 to (legs_to_win - 1) random legs
        v_l_legs := (floor(random() * v_legs_to_win))::SMALLINT;

        -- Update winner standings
        UPDATE career_league_standings SET
          played = played + 1, won = won + 1,
          legs_for = legs_for + v_w_legs, legs_against = legs_against + v_l_legs,
          points = points + 2
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_home_id ELSE v_away_id END;

        -- Update loser standings
        UPDATE career_league_standings SET
          played = played + 1, lost = lost + 1,
          legs_for = legs_for + v_l_legs, legs_against = legs_against + v_w_legs
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_away_id ELSE v_home_id END;

        -- Store this fixture result so display functions can read it
        v_sim_fixtures := v_sim_fixtures || jsonb_build_array(jsonb_build_object(
          'home_id', v_home_id,
          'away_id', v_away_id,
          'home_won', v_home_won,
          'winner_legs', v_w_legs,
          'loser_legs', v_l_legs
        ));

        v_idx := v_idx + 2;
      END LOOP;

      -- Save simulated fixtures into the event result JSONB
      UPDATE career_events SET
        result = COALESCE(result, '{}'::JSONB) || jsonb_build_object('simulated_fixtures', v_sim_fixtures)
      WHERE id = v_match.event_id;
    END ai_sim;

    -- Check if season is complete
    <<season_check>>
    DECLARE
      v_player_played SMALLINT;
      v_player_rank SMALLINT;
      v_season_complete BOOLEAN := FALSE;
      v_promoted BOOLEAN := FALSE;
      v_total_opponents SMALLINT;
    BEGIN
      SELECT played INTO v_player_played FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE;

      SELECT COUNT(*)::SMALLINT INTO v_total_opponents FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

      IF v_player_played >= v_total_opponents THEN
        v_season_complete := TRUE;

        UPDATE career_league_standings SET
          played = v_total_opponents,
          won = LEAST(won, v_total_opponents),
          lost = v_total_opponents - LEAST(won, v_total_opponents)
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND is_player = FALSE AND played < v_total_opponents;

        SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND is_player = FALSE
          AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
            OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
              AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

        IF v_player_rank <= 2 THEN
          v_promoted := TRUE;
          INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
          VALUES (p_career_id, 'league_win', 'League Champion — Season ' || v_career.season,
            CASE WHEN v_player_rank = 1 THEN 'Won the league!' ELSE 'Runner-up — promoted!' END,
            v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));
        ELSE
          INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
          VALUES (p_career_id, 'season_end', 'Season ' || v_career.season || ' Complete',
            'Finished ' || v_player_rank || CASE WHEN v_player_rank = 3 THEN 'rd' ELSE 'th' END || ' — new season incoming.',
            v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));

          DECLARE
            v_new_season SMALLINT := v_career.season + 1;
            v_ranked_opponents UUID[];
            v_keep_opponents UUID[];
            v_new_day SMALLINT := COALESCE(v_event.day, v_career.day) + 5;
          BEGIN
            SELECT ARRAY_AGG(opponent_id ORDER BY points DESC, (legs_for - legs_against) DESC) INTO v_ranked_opponents
            FROM career_league_standings
            WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

            v_keep_opponents := v_ranked_opponents[3:array_length(v_ranked_opponents, 1) - 2];

            UPDATE career_profiles SET season = v_new_season, week = 1, day = v_new_day, updated_at = now()
            WHERE id = p_career_id;

            INSERT INTO career_league_standings (career_id, season, tier, is_player)
            VALUES (p_career_id, v_new_season, v_career.tier, TRUE);

            INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
            SELECT p_career_id, v_new_season, v_career.tier, unnest(v_keep_opponents), FALSE;

            PERFORM rpc_generate_career_opponents(p_career_id, v_career.tier::SMALLINT, 4, v_career.career_seed + v_new_season * 100);

            INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
            SELECT p_career_id, v_new_season, v_career.tier, id, FALSE
            FROM career_opponents
            WHERE career_id = p_career_id AND tier = v_career.tier
              AND id NOT IN (SELECT unnest(v_keep_opponents))
              AND id NOT IN (SELECT unnest(v_ranked_opponents))
            ORDER BY created_at DESC
            LIMIT 4;

            INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
            SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
              v_new_day + CASE
                WHEN t.event_type IN ('open','qualifier','major','season_finals') THEN t.sequence_no * 6 - 2
                ELSE t.sequence_no * 6 + 1
              END
            FROM career_schedule_templates t WHERE t.tier = v_career.tier ORDER BY t.sequence_no;
          END;
        END IF;
      END IF;
    END season_check;
  END IF;

  -- Check for milestone achievements
  IF p_player_180s > 0 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    SELECT p_career_id, 'first_180', 'First Maximum!', 'Hit your first 180 in career mode.', v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day)
    WHERE NOT EXISTS (SELECT 1 FROM career_milestones WHERE career_id = p_career_id AND milestone_type = 'first_180');
  END IF;

  IF p_player_highest_checkout IS NOT NULL AND p_player_highest_checkout >= 100 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    SELECT p_career_id, 'first_ton_checkout', 'Ton-Plus Checkout!', 'Hit a 100+ checkout in career mode.', v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day)
    WHERE NOT EXISTS (SELECT 1 FROM career_milestones WHERE career_id = p_career_id AND milestone_type = 'first_ton_checkout');
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'rep_earned', v_rep_earned,
    'rep_breakdown', v_rep_breakdown,
    'total_rep', (SELECT rep FROM career_profiles WHERE id = p_career_id),
    'form', (SELECT form FROM career_profiles WHERE id = p_career_id),
    'event_type', v_event.event_type,
    'is_promotion', v_is_promotion
  );
END;
$$;


-- ======================
-- 2) Fix rpc_get_week_fixtures_with_match_lock
--    - Read stored fixtures from career_events.result->'simulated_fixtures'
--    - Fall back to random only if no stored data exists (legacy events)
-- ======================
CREATE OR REPLACE FUNCTION rpc_get_week_fixtures_with_match_lock(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_player_match career_matches;
  v_player_opponent career_opponents;
  v_fixtures JSON[];
  v_fixture JSON;
  v_other_opponents career_opponents[];
  v_i INTEGER;
  v_result JSON;
  v_best_of INTEGER;
  v_legs_to_win INTEGER;
  v_stored_fixtures JSONB;
  v_sf JSONB;
  v_home_opp career_opponents;
  v_away_opp career_opponents;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- First: try to get a pending or active league event
  SELECT * INTO v_event FROM career_events
  WHERE career_id = p_career_id
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC
  LIMIT 1;

  -- If no pending/active event, get the most recently completed one
  IF v_event.id IS NULL THEN
    SELECT * INTO v_event FROM career_events
    WHERE career_id = p_career_id
      AND season = v_career.season
      AND event_type = 'league'
      AND status = 'completed'
    ORDER BY sequence_no DESC
    LIMIT 1;
  END IF;

  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event found');
  END IF;

  v_best_of := v_event.format_legs;
  v_legs_to_win := ceil(v_best_of / 2.0)::integer;

  -- Get/create player's match for this event
  SELECT cm.* INTO v_player_match
  FROM career_matches cm
  WHERE cm.career_id = p_career_id AND cm.event_id = v_event.id;

  IF v_player_match.id IS NOT NULL THEN
    SELECT co.* INTO v_player_opponent
    FROM career_opponents co
    WHERE co.id = v_player_match.opponent_id;
  END IF;

  IF v_player_match.id IS NULL THEN
    SELECT co.* INTO v_player_opponent FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id
      AND ls.season = v_career.season
      AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id NOT IN (
        SELECT cm.opponent_id FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE cm.career_id = p_career_id
          AND ce.event_type = 'league'
          AND ce.season = v_career.season
          AND cm.result != 'pending'
      )
    ORDER BY random()
    LIMIT 1;

    IF v_player_opponent.id IS NULL THEN
      SELECT co.* INTO v_player_opponent FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id
        AND ls.season = v_career.season
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;

    IF v_player_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents available');
    END IF;

    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_event.id, v_player_opponent.id, v_event.format_legs, 'pending'
    ) RETURNING * INTO v_player_match;
  END IF;

  -- Build player fixture
  v_fixtures := ARRAY[
    json_build_object(
      'id', 'player_match',
      'home_team', 'You',
      'away_team', v_player_opponent.first_name || ' ' || v_player_opponent.last_name,
      'home_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.player_legs_won END,
      'away_score', CASE WHEN v_player_match.result != 'pending' THEN v_player_match.opponent_legs_won END,
      'status', CASE WHEN v_player_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
      'is_player_match', true,
      'event_id', v_event.id,
      'match_id', v_player_match.id
    )
  ];

  -- Check for stored simulated fixtures (set by rpc_career_complete_match)
  v_stored_fixtures := v_event.result->'simulated_fixtures';

  IF v_stored_fixtures IS NOT NULL AND jsonb_array_length(v_stored_fixtures) > 0 THEN
    -- Use stored fixture results (consistent with standings)
    FOR v_i IN 0..jsonb_array_length(v_stored_fixtures) - 1 LOOP
      v_sf := v_stored_fixtures->v_i;

      SELECT * INTO v_home_opp FROM career_opponents WHERE id = (v_sf->>'home_id')::UUID;
      SELECT * INTO v_away_opp FROM career_opponents WHERE id = (v_sf->>'away_id')::UUID;

      IF v_home_opp.id IS NOT NULL AND v_away_opp.id IS NOT NULL THEN
        v_fixtures := v_fixtures || json_build_object(
          'id', 'sim_match_' || (v_i + 1),
          'home_team', v_home_opp.first_name || ' ' || v_home_opp.last_name,
          'away_team', v_away_opp.first_name || ' ' || v_away_opp.last_name,
          'home_score', CASE WHEN v_player_match.result != 'pending' THEN
            CASE WHEN (v_sf->>'home_won')::BOOLEAN THEN (v_sf->>'winner_legs')::INT ELSE (v_sf->>'loser_legs')::INT END
          ELSE NULL END,
          'away_score', CASE WHEN v_player_match.result != 'pending' THEN
            CASE WHEN (v_sf->>'home_won')::BOOLEAN THEN (v_sf->>'loser_legs')::INT ELSE (v_sf->>'winner_legs')::INT END
          ELSE NULL END,
          'status', CASE WHEN v_player_match.result != 'pending' THEN 'completed' ELSE 'pending' END,
          'is_player_match', false
        );
      END IF;
    END LOOP;
  ELSE
    -- Fallback: generate random fixtures for display (legacy events without stored results)
    SELECT ARRAY(
      SELECT co FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id
        AND ls.season = v_career.season
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND ls.opponent_id != v_player_opponent.id
      ORDER BY random()
      LIMIT 6
    ) INTO v_other_opponents;

    FOR v_i IN 1..3 LOOP
      IF v_i * 2 <= COALESCE(array_length(v_other_opponents, 1), 0) THEN
        DECLARE
          v_home_wins BOOLEAN := random() < 0.5;
          v_winner_legs INTEGER := v_legs_to_win;
          v_loser_legs INTEGER := floor(random() * v_legs_to_win)::integer;
        BEGIN
          v_fixtures := v_fixtures || json_build_object(
            'id', 'sim_match_' || v_i,
            'home_team', v_other_opponents[v_i * 2 - 1].first_name || ' ' || v_other_opponents[v_i * 2 - 1].last_name,
            'away_team', v_other_opponents[v_i * 2].first_name || ' ' || v_other_opponents[v_i * 2].last_name,
            'home_score', CASE WHEN v_player_match.result != 'pending' THEN
              CASE WHEN v_home_wins THEN v_winner_legs ELSE v_loser_legs END
            ELSE NULL END,
            'away_score', CASE WHEN v_player_match.result != 'pending' THEN
              CASE WHEN v_home_wins THEN v_loser_legs ELSE v_winner_legs END
            ELSE NULL END,
            'status', CASE WHEN v_player_match.result != 'pending' THEN 'completed' ELSE 'pending' END,
            'is_player_match', false
          );
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_event.event_name,
    'format_legs', v_best_of,
    'fixtures', v_fixtures
  );
END;
$$;


-- ======================
-- 3) Fix rpc_get_week_results_with_standings
--    - Read stored fixtures from career_events.result->'simulated_fixtures'
--    - Fall back to random only if no stored data exists
-- ======================
CREATE OR REPLACE FUNCTION rpc_get_week_results_with_standings(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current_event career_events;
  v_fixtures JSON[] := '{}';
  fixture_obj JSON;
  match_record RECORD;
  v_standings JSON;
  v_stored_fixtures JSONB;
  v_sf JSONB;
  v_i INT;
  v_home_opp career_opponents;
  v_away_opp career_opponents;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RAISE EXCEPTION 'Career not found: %', p_career_id;
  END IF;

  -- Get the most recent league event (active or completed)
  SELECT ce.* INTO v_current_event
  FROM career_events ce
  WHERE ce.career_id = p_career_id
    AND ce.event_type = 'league'
    AND ce.status IN ('active', 'completed')
  ORDER BY ce.sequence_no DESC
  LIMIT 1;

  IF v_current_event.id IS NULL THEN
    RAISE EXCEPTION 'No league event found for results';
  END IF;

  -- Get player's match result
  FOR match_record IN
    SELECT
      cm.id,
      'You' as home_team,
      co.first_name || ' ' || co.last_name as away_team,
      cm.player_legs_won as home_score,
      cm.opponent_legs_won as away_score,
      true as is_player_match,
      cm.result
    FROM career_matches cm
    JOIN career_opponents co ON co.id = cm.opponent_id
    WHERE cm.event_id = v_current_event.id
      AND cm.result IN ('win', 'loss')
  LOOP
    fixture_obj := json_build_object(
      'id', match_record.id::TEXT,
      'home_team', match_record.home_team,
      'away_team', match_record.away_team,
      'home_score', match_record.home_score,
      'away_score', match_record.away_score,
      'status', 'completed',
      'is_player_match', match_record.is_player_match
    );
    v_fixtures := v_fixtures || fixture_obj;
  END LOOP;

  -- Read stored simulated fixtures (consistent with standings)
  v_stored_fixtures := v_current_event.result->'simulated_fixtures';

  IF v_stored_fixtures IS NOT NULL AND jsonb_array_length(v_stored_fixtures) > 0 THEN
    -- Use stored fixture results
    FOR v_i IN 0..jsonb_array_length(v_stored_fixtures) - 1 LOOP
      v_sf := v_stored_fixtures->v_i;

      SELECT * INTO v_home_opp FROM career_opponents WHERE id = (v_sf->>'home_id')::UUID;
      SELECT * INTO v_away_opp FROM career_opponents WHERE id = (v_sf->>'away_id')::UUID;

      IF v_home_opp.id IS NOT NULL AND v_away_opp.id IS NOT NULL THEN
        fixture_obj := json_build_object(
          'id', gen_random_uuid()::TEXT,
          'home_team', v_home_opp.first_name || ' ' || v_home_opp.last_name,
          'away_team', v_away_opp.first_name || ' ' || v_away_opp.last_name,
          'home_score', CASE WHEN (v_sf->>'home_won')::BOOLEAN
            THEN (v_sf->>'winner_legs')::INT ELSE (v_sf->>'loser_legs')::INT END,
          'away_score', CASE WHEN (v_sf->>'home_won')::BOOLEAN
            THEN (v_sf->>'loser_legs')::INT ELSE (v_sf->>'winner_legs')::INT END,
          'status', 'completed',
          'is_player_match', false
        );
        v_fixtures := v_fixtures || fixture_obj;
      END IF;
    END LOOP;
  ELSE
    -- Fallback: generate random fixtures (legacy events)
    DECLARE
      opponent_names TEXT[] := '{}';
      player_opponent_name TEXT;
      v_legs_to_win INT;
      i INT := 1;
    BEGIN
      v_legs_to_win := ceil(v_current_event.format_legs / 2.0)::integer;

      SELECT co.first_name || ' ' || co.last_name
      INTO player_opponent_name
      FROM career_matches cm
      JOIN career_opponents co ON co.id = cm.opponent_id
      WHERE cm.event_id = v_current_event.id;

      SELECT array_agg(co.first_name || ' ' || co.last_name ORDER BY co.first_name, co.last_name)
      INTO opponent_names
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id
        AND ls.season = v_career.season
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND (co.first_name || ' ' || co.last_name) != COALESCE(player_opponent_name, '');

      WHILE i <= COALESCE(array_length(opponent_names, 1), 0) - 1 AND array_length(v_fixtures, 1) < 4 LOOP
        DECLARE
          v_home_wins BOOLEAN := random() < 0.5;
        BEGIN
          fixture_obj := json_build_object(
            'id', gen_random_uuid()::TEXT,
            'home_team', opponent_names[i],
            'away_team', opponent_names[i + 1],
            'home_score', CASE WHEN v_home_wins THEN v_legs_to_win ELSE floor(random() * v_legs_to_win)::INT END,
            'away_score', CASE WHEN v_home_wins THEN floor(random() * v_legs_to_win)::INT ELSE v_legs_to_win END,
            'status', 'completed',
            'is_player_match', false
          );
        END;
        v_fixtures := v_fixtures || fixture_obj;
        i := i + 2;
      END LOOP;
    END;
  END IF;

  -- Get updated league standings
  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT
        ls.is_player,
        CASE WHEN ls.is_player THEN 'You' ELSE (SELECT o.first_name || ' ' || o.last_name FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average
      FROM career_league_standings ls
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_current_event.event_name,
    'fixtures', array_to_json(v_fixtures),
    'standings', v_standings
  );
END;
$$;
