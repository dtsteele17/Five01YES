-- ============================================================
-- Career Mode: Play Next Event + Complete Match RPCs
-- ============================================================

-- Play next event: creates career_match, picks opponent, returns config for dartbot page
CREATE OR REPLACE FUNCTION rpc_career_play_next_event(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_opponent career_opponents;
  v_match_id UUID;
  v_bot_avg INT;
  v_best_of INT;
  v_difficulty_mult REAL;
BEGIN
  -- Load + validate career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next pending event
  SELECT * INTO v_event FROM career_events
    WHERE career_id = p_career_id AND status = 'pending'
    ORDER BY sequence_no ASC
    LIMIT 1;
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No pending events');
  END IF;

  -- Skip non-playable events (rest/training handled separately)
  IF v_event.event_type = 'rest' THEN
    UPDATE career_events SET status = 'completed', completed_at = now() WHERE id = v_event.id;
    UPDATE career_profiles SET week = week + 1, updated_at = now() WHERE id = p_career_id;
    RETURN json_build_object('skipped', TRUE, 'event_type', 'rest', 'message', 'Rest week — advancing to next week.');
  END IF;

  -- Training events — mark complete and advance, client handles routing
  IF v_event.event_type = 'training' THEN
    UPDATE career_events SET status = 'completed', completed_at = now() WHERE id = v_event.id;
    UPDATE career_profiles SET day = COALESCE(v_event.day, day + 1), updated_at = now() WHERE id = p_career_id;
    RETURN json_build_object('skipped', TRUE, 'event_type', 'training', 'message', 'Training session complete.');
  END IF;

  -- Difficulty multiplier for bot average
  v_difficulty_mult := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.7
    WHEN 'amateur' THEN 0.85
    WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.15
    WHEN 'world-class' THEN 1.3
    WHEN 'nightmare' THEN 1.5
    ELSE 1.0
  END;

  -- Pick an opponent for this event
  IF v_event.event_type = 'league' THEN
    -- League: pick from league standings opponents not yet played this season
    SELECT co.* INTO v_opponent FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id NOT IN (
        SELECT cm.opponent_id FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE cm.career_id = p_career_id AND ce.event_type = 'league' AND ce.season = v_career.season
      )
    ORDER BY random()
    LIMIT 1;
    -- Fallback: any league opponent if all played
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;
  ELSE
    -- Non-league: random opponent from the tier
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  IF v_opponent.id IS NULL THEN
    PERFORM rpc_generate_career_opponents(p_career_id, v_career.tier::SMALLINT, 10, v_career.career_seed + v_career.season * 100 + v_career.week);
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  -- Calculate bot average from opponent skill × difficulty
  v_bot_avg := GREATEST(20, LEAST(100, ROUND(v_opponent.skill_rating * v_difficulty_mult)));

  -- Best-of from event format_legs
  v_best_of := v_event.format_legs;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  -- Create career match record
  INSERT INTO career_matches (career_id, event_id, opponent_id, format_legs, result)
  VALUES (p_career_id, v_event.id, v_opponent.id, v_best_of, 'pending')
  RETURNING id INTO v_match_id;

  RETURN json_build_object(
    'success', TRUE,
    'match_id', v_match_id,
    'event_id', v_event.id,
    'event_type', v_event.event_type,
    'event_name', v_event.event_name,
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', COALESCE(v_opponent.first_name || ' ', '') ||
              CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
              COALESCE(v_opponent.last_name, ''),
      'first_name', v_opponent.first_name,
      'last_name', v_opponent.last_name,
      'nickname', v_opponent.nickname,
      'hometown', v_opponent.hometown,
      'archetype', v_opponent.archetype,
      'skill_rating', v_opponent.skill_rating
    ),
    'bot_average', v_bot_avg,
    'best_of', v_best_of,
    'mode', 501
  );
END;
$$;

