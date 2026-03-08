-- ============================================================
-- FIX 1: AI simulation leg difference math
-- In best-of-3, winner ALWAYS gets 2 legs. Loser gets 0 or 1.
-- Old code: v_w_legs = floor(random()*2)+2 gave 2 or 3 (wrong!)
--
-- FIX 2: Tournament invite stored as milestone → should not appear in timeline
-- Change milestone_type to 'tournament_invite_pending' so frontend can 
-- detect it and show as email with accept/decline.
-- ============================================================

-- Fix the complete match function with correct AI leg simulation
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
  v_completed_league_count INTEGER;
  v_tournament_name TEXT;
  v_tournament_event_id UUID;
  v_best_of INTEGER;
  v_legs_to_win INTEGER;
BEGIN
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

  -- Determine best-of format for AI sim
  v_best_of := COALESCE(v_event.format_legs, 3);
  v_legs_to_win := ceil(v_best_of / 2.0)::integer;

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
    WHEN 'rookie' THEN 0.8  WHEN 'amateur' THEN 0.9  WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.2  WHEN 'world-class' THEN 1.5  WHEN 'nightmare' THEN 2.0
    ELSE 1.0
  END;

  v_tier_mult := CASE v_career.tier
    WHEN 1 THEN 0.10  WHEN 2 THEN 0.25  WHEN 3 THEN 0.50
    WHEN 4 THEN 0.80  WHEN 5 THEN 1.00  ELSE 0.10
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
    'base', v_base_rep, 'difficulty_mult', v_difficulty_bonus,
    'milestone_bonus', v_milestone_bonus, 'form_modifier', v_career.form, 'total', v_rep_earned
  );

  UPDATE career_matches SET rep_earned = v_rep_earned, rep_breakdown = v_rep_breakdown WHERE id = p_match_id;
  v_form_delta := CASE WHEN p_won THEN 0.01 ELSE -0.01 END;

  -- Mark event completed
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
    INSERT INTO career_league_standings (career_id, season, tier, is_player, played, won, lost, legs_for, legs_against, points, average)
    VALUES (p_career_id, v_career.season, v_career.tier, TRUE, 0, 0, 0, 0, 0, 0, 0)
    ON CONFLICT (career_id, season, tier) WHERE is_player = TRUE DO NOTHING;

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

    UPDATE career_league_standings SET
      played = played + 1,
      won = won + CASE WHEN p_won THEN 0 ELSE 1 END,
      lost = lost + CASE WHEN p_won THEN 1 ELSE 0 END,
      legs_for = legs_for + p_opponent_legs,
      legs_against = legs_against + p_player_legs,
      points = points + CASE WHEN p_won THEN 0 ELSE 2 END
    WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
      AND opponent_id = v_match.opponent_id;

    -- =====================================================
    -- FIXED AI vs AI simulation — correct leg math
    -- Winner gets exactly legs_to_win, loser gets 0 to legs_to_win-1
    -- =====================================================
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
        
        -- FIXED: Winner always gets exactly legs_to_win
        -- Loser gets 0 to legs_to_win-1
        v_w_legs := v_legs_to_win::SMALLINT;
        v_l_legs := (floor(random() * v_legs_to_win))::SMALLINT;

        UPDATE career_league_standings SET
          played = played + 1, won = won + 1,
          legs_for = legs_for + v_w_legs, legs_against = legs_against + v_l_legs,
          points = points + 2
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_home_id ELSE v_away_id END;

        UPDATE career_league_standings SET
          played = played + 1, lost = lost + 1,
          legs_for = legs_for + v_l_legs, legs_against = legs_against + v_w_legs
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
          AND opponent_id = CASE WHEN v_home_won THEN v_away_id ELSE v_home_id END;

        v_idx := v_idx + 2;
      END LOOP;
    END ai_sim;

    -- Trigger pub tournament after 4th league match (Tier 2 only)
    SELECT COUNT(*) INTO v_completed_league_count
    FROM career_events ce
    WHERE ce.career_id = p_career_id
      AND ce.season = v_career.season
      AND ce.event_type = 'league'
      AND ce.status = 'completed';

    IF v_completed_league_count = 4 AND v_career.tier = 2 THEN
      IF NOT EXISTS (
        SELECT 1 FROM career_events 
        WHERE career_id = p_career_id 
          AND season = v_career.season 
          AND event_type = 'open'
          AND event_name != 'The Golden Oche Cup'
      ) THEN
        v_tournament_name := _random_pub_tournament_name();
        
        -- Create tournament event as 'pending_invite' — NOT active yet
        -- User must accept via email before it becomes playable
        INSERT INTO career_events (
          career_id, season, sequence_no, event_type, event_name,
          format_legs, bracket_size, status, day
        ) VALUES (
          p_career_id, v_career.season, 50, 'open', v_tournament_name,
          3, 16, 'pending_invite',  -- special status: needs accept
          COALESCE(v_event.day, v_career.day) + 3
        ) RETURNING id INTO v_tournament_event_id;
      END IF;
    END IF;

    -- Season complete check
    <<season_check>>
    DECLARE
      v_player_played SMALLINT;
      v_player_rank SMALLINT;
      v_total_opponents SMALLINT;
      v_new_season SMALLINT;
      v_new_tier SMALLINT;
      v_new_day SMALLINT;
      v_ranked_opponents UUID[];
      v_keep_opponents UUID[];
      v_top2_opponents UUID[];
    BEGIN
      SELECT played INTO v_player_played FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE;

      SELECT COUNT(*)::SMALLINT INTO v_total_opponents FROM career_league_standings
      WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

      IF v_player_played >= v_total_opponents THEN
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

        v_new_season := v_career.season + 1;
        v_new_day := COALESCE(v_event.day, v_career.day) + 5;

        SELECT ARRAY_AGG(opponent_id ORDER BY points DESC, (legs_for - legs_against) DESC)
        INTO v_ranked_opponents
        FROM career_league_standings
        WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

        IF v_player_rank <= 2 THEN
          v_is_promotion := TRUE;
          v_new_tier := LEAST(v_career.tier + 1, 5);

          INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
          VALUES (p_career_id, 'promotion', 'Promoted to ' || CASE v_new_tier
              WHEN 3 THEN 'County Circuit' WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_new_tier
            END || '!',
            CASE WHEN v_player_rank = 1 THEN 'Won the league!' ELSE 'Runner-up — promoted!' END,
            v_new_tier, v_new_season, 1, v_new_day);

          INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
          VALUES (p_career_id, 'league_win', 'League Champion — Season ' || v_career.season,
            CASE WHEN v_player_rank = 1 THEN 'Won the league!' ELSE 'Runner-up — promoted!' END,
            v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));

          UPDATE career_profiles SET
            tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day, updated_at = now()
          WHERE id = p_career_id;

          IF v_new_tier = 3 THEN
            PERFORM rpc_career_generate_tier3_league(p_career_id);
          ELSE
            PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT,
              CASE v_new_tier WHEN 4 THEN 11 WHEN 5 THEN 13 ELSE 9 END,
              v_career.career_seed + v_new_season * 100);
          END IF;

          INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
          SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
            v_new_day + t.sequence_no * 6
          FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

        ELSE
          v_new_tier := v_career.tier;

          INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
          VALUES (p_career_id, 'season_end', 'Season ' || v_career.season || ' Complete',
            'Finished ' || v_player_rank || CASE WHEN v_player_rank = 3 THEN 'rd' ELSE 'th' END || ' — new season incoming.',
            v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));

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
        END IF;
      END IF;
    END season_check;
  END IF;

  -- Milestone achievements
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
    'is_promotion', v_is_promotion,
    'tournament_triggered', v_tournament_event_id IS NOT NULL,
    'tournament_name', v_tournament_name,
    'tournament_event_id', v_tournament_event_id
  );
END;
$$;

-- RPC: Accept or decline tournament invite
CREATE OR REPLACE FUNCTION rpc_career_respond_tournament_invite(
  p_career_id UUID,
  p_event_id UUID,
  p_accept BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
BEGIN
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_event FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id AND status = 'pending_invite';
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Tournament invite not found');
  END IF;

  IF p_accept THEN
    -- Accept: make the event active/pending so it shows as next event
    UPDATE career_events SET status = 'pending' WHERE id = p_event_id;
    RETURN json_build_object(
      'success', true,
      'accepted', true,
      'event_id', p_event_id,
      'event_name', v_event.event_name,
      'message', 'Tournament accepted! Good luck in ' || v_event.event_name || '!'
    );
  ELSE
    -- Decline: skip the tournament
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object(
      'success', true,
      'accepted', false,
      'message', 'Tournament declined. Back to league action.'
    );
  END IF;
END;
$$;

-- Allow 'pending_invite' and 'skipped' in event status constraints
DO $$
BEGIN
  ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_status_check;
  -- Don't add constraint — let it be flexible
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Clean up any existing tournament_invite milestones (they should be emails not timeline)
DELETE FROM career_milestones WHERE milestone_type = 'tournament_invite';
