-- FIX: T1→T2 promotion now fully sets up Pub Leagues
-- The bracket completion RPC was only updating tier + milestone,
-- but NOT generating opponents, standings, or events.
-- This creates a complete T2 season on promotion.

-- ============================================================
-- STEP 1: Fix the bracket completion RPC
-- ============================================================

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

  -- ============================================================
  -- REALISTIC FAN REWARDS BY TIER + EVENT TYPE + PLACEMENT
  -- ============================================================
  IF v_career.tier = 1 THEN
    v_base_rep := CASE
      WHEN p_player_won_tournament THEN 50
      WHEN v_placement = 'Runner-Up' THEN 25
      WHEN v_placement = 'Semi-Finalist' THEN 12
      WHEN v_placement = 'Quarter-Finalist' THEN 5
      ELSE 2
    END;
  ELSIF v_career.tier = 2 THEN
    v_base_rep := CASE
      WHEN p_player_won_tournament THEN 200
      WHEN v_placement = 'Runner-Up' THEN 100
      WHEN v_placement = 'Semi-Finalist' THEN 50
      WHEN v_placement = 'Quarter-Finalist' THEN 20
      ELSE 8
    END;
  ELSIF v_career.tier = 3 THEN
    IF v_event.event_name ILIKE '%major%' OR v_event.event_name ILIKE '%championship%' THEN
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 800
        WHEN v_placement = 'Runner-Up' THEN 400
        WHEN v_placement = 'Semi-Finalist' THEN 200
        WHEN v_placement = 'Quarter-Finalist' THEN 80
        ELSE 30
      END;
    ELSE
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 500
        WHEN v_placement = 'Runner-Up' THEN 250
        WHEN v_placement = 'Semi-Finalist' THEN 120
        WHEN v_placement = 'Quarter-Finalist' THEN 50
        ELSE 20
      END;
    END IF;
  ELSIF v_career.tier = 4 THEN
    IF v_event.event_name ILIKE '%finals%' OR v_event.event_name ILIKE '%season%final%' THEN
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 5000
        WHEN v_placement = 'Runner-Up' THEN 2500
        WHEN v_placement = 'Semi-Finalist' THEN 1200
        WHEN v_placement = 'Quarter-Finalist' THEN 500
        ELSE 200
      END;
    ELSE
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 2500
        WHEN v_placement = 'Runner-Up' THEN 1200
        WHEN v_placement = 'Semi-Finalist' THEN 600
        WHEN v_placement = 'Quarter-Finalist' THEN 250
        ELSE 80
      END;
    END IF;
  ELSIF v_career.tier >= 5 THEN
    IF v_event.event_type LIKE 'champions_series%' THEN
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 10000
        WHEN v_placement = 'Runner-Up' THEN 5000
        WHEN v_placement = 'Semi-Finalist' THEN 2500
        WHEN v_placement = 'Quarter-Finalist' THEN 1000
        ELSE 400
      END;
    ELSIF v_event.event_name ILIKE '%world%series%' OR v_event.event_name ILIKE '%grand%slam%' THEN
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 20000
        WHEN v_placement = 'Runner-Up' THEN 10000
        WHEN v_placement = 'Semi-Finalist' THEN 5000
        WHEN v_placement = 'Quarter-Finalist' THEN 2000
        ELSE 800
      END;
    ELSIF v_event.event_name ILIKE '%major%' OR v_event.event_name ILIKE '%world%championship%' THEN
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 15000
        WHEN v_placement = 'Runner-Up' THEN 7500
        WHEN v_placement = 'Semi-Finalist' THEN 3500
        WHEN v_placement = 'Quarter-Finalist' THEN 1500
        ELSE 600
      END;
    ELSE
      v_base_rep := CASE
        WHEN p_player_won_tournament THEN 8000
        WHEN v_placement = 'Runner-Up' THEN 4000
        WHEN v_placement = 'Semi-Finalist' THEN 2000
        WHEN v_placement = 'Quarter-Finalist' THEN 800
        ELSE 300
      END;
    END IF;
  ELSE
    v_base_rep := 10;
  END IF;

  v_difficulty_bonus := 1.0 + (COALESCE(v_career.form, 0.0) * 0.1);
  v_rep_earned := GREATEST(1, (v_base_rep * v_difficulty_bonus)::BIGINT);

  UPDATE career_profiles SET
    rep = rep + v_rep_earned,
    updated_at = now()
  WHERE id = p_career_id;

  v_form_delta := CASE
    WHEN p_player_won_tournament THEN 0.15
    WHEN v_placement = 'Runner-Up' THEN 0.08
    WHEN v_placement = 'Semi-Finalist' THEN 0.03
    WHEN v_rounds_from_end >= 3 THEN -0.05
    ELSE -0.02
  END;

  UPDATE career_profiles SET form = GREATEST(-1.0, LEAST(1.0, COALESCE(form, 0) + v_form_delta)) WHERE id = p_career_id;

  UPDATE career_events SET status = 'completed' WHERE id = p_event_id;
  UPDATE career_brackets SET status = 'completed' WHERE id = p_bracket_id;

  -- Insert career_matches for each match played in the bracket
  IF p_matches_played IS NOT NULL AND jsonb_array_length(p_matches_played) > 0 THEN
    INSERT INTO career_matches (career_id, event_id, opponent_id, won, player_legs, opponent_legs, player_average, opponent_average, player_checkout_pct, player_180s, player_highest_checkout, played_at)
    SELECT
      p_career_id,
      p_event_id,
      CASE WHEN (m->>'opponent_id') IS NOT NULL AND (m->>'opponent_id') != '' THEN (m->>'opponent_id')::UUID ELSE NULL END,
      (m->>'won')::BOOLEAN,
      COALESCE((m->>'player_legs')::SMALLINT, 0),
      COALESCE((m->>'opponent_legs')::SMALLINT, 0),
      COALESCE((m->>'player_average')::REAL, 0),
      COALESCE((m->>'opponent_average')::REAL, 0),
      COALESCE((m->>'player_checkout_pct')::REAL, 0),
      COALESCE((m->>'player_180s')::SMALLINT, 0),
      COALESCE((m->>'player_highest_checkout')::SMALLINT, 0),
      now()
    FROM jsonb_array_elements(p_matches_played) AS m;
  END IF;

  -- Q-school winner milestone for promotion tracking
  IF v_career.tier = 4 AND p_player_won_tournament AND v_event.event_name ILIKE '%tour school%' THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, day)
    VALUES (p_career_id, 'q_school_winner',
      'Tour School Champion',
      'Won the Tour School Playoff - earned promotion!',
      4, v_career.season, v_career.day);
  END IF;

  -- ============================================================
  -- Tier 1 auto-promote to Tier 2 on reaching the final
  -- NOW with full T2 setup: opponents, standings, events
  -- ============================================================
  IF v_career.tier = 1 AND (v_placement = 'Winner' OR v_placement = 'Runner-Up') THEN
    -- Update profile to T2
    UPDATE career_profiles SET
      tier = 2, season = 1, week = 1, day = 1, updated_at = now()
    WHERE id = p_career_id;

    -- Promotion milestone
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, day)
    VALUES (p_career_id, 'promotion', 'Welcome to the Pub Leagues!',
      'Your performance in ' || COALESCE(v_event.event_name, 'a tournament') || ' earned you a spot in the Pub Leagues.',
      2, 1, 1);

    -- Generate 7 T2 opponents
    PERFORM rpc_generate_career_opponents(p_career_id, 2::SMALLINT, 7,
      v_career.career_seed + 100);

    -- Create player standings row
    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, 1, 2, TRUE);

    -- Create opponent standings rows
    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, 1, 2, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = 2
    ORDER BY created_at DESC
    LIMIT 7;

    -- Create league events from schedule templates
    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day, status)
    SELECT p_career_id, t.id, 1, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      1 + t.sequence_no * 6, 'pending'
    FROM career_schedule_templates t WHERE t.tier = 2 ORDER BY t.sequence_no;
  END IF;

  RETURN json_build_object(
    'success', true,
    'placement', v_placement,
    'rep_earned', v_rep_earned,
    'won_tournament', p_player_won_tournament,
    'form_delta', v_form_delta,
    'event_type', v_event.event_type,
    'event_name', v_event.event_name,
    'new_tier', CASE WHEN v_career.tier = 1 AND (v_placement = 'Winner' OR v_placement = 'Runner-Up') THEN 2 ELSE v_career.tier END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_complete_bracket_event(UUID, UUID, UUID, BOOLEAN, SMALLINT, SMALLINT, JSONB) TO authenticated;

-- ============================================================
-- STEP 2: Fix existing broken T2 careers (already promoted but missing data)
-- ============================================================
DO $$
DECLARE
  v_career RECORD;
  v_opponent_count INT;
  v_standings_count INT;
  v_events_count INT;
BEGIN
  FOR v_career IN
    SELECT cp.id, cp.tier, cp.season, cp.career_seed
    FROM career_profiles cp
    WHERE cp.tier = 2 AND cp.status = 'active'
  LOOP
    -- Check opponents
    SELECT COUNT(*) INTO v_opponent_count
    FROM career_opponents WHERE career_id = v_career.id AND tier = 2;

    -- Check standings
    SELECT COUNT(*) INTO v_standings_count
    FROM career_league_standings WHERE career_id = v_career.id AND season = v_career.season AND tier = 2;

    -- Check events
    SELECT COUNT(*) INTO v_events_count
    FROM career_events WHERE career_id = v_career.id AND season = v_career.season AND status IN ('pending', 'active');

    RAISE NOTICE 'Career %: opponents=%, standings=%, events=%', v_career.id, v_opponent_count, v_standings_count, v_events_count;

    -- Generate opponents if missing
    IF v_opponent_count < 7 THEN
      RAISE NOTICE '  -> Generating 7 opponents for career %', v_career.id;
      PERFORM rpc_generate_career_opponents(v_career.id, 2::SMALLINT, 7, v_career.career_seed + v_career.season * 100);
    END IF;

    -- Create standings if missing
    IF v_standings_count = 0 THEN
      RAISE NOTICE '  -> Creating standings for career %', v_career.id;
      INSERT INTO career_league_standings (career_id, season, tier, is_player)
      VALUES (v_career.id, v_career.season, 2, TRUE);

      INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
      SELECT v_career.id, v_career.season, 2, id, FALSE
      FROM career_opponents
      WHERE career_id = v_career.id AND tier = 2
      ORDER BY created_at DESC
      LIMIT 7;
    ELSIF v_standings_count > 0 THEN
      -- Fix any standings missing opponent_id
      UPDATE career_league_standings ls
      SET opponent_id = sub.oid
      FROM (
        SELECT ls2.id as lsid, co.id as oid
        FROM career_league_standings ls2
        CROSS JOIN career_opponents co
        WHERE ls2.career_id = v_career.id AND ls2.season = v_career.season AND ls2.is_player = FALSE AND ls2.opponent_id IS NULL
          AND co.career_id = v_career.id AND co.tier = 2
          AND co.id NOT IN (SELECT opponent_id FROM career_league_standings WHERE career_id = v_career.id AND season = v_career.season AND opponent_id IS NOT NULL)
        LIMIT 1
      ) sub
      WHERE ls.id = sub.lsid;
    END IF;

    -- Create events if missing
    IF v_events_count = 0 THEN
      RAISE NOTICE '  -> Creating league events for career %', v_career.id;
      INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day, status)
      SELECT v_career.id, t.id, v_career.season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
        1 + t.sequence_no * 6, 'pending'
      FROM career_schedule_templates t WHERE t.tier = 2 ORDER BY t.sequence_no;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
