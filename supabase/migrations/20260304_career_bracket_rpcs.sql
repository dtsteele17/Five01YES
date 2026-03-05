-- ============================================================
-- Career Mode: Bracket Event RPCs
-- ============================================================

-- Initialize bracket for an open/qualifier/trial event
-- Returns the bracket data + first opponent for the player
CREATE OR REPLACE FUNCTION rpc_career_init_bracket_event(
  p_career_id UUID,
  p_event_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_bracket_size INT;
  v_participants JSONB := '[]'::JSONB;
  v_opponent RECORD;
  v_bracket_id UUID;
  v_count INT := 0;
  v_difficulty_mult REAL;
  v_player_seed INT;
BEGIN
  -- Validate
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  SELECT * INTO v_event FROM career_events
    WHERE id = p_event_id AND career_id = p_career_id;
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'Event not found');
  END IF;

  -- Check if bracket already exists
  SELECT id INTO v_bracket_id FROM career_brackets
    WHERE event_id = p_event_id AND career_id = p_career_id;
  IF v_bracket_id IS NOT NULL THEN
    -- Check if bracket has real data (matches populated by client)
    DECLARE
      v_bd JSONB;
    BEGIN
      SELECT bracket_data INTO v_bd FROM career_brackets WHERE id = v_bracket_id;
      IF v_bd IS NOT NULL AND v_bd != '{}'::JSONB AND v_bd != '[]'::JSONB AND jsonb_typeof(v_bd) = 'object' AND v_bd ? 'matches' THEN
        -- Bracket has real data — return it
        RETURN (
          SELECT json_build_object(
            'success', TRUE,
            'bracket_id', b.id,
            'bracket_data', b.bracket_data,
            'bracket_size', b.bracket_size,
            'rounds_total', b.rounds_total,
            'current_round', b.current_round,
            'status', b.status,
            'event_name', v_event.event_name,
            'event_type', v_event.event_type,
            'format_legs', v_event.format_legs
          )
          FROM career_brackets b WHERE b.id = v_bracket_id
        );
      ELSE
        -- Bracket exists but has no real data — delete it so we recreate below
        DELETE FROM career_brackets WHERE id = v_bracket_id;
        v_bracket_id := NULL;
      END IF;
    END;
  END IF;

  v_bracket_size := COALESCE(v_event.bracket_size, 8);

  -- Difficulty multiplier
  v_difficulty_mult := CASE v_career.difficulty
    WHEN 'rookie' THEN 0.7
    WHEN 'amateur' THEN 0.85
    WHEN 'semi-pro' THEN 1.0
    WHEN 'pro' THEN 1.15
    WHEN 'world-class' THEN 1.3
    WHEN 'nightmare' THEN 1.5
    ELSE 1.0
  END;

  -- Add player as participant
  v_player_seed := 1; -- Player gets top seed
  v_participants := v_participants || jsonb_build_object(
    'id', 'player',
    'name', 'You',
    'skill', 50, -- Player skill doesn't affect sim, only real matches
    'archetype', 'allrounder',
    'isPlayer', TRUE,
    'seed', v_player_seed
  );

  -- Pick opponents from career_opponents for this tier (deterministic order using career_seed + event sequence)
  FOR v_opponent IN
    SELECT id, first_name, last_name, nickname, skill_rating, archetype
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_career.tier
    ORDER BY md5(id::TEXT || v_career.career_seed::TEXT || v_event.sequence_no::TEXT)
    LIMIT (v_bracket_size - 1)
  LOOP
    v_count := v_count + 1;
    v_participants := v_participants || jsonb_build_object(
      'id', v_opponent.id,
      'name', v_opponent.first_name || COALESCE(' ''' || v_opponent.nickname || ''' ', ' ') || v_opponent.last_name,
      'skill', ROUND(v_opponent.skill_rating * v_difficulty_mult),
      'archetype', v_opponent.archetype,
      'isPlayer', FALSE,
      'seed', v_count + 1
    );
  END LOOP;

  -- If not enough opponents, generate more
  IF v_count < (v_bracket_size - 1) THEN
    PERFORM rpc_generate_career_opponents(
      p_career_id, v_career.tier::SMALLINT,
      (v_bracket_size - 1 - v_count),
      v_career.career_seed + v_career.season * 1000 + v_career.week * 10
    );
    -- Re-fetch
    FOR v_opponent IN
      SELECT id, first_name, last_name, nickname, skill_rating, archetype
      FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      AND id NOT IN (SELECT (elem->>'id')::UUID FROM jsonb_array_elements(v_participants) elem WHERE elem->>'id' != 'player')
      ORDER BY md5(id::TEXT || v_career.career_seed::TEXT || v_event.sequence_no::TEXT)
      LIMIT (v_bracket_size - 1 - v_count)
    LOOP
      v_count := v_count + 1;
      v_participants := v_participants || jsonb_build_object(
        'id', v_opponent.id,
        'name', v_opponent.first_name || COALESCE(' ''' || v_opponent.nickname || ''' ', ' ') || v_opponent.last_name,
        'skill', ROUND(v_opponent.skill_rating * v_difficulty_mult),
        'archetype', v_opponent.archetype,
        'isPlayer', FALSE,
        'seed', v_count + 1
      );
    END LOOP;
  END IF;

  -- Mark event as active (only if still pending)
  UPDATE career_events SET status = 'active' WHERE id = p_event_id AND status = 'pending';

  -- Create bracket record (bracket_data will be generated client-side on first load and saved back)
  INSERT INTO career_brackets (event_id, career_id, bracket_size, rounds_total, current_round, bracket_data, status)
  VALUES (p_event_id, p_career_id, v_bracket_size, (log(2, v_bracket_size))::SMALLINT, 1, '{}'::JSONB, 'active')
  RETURNING id INTO v_bracket_id;

  RETURN json_build_object(
    'success', TRUE,
    'bracket_id', v_bracket_id,
    'participants', v_participants,
    'bracket_size', v_bracket_size,
    'rounds_total', (log(2, v_bracket_size))::INT,
    'format_legs', v_event.format_legs,
    'event_name', v_event.event_name,
    'event_type', v_event.event_type
  );
END;
$$;

-- Save bracket state (called after each round from client)
CREATE OR REPLACE FUNCTION rpc_career_save_bracket(
  p_bracket_id UUID,
  p_bracket_data JSONB,
  p_current_round SMALLINT,
  p_winner_id TEXT DEFAULT NULL,
  p_player_eliminated_round SMALLINT DEFAULT NULL,
  p_completed BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_bracket career_brackets;
BEGIN
  SELECT b.* INTO v_bracket FROM career_brackets b
    JOIN career_profiles cp ON cp.id = b.career_id
    WHERE b.id = p_bracket_id AND cp.user_id = v_user_id;

  IF v_bracket.id IS NULL THEN
    RETURN json_build_object('error', 'Bracket not found');
  END IF;

  UPDATE career_brackets SET
    bracket_data = p_bracket_data,
    current_round = p_current_round,
    winner_id = CASE WHEN p_winner_id IS NOT NULL AND p_winner_id != 'player' THEN p_winner_id::UUID ELSE NULL END,
    player_eliminated_round = p_player_eliminated_round,
    status = CASE WHEN p_completed THEN 'completed' ELSE 'active' END
  WHERE id = p_bracket_id;

  RETURN json_build_object('success', TRUE);
END;
$$;

-- Complete a bracket event (called when tournament ends)
CREATE OR REPLACE FUNCTION rpc_career_complete_bracket_event(
  p_career_id UUID,
  p_event_id UUID,
  p_bracket_id UUID,
  p_player_won_tournament BOOLEAN,
  p_player_eliminated_round SMALLINT DEFAULT NULL,
  p_total_rounds SMALLINT DEFAULT 3,
  p_matches_played JSONB DEFAULT '[]'::JSONB  -- array of {won, player_legs, opponent_legs, opponent_id, player_avg, player_180s, player_highest_checkout}
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
        WHEN 'trial_tournament' THEN 200
        WHEN 'open' THEN 400
        WHEN 'qualifier' THEN 500
        WHEN 'major' THEN 1000
        WHEN 'season_finals' THEN 1500
        ELSE 300
      END
    WHEN v_placement = 'Runner-Up' THEN
      CASE v_event.event_type
        WHEN 'trial_tournament' THEN 100
        WHEN 'open' THEN 200
        WHEN 'qualifier' THEN 250
        WHEN 'major' THEN 500
        WHEN 'season_finals' THEN 750
        ELSE 150
      END
    WHEN v_placement = 'Semi-Finalist' THEN
      CASE v_event.event_type
        WHEN 'trial_tournament' THEN 50
        WHEN 'open' THEN 100
        WHEN 'qualifier' THEN 125
        WHEN 'major' THEN 250
        ELSE 75
      END
    ELSE 25
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

  -- Tier multiplier: Tier 1 is almost nothing, scales up
  v_tier_mult := CASE v_career.tier
    WHEN 1 THEN 0.10
    WHEN 2 THEN 0.25
    WHEN 3 THEN 0.50
    WHEN 4 THEN 0.80
    WHEN 5 THEN 1.00
    ELSE 0.10
  END;
  v_rep_earned := ROUND(v_base_rep * v_difficulty_bonus * v_tier_mult * (1.0 + v_career.form));

  -- Form update based on tournament performance
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
      day = COALESCE(v_event.day, day), -- Tournament rounds played same day
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
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    SELECT p_career_id, 'first_tournament_win', 'Tournament Champion!', 'Won your first tournament: ' || v_event.event_name, v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day)
    WHERE NOT EXISTS (SELECT 1 FROM career_milestones WHERE career_id = p_career_id AND milestone_type = 'first_tournament_win');
  END IF;

  -- Tier 1 progression check
  IF v_career.tier = 1 THEN
    -- Check Tier 1 trial rules
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

      -- Add loss milestone if didn't win (for email generation)
      IF NOT p_player_won_tournament AND NOT v_reached_final THEN
        INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
        VALUES (p_career_id, 'tournament_loss', 'Eliminated: ' || v_event.event_name,
          'Knocked out in ' || v_placement || ' of ' || v_event.event_name,
          v_career.tier, v_career.season, v_career.week, COALESCE(v_event.day, v_career.day));
      END IF;
      v_is_retry := (v_event_seq >= 2);

      IF v_event_seq = 1 THEN
        -- First tournament: need to reach the final to promote
        IF v_reached_final THEN
          v_should_promote := TRUE;
          v_promo_message := 'I''m giving the pub leagues a shot.';
        END IF;
      ELSIF v_event_seq = 2 THEN
        -- Second tournament: need at least semi-final
        IF v_reached_final THEN
          v_should_promote := TRUE;
          v_promo_message := 'Alright, I''m giving the pub leagues a real shot.';
        ELSIF v_reached_semi THEN
          v_should_promote := TRUE;
          v_promo_message := 'Well… got to start somewhere.';
        ELSE
          -- Didn't reach semi — insert training event, then promotion event after
          -- Mark remaining trial tournaments as skipped
          UPDATE career_events SET status = 'skipped'
          WHERE career_id = p_career_id AND sequence_no > v_event_seq AND status = 'pending';
          -- Training event
          INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
          VALUES (p_career_id, v_career.season, 90, 'training', 'Extra Practice Session', 3,
            COALESCE(v_event.day, v_career.day) + 2, 'pending');
          -- Auto-promotion event (will be picked up by rpc_career_play_next_event)
          INSERT INTO career_events (career_id, season, sequence_no, event_type, event_name, format_legs, day, status)
          VALUES (p_career_id, v_career.season, 91, 'promotion', 'Time for the Pub Leagues', 3,
            COALESCE(v_event.day, v_career.day) + 3, 'pending');
        END IF;
      ELSIF v_event_seq = 3 OR v_event.event_type = 'training' THEN
        -- Third tournament or post-training: promote regardless
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
        -- Promote to Tier 2
        UPDATE career_profiles SET
          tier = 2,
          season = 1,
          week = 1,
          day = COALESCE(v_event.day, v_career.day) + 3, -- few days rest before league starts
          updated_at = now()
        WHERE id = p_career_id;

        -- Seed Tier 2 events with day assignments (relative to current career day)
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

        -- Generate Tier 2 opponents
        PERFORM rpc_generate_career_opponents(p_career_id, 2::SMALLINT, 15, v_career.career_seed + 200);

        -- Seed league standings with AI opponents
        INSERT INTO career_league_standings (career_id, season, tier, is_player)
        VALUES (p_career_id, 1, 2, TRUE);

        -- Add 7 AI league opponents to standings
        INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
        SELECT p_career_id, 1, 2, id, FALSE
        FROM career_opponents
        WHERE career_id = p_career_id AND tier = 2 AND is_rival = FALSE
        ORDER BY random()
        LIMIT 7;

        -- Promotion milestone
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