-- Complete a career match: records result, updates standings, awards REP, advances week
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
  -- Base REP by event type
  v_base_rep := CASE v_event.event_type
    WHEN 'league' THEN CASE WHEN p_won THEN 100 ELSE 25 END
    WHEN 'open' THEN CASE WHEN p_won THEN 150 ELSE 40 END
    WHEN 'qualifier' THEN CASE WHEN p_won THEN 200 ELSE 50 END
    WHEN 'trial_tournament' THEN CASE WHEN p_won THEN 80 ELSE 20 END
    WHEN 'major' THEN CASE WHEN p_won THEN 300 ELSE 75 END
    WHEN 'season_finals' THEN CASE WHEN p_won THEN 500 ELSE 100 END
    WHEN 'promotion' THEN CASE WHEN p_won THEN 250 ELSE 50 END
    ELSE CASE WHEN p_won THEN 100 ELSE 25 END
  END;

  -- Difficulty bonus multiplier
  v_difficulty_bonus := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.8
    WHEN 'amateur' THEN 0.9
    WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.2
    WHEN 'world-class' THEN 1.5
    WHEN 'nightmare' THEN 2.0
    ELSE 1.0
  END;

  -- Tier multiplier: Tier 1 is almost nothing, scales up
  v_tier_mult := CASE v_career.tier
    WHEN 1 THEN 0.10
    WHEN 2 THEN 0.25
    WHEN 3 THEN 0.50
    WHEN 4 THEN 0.80
    WHEN 5 THEN 1.00
    ELSE 0.10
  END;

  -- Milestone bonuses (also scaled by tier)
  IF p_player_180s > 0 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(p_player_180s * 50 * v_tier_mult);
  END IF;
  IF p_player_highest_checkout IS NOT NULL AND p_player_highest_checkout >= 100 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(75 * v_tier_mult);
  END IF;
  IF p_player_average IS NOT NULL AND p_player_average >= 80 THEN
    v_milestone_bonus := v_milestone_bonus + ROUND(100 * v_tier_mult);
  END IF;

  -- Total REP (tier_mult already applied to milestone_bonus above)
  v_rep_earned := ROUND(v_base_rep * v_difficulty_bonus * v_tier_mult) + v_milestone_bonus;

  -- Apply form modifier (tiny)
  v_rep_earned := ROUND(v_rep_earned * (1.0 + v_career.form));

  v_rep_breakdown := jsonb_build_object(
    'base', v_base_rep,
    'difficulty_mult', v_difficulty_bonus,
    'milestone_bonus', v_milestone_bonus,
    'form_modifier', v_career.form,
    'total', v_rep_earned
  );

  -- Update match REP
  UPDATE career_matches SET rep_earned = v_rep_earned, rep_breakdown = v_rep_breakdown WHERE id = p_match_id;

  -- Update form (win = +0.01, loss = -0.01, clamped to ±0.05)
  v_form_delta := CASE WHEN p_won THEN 0.01 ELSE -0.01 END;

  -- Mark event completed
  UPDATE career_events SET status = 'completed', completed_at = now(),
    result = jsonb_build_object('won', p_won, 'player_legs', p_player_legs, 'opponent_legs', p_opponent_legs)
  WHERE id = v_match.event_id;

  -- Advance career (update REP, form, week/day)
  IF v_career.tier = 1 THEN
    -- Tier 1: day-based — advance to event's day
    UPDATE career_profiles SET
      rep = rep + v_rep_earned,
      form = GREATEST(-0.05, LEAST(0.05, form + v_form_delta)),
      day = COALESCE(v_event.day, day + 1),
      updated_at = now()
    WHERE id = p_career_id;
  ELSE
    -- Tier 2+: week-based
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
    -- Ensure player row exists (unique partial index: one player per career/season/tier)
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

    -- Simulate remaining AI vs AI matches (pair up remaining opponents)
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
    BEGIN
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
        v_w_legs := (floor(random() * 2) + 2)::SMALLINT;
        v_l_legs := (floor(random() * v_w_legs))::SMALLINT;

        -- Update winner
        UPDATE career_league_standings SET
          played = played + 1, won = won + 1,
          legs_for = legs_for + v_w_legs, legs_against = legs_against + v_l_legs,
          points = points + 2
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_home_id ELSE v_away_id END;

        -- Update loser
        UPDATE career_league_standings SET
          played = played + 1, lost = lost + 1,
          legs_for = legs_for + v_l_legs, legs_against = legs_against + v_w_legs
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_away_id ELSE v_home_id END;

        v_idx := v_idx + 2;
      END LOOP;
    END ai_sim;
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
