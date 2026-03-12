-- =============================================================
-- Tour School: Convert from broken individual match events
-- to a proper 4-player bracket tournament
-- =============================================================

-- 1. Allow bracket_size = 4 for Tour School
ALTER TABLE career_brackets DROP CONSTRAINT IF EXISTS career_brackets_bracket_size_check;
ALTER TABLE career_brackets ADD CONSTRAINT career_brackets_bracket_size_check
  CHECK (bracket_size IN (4, 8, 16, 32));

-- 2. Replace rpc_tier4_q_school to create a bracket event instead of individual matches
DROP FUNCTION IF EXISTS rpc_tier4_q_school(UUID);
CREATE OR REPLACE FUNCTION rpc_tier4_q_school(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_event_id UUID;
  v_bracket_id UUID;
  v_bracket_data JSONB;
  -- Variables for getting ranked opponents
  v_rank3_name TEXT; v_rank3_id UUID;
  v_rank4_name TEXT; v_rank4_id UUID;
  v_rank5_name TEXT; v_rank5_id UUID;
  v_rank6_name TEXT; v_rank6_id UUID;
  v_standings JSONB;
BEGIN
  -- Validate career
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND OR v_career.tier != 4 THEN
    RETURN json_build_object('error', 'Not a Tier 4 career');
  END IF;

  -- Calculate player rank
  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = 4
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = 4 AND is_player = TRUE)));

  IF v_player_rank < 3 OR v_player_rank > 6 THEN
    RETURN json_build_object('error', 'Player rank ' || v_player_rank || ' does not qualify for Tour School (3rd-6th only)');
  END IF;

  -- Check if already created
  IF EXISTS (
    SELECT 1 FROM career_events WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'q_school'
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  -- Also clean up any old-style q_school_semi/q_school_final events
  DELETE FROM career_events WHERE career_id = p_career_id AND season = v_career.season
    AND event_type IN ('q_school_semi', 'q_school_final');

  -- Get the 3rd through 6th place opponents from standings
  -- We need their names and IDs for the bracket
  SELECT ls.opponent_id, co.first_name || ' ' || co.last_name
  INTO v_rank3_id, v_rank3_name
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = 4 AND ls.is_player = FALSE
  ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
  OFFSET 1 LIMIT 1;  -- offset 1 = 3rd place (after top 2)

  SELECT ls.opponent_id, co.first_name || ' ' || co.last_name
  INTO v_rank4_id, v_rank4_name
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = 4 AND ls.is_player = FALSE
  ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
  OFFSET 2 LIMIT 1;  -- offset 2 = 4th place

  SELECT ls.opponent_id, co.first_name || ' ' || co.last_name
  INTO v_rank5_id, v_rank5_name
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = 4 AND ls.is_player = FALSE
  ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
  OFFSET 3 LIMIT 1;  -- offset 3 = 5th place

  SELECT ls.opponent_id, co.first_name || ' ' || co.last_name
  INTO v_rank6_id, v_rank6_name
  FROM career_league_standings ls
  JOIN career_opponents co ON co.id = ls.opponent_id
  WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = 4 AND ls.is_player = FALSE
  ORDER BY ls.points DESC, (ls.legs_for - ls.legs_against) DESC
  OFFSET 4 LIMIT 1;  -- offset 4 = 6th place

  -- Build the bracket data for 4-player single elimination
  -- Semi 1: 3rd vs 6th, Semi 2: 4th vs 5th
  -- The player can be in any of these positions (3rd, 4th, 5th, or 6th)
  v_bracket_data := jsonb_build_array(
    -- Semi-Final 1: 3rd vs 6th
    jsonb_build_object(
      'round', 1, 'matchIndex', 0,
      'participant1', CASE WHEN v_player_rank = 3 THEN jsonb_build_object('type', 'player', 'name', 'You', 'seed', 3)
        ELSE jsonb_build_object('type', 'opponent', 'id', v_rank3_id, 'name', v_rank3_name, 'seed', 3) END,
      'participant2', CASE WHEN v_player_rank = 6 THEN jsonb_build_object('type', 'player', 'name', 'You', 'seed', 6)
        ELSE jsonb_build_object('type', 'opponent', 'id', v_rank6_id, 'name', v_rank6_name, 'seed', 6) END,
      'winner', null, 'score', null, 'status', 'pending'
    ),
    -- Semi-Final 2: 4th vs 5th
    jsonb_build_object(
      'round', 1, 'matchIndex', 1,
      'participant1', CASE WHEN v_player_rank = 4 THEN jsonb_build_object('type', 'player', 'name', 'You', 'seed', 4)
        ELSE jsonb_build_object('type', 'opponent', 'id', v_rank4_id, 'name', v_rank4_name, 'seed', 4) END,
      'participant2', CASE WHEN v_player_rank = 5 THEN jsonb_build_object('type', 'player', 'name', 'You', 'seed', 5)
        ELSE jsonb_build_object('type', 'opponent', 'id', v_rank5_id, 'name', v_rank5_name, 'seed', 5) END,
      'winner', null, 'score', null, 'status', 'pending'
    ),
    -- Final: TBD vs TBD
    jsonb_build_object(
      'round', 2, 'matchIndex', 0,
      'participant1', null,
      'participant2', null,
      'winner', null, 'score', null, 'status', 'pending'
    )
  );

  -- Create the bracket event
  INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, status, day)
  VALUES (p_career_id, v_career.season, 300, 'q_school', 'Tour School Playoff', 9, 4, 'pending', v_career.day + 5)
  RETURNING id INTO v_event_id;

  -- Create the bracket record
  INSERT INTO career_brackets (event_id, career_id, bracket_size, rounds_total, current_round, bracket_data, status)
  VALUES (v_event_id, p_career_id, 4, 2, 1, v_bracket_data, 'active')
  RETURNING id INTO v_bracket_id;

  RETURN json_build_object(
    'success', true,
    'player_rank', v_player_rank,
    'event_id', v_event_id,
    'bracket_id', v_bracket_id,
    'bracket_data', v_bracket_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_tier4_q_school(UUID) TO authenticated;

-- 3. Update rpc_career_complete_bracket_event to handle q_school promotion
-- We add a q_school_winner milestone when the player wins the Tour School bracket
-- The existing advance_season function already checks for this milestone
CREATE OR REPLACE FUNCTION rpc_career_complete_bracket_event(
  p_career_id UUID,
  p_event_id UUID,
  p_bracket_id UUID,
  p_player_won_tournament BOOLEAN,
  p_player_eliminated_round SMALLINT DEFAULT NULL,
  p_total_rounds SMALLINT DEFAULT 3,
  p_matches_played JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_rep_earned BIGINT := 0;
  v_base_rep BIGINT;
  v_placement TEXT;
  v_difficulty_bonus REAL;
  v_tier_mult REAL;
  v_rounds_from_end INT;
  v_form_delta REAL;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;

  -- Calculate placement
  IF p_player_won_tournament THEN
    v_placement := 'Winner';
    v_rounds_from_end := 0;
  ELSIF p_player_eliminated_round IS NOT NULL THEN
    v_rounds_from_end := p_total_rounds - p_player_eliminated_round + 1;
    v_placement := CASE v_rounds_from_end
      WHEN 1 THEN 'Runner-Up'
      WHEN 2 THEN 'Semi-Finalist'
      WHEN 3 THEN 'Quarter-Finalist'
      ELSE 'Round ' || p_player_eliminated_round || ' Exit'
    END;
  ELSE
    v_placement := 'Unknown';
    v_rounds_from_end := p_total_rounds;
  END IF;

  -- Base REP by placement + event type
  v_base_rep := CASE
    WHEN p_player_won_tournament THEN
      CASE v_event.event_type
        WHEN 'trial_tournament' THEN 10
        WHEN 'open' THEN 25
        WHEN 'qualifier' THEN 30
        WHEN 'major' THEN 60
        WHEN 'season_finals' THEN 100
        WHEN 'q_school' THEN 80
        ELSE 20
      END
    WHEN v_placement = 'Runner-Up' THEN
      CASE v_event.event_type
        WHEN 'trial_tournament' THEN 5
        WHEN 'open' THEN 12
        WHEN 'qualifier' THEN 15
        WHEN 'major' THEN 30
        WHEN 'season_finals' THEN 50
        WHEN 'q_school' THEN 40
        ELSE 8
      END
    WHEN v_placement = 'Semi-Finalist' THEN
      CASE v_event.event_type
        WHEN 'trial_tournament' THEN 3
        WHEN 'open' THEN 6
        WHEN 'qualifier' THEN 8
        WHEN 'major' THEN 15
        WHEN 'q_school' THEN 15
        ELSE 4
      END
    ELSE 1
  END;

  -- Difficulty bonus
  v_difficulty_bonus := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.8
    WHEN 'amateur' THEN 0.9
    WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.2
    WHEN 'world-class' THEN 1.5
    WHEN 'nightmare' THEN 2.0
    ELSE 1.0
  END;

  -- Tier multiplier
  v_tier_mult := CASE v_career.tier
    WHEN 1 THEN 0.10
    WHEN 2 THEN 0.25
    WHEN 3 THEN 0.50
    WHEN 4 THEN 0.80
    WHEN 5 THEN 1.00
    ELSE 0.10
  END;
  v_rep_earned := ROUND(v_base_rep * v_difficulty_bonus * v_tier_mult * (1.0 + v_career.form));

  -- Form update
  v_form_delta := CASE
    WHEN p_player_won_tournament THEN 0.02
    WHEN v_placement = 'Runner-Up' THEN 0.01
    WHEN v_placement = 'Semi-Finalist' THEN 0.005
    ELSE -0.01
  END;

  -- Update career
  IF v_career.tier = 1 THEN
    UPDATE career_profiles SET
      rep = rep + v_rep_earned,
      form = GREATEST(-0.05, LEAST(0.05, form + v_form_delta)),
      day = COALESCE(v_event.day, day),
      updated_at = now()
    WHERE id = p_career_id;
  ELSE
    UPDATE career_profiles SET
      rep = rep + v_rep_earned,
      form = GREATEST(-0.05, LEAST(0.05, form + v_form_delta)),
      week = week + 1,
      updated_at = now()
    WHERE id = p_career_id;
  END IF;

  -- Mark event complete
  UPDATE career_events SET status = 'completed', completed_at = now(),
    result = jsonb_build_object(
      'placement', v_placement,
      'won_tournament', p_player_won_tournament,
      'eliminated_round', p_player_eliminated_round,
      'rep_earned', v_rep_earned
    )
  WHERE id = p_event_id;

  -- Mark bracket complete
  UPDATE career_brackets SET status = 'completed' WHERE id = p_bracket_id;

  -- Milestones
  IF p_player_won_tournament THEN
    -- First tournament win (one-time)
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    SELECT p_career_id, 'first_tournament_win', 'Tournament Champion!', 'Won your first tournament: ' || v_event.event_name, v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day)
    WHERE NOT EXISTS (SELECT 1 FROM career_milestones WHERE career_id = p_career_id AND milestone_type = 'first_tournament_win');
    -- Every tournament win
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'tournament_win', v_event.event_name, 'Won ' || v_event.event_name, v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));
  END IF;

  -- ══════════════════════════════════════════════════
  -- TOUR SCHOOL PROMOTION: q_school winner milestone
  -- ══════════════════════════════════════════════════
  IF v_event.event_type = 'q_school' AND p_player_won_tournament THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'q_school_winner', 'Tour School Winner!',
      'Won Tour School to earn promotion to the Pro Tour!',
      v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day))
    ON CONFLICT DO NOTHING;
  END IF;

  -- Tier 1 progression check
  IF v_career.tier = 1 THEN
    DECLARE
      v_event_seq INT;
      v_reached_final BOOLEAN := (p_player_won_tournament OR v_placement = 'Runner-Up');
      v_reached_semi BOOLEAN := (v_placement = 'Semi-Finalist' OR v_reached_final);
      v_is_retry BOOLEAN;
      v_should_promote BOOLEAN := FALSE;
      v_promo_message TEXT := '';
      v_next_seq INT;
    BEGIN
      v_event_seq := v_event.sequence_no;
      v_next_seq := v_event_seq + 1;

      IF NOT p_player_won_tournament AND NOT v_reached_final THEN
        INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
        VALUES (p_career_id, 'tournament_loss', 'Eliminated: ' || v_event.event_name,
          'Knocked out in ' || v_placement || ' of ' || v_event.event_name,
          v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));
      END IF;
      v_is_retry := (v_event_seq >= 2);

      IF v_event_seq = 1 THEN
        IF v_reached_final THEN
          v_should_promote := TRUE;
          v_promo_message := 'I''m giving the pub leagues a shot.';
        END IF;
      ELSIF v_event_seq = 2 THEN
        IF v_reached_final THEN
          v_should_promote := TRUE;
          v_promo_message := 'Alright, I''m giving the pub leagues a real shot.';
        ELSIF v_reached_semi THEN
          v_should_promote := TRUE;
          v_promo_message := 'Well… got to start somewhere.';
        ELSE
          UPDATE career_events SET status = 'skipped'
          WHERE career_id = p_career_id AND sequence_no > v_event_seq AND status = 'pending';
          INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
          VALUES (p_career_id, v_career.season, 90, 'training', 'Extra Practice Session', 3,
            COALESCE(v_event.day, v_career.day) + 2, 'pending');
          INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
          VALUES (p_career_id, v_career.season, 91, 'promotion', 'Time for the Pub Leagues', 3,
            COALESCE(v_event.day, v_career.day) + 3, 'pending');
        END IF;
      ELSIF v_event_seq = 3 OR v_event.event_type = 'training' THEN
        v_should_promote := TRUE;
        IF v_reached_final THEN
          v_promo_message := 'Proved myself. Time for the pub leagues.';
        ELSIF v_reached_semi THEN
          v_promo_message := 'Close enough. Let''s see what the pub leagues are about.';
        ELSE
          v_promo_message := 'You''ve worked hard away from the tournaments. Time for the pub leagues.';
        END IF;
      END IF;

      IF v_should_promote THEN
        UPDATE career_profiles SET
          tier = 2, season = 1, week = 1,
          day = COALESCE(v_event.day, v_career.day) + 3,
          updated_at = now()
        WHERE id = p_career_id;

        DECLARE v_start_day SMALLINT := COALESCE(v_event.day, v_career.day) + 3;
        BEGIN
          INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
          SELECT p_career_id, t.id, 1, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
            v_start_day + CASE
              WHEN t.event_type IN ('open','qualifier','major','season_finals') THEN t.sequence_no * 6 - 2
              ELSE t.sequence_no * 6 + 1
            END
          FROM career_schedule_templates t
          WHERE t.tier = 2
          ORDER BY t.sequence_no;
        END;

        PERFORM rpc_generate_career_opponents(p_career_id, 2::SMALLINT, 15, v_career.career_seed + 200);

        INSERT INTO career_league_standings (career_id, season, tier, is_player)
        VALUES (p_career_id, 1, 2, TRUE);

        INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
        SELECT p_career_id, 1, 2, id, FALSE
        FROM career_opponents
        WHERE career_id = p_career_id AND tier = 2 AND is_rival = FALSE
        ORDER BY random()
        LIMIT 7;

        INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
        VALUES (p_career_id, 'promotion_tier2', v_promo_message, 'Promoted to Pub Leagues!', 2, 1, 1, v_career.day);

        RETURN json_build_object(
          'success', TRUE,
          'rep_earned', v_rep_earned,
          'placement', v_placement,
          'promoted', TRUE,
          'new_tier', 2,
          'promo_message', v_promo_message
        );
      END IF;
    END;
  END IF;

  RETURN json_build_object(
    'success', TRUE,
    'rep_earned', v_rep_earned,
    'placement', v_placement,
    'promoted', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_complete_bracket_event(UUID, UUID, UUID, BOOLEAN, SMALLINT, SMALLINT, JSONB) TO authenticated;

-- 4. Drop the old trigger that was attached to career_matches for q_school
DROP TRIGGER IF EXISTS trg_tier4_q_school_winner ON career_matches;
DROP FUNCTION IF EXISTS trg_tier4_q_school_winner();
