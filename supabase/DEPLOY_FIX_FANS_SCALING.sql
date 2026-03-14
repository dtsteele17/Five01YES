-- Realistic fan (rep) scaling based on real darts viewership/following patterns
-- Tier 1 (Local Circuit): pub/local league level — 5-50 fans per event
-- Tier 2 (Open Circuit): regional/county level — 20-200 fans per event
-- Tier 3 (County Circuit): semi-pro level — 100-1000 fans per event
-- Tier 4 (National Tour): professional level — 500-5000 fans per event
-- Tier 5 (Pro Tour): elite/TV level — 2000-25000 fans per event

-- Update match completion (league matches)
CREATE OR REPLACE FUNCTION rpc_career_complete_match(
  p_career_id UUID,
  p_match_id UUID,
  p_won BOOLEAN,
  p_player_legs SMALLINT,
  p_opponent_legs SMALLINT,
  p_player_average REAL DEFAULT 0,
  p_opponent_average REAL DEFAULT 0,
  p_player_checkout_pct REAL DEFAULT 0,
  p_player_180s SMALLINT DEFAULT 0,
  p_player_highest_checkout SMALLINT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_match career_matches;
  v_event career_events;
  v_rep_base INTEGER;
  v_rep_earned INTEGER;
  v_streak INTEGER;
  v_streak_bonus INTEGER := 0;
  v_loss_penalty INTEGER := 0;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Match not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;

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

  UPDATE career_events SET status = 'completed' WHERE id = v_event.id AND status IN ('active', 'pending');

  IF v_event.event_type = 'league' THEN
    IF p_won THEN
      UPDATE career_league_standings SET
        played = played + 1, won = won + 1, points = points + 2,
        legs_for = legs_for + p_player_legs, legs_against = legs_against + p_opponent_legs
      WHERE career_id = p_career_id AND is_player = TRUE AND season = v_career.season AND tier = v_career.tier;
    ELSE
      UPDATE career_league_standings SET
        played = played + 1, lost = lost + 1,
        legs_for = legs_for + p_player_legs, legs_against = legs_against + p_opponent_legs
      WHERE career_id = p_career_id AND is_player = TRUE AND season = v_career.season AND tier = v_career.tier;
    END IF;

    UPDATE career_profiles SET
      week = week + 1, day = day + 7, updated_at = now()
    WHERE id = p_career_id;
  END IF;

  -- Realistic fan gains per league match win by tier
  CASE v_career.tier
    WHEN 1 THEN v_rep_base := 8;       -- Local pub match: ~8 fans
    WHEN 2 THEN v_rep_base := 25;      -- Open circuit: ~25 fans
    WHEN 3 THEN v_rep_base := 80;      -- County circuit: ~80 fans
    WHEN 4 THEN v_rep_base := 250;     -- National tour: ~250 fans
    WHEN 5 THEN v_rep_base := 800;     -- Pro tour league: ~800 fans
    ELSE v_rep_base := 8;
  END CASE;

  IF p_won THEN
    v_rep_earned := v_rep_base;

    SELECT COUNT(*) INTO v_streak FROM (
      SELECT result FROM career_matches
      WHERE career_id = p_career_id AND result IS NOT NULL
      ORDER BY played_at DESC NULLS LAST LIMIT 10
    ) sub WHERE sub.result = 'win';

    IF v_streak >= 5 THEN
      v_streak_bonus := ceil(v_rep_base * 0.5);
    ELSIF v_streak >= 3 THEN
      v_streak_bonus := ceil(v_rep_base * 0.25);
    END IF;
    v_rep_earned := v_rep_earned + v_streak_bonus;
  ELSE
    SELECT COUNT(*) INTO v_streak FROM (
      SELECT result FROM career_matches
      WHERE career_id = p_career_id AND result IS NOT NULL
      ORDER BY played_at DESC NULLS LAST LIMIT 5
    ) sub WHERE sub.result = 'loss';

    IF v_streak >= 4 THEN
      v_loss_penalty := ceil(v_rep_base * 0.3);
    ELSIF v_streak >= 3 THEN
      v_loss_penalty := ceil(v_rep_base * 0.15);
    END IF;
    v_rep_earned := GREATEST(1, ceil(v_rep_base * 0.15)) - v_loss_penalty;
  END IF;

  v_rep_earned := GREATEST(0, v_rep_earned);

  UPDATE career_profiles SET
    rep = GREATEST(0, rep + v_rep_earned), updated_at = now()
  WHERE id = p_career_id;

  RETURN json_build_object(
    'success', true,
    'rep_earned', v_rep_earned,
    'streak_bonus', v_streak_bonus,
    'loss_penalty', v_loss_penalty,
    'won', p_won,
    'player_legs', p_player_legs,
    'opponent_legs', p_opponent_legs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_complete_match(UUID, UUID, BOOLEAN, SMALLINT, SMALLINT, REAL, REAL, REAL, SMALLINT, SMALLINT) TO authenticated;

-- Update bracket/tournament completion with realistic fan scaling
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
  -- Tier 1: Local Circuit (pub darts, small crowds)
  --   Trial tournament win: 50 fans, RU: 25, SF: 12, QF: 5
  -- Tier 2: Open Circuit (regional events, ~50-200 spectators)
  --   Open win: 200, RU: 100, SF: 50, QF: 20
  -- Tier 3: County Circuit (semi-pro, local TV/streaming, ~500 viewers)
  --   Qualifier win: 500, RU: 250, SF: 120, QF: 50
  --   Major: 800 / 400 / 200 / 80
  -- Tier 4: National Tour (professional, regional TV, ~2000-5000 viewers)
  --   Tournament win: 2500, RU: 1200, SF: 600, QF: 250
  --   Season Finals: 5000 / 2500 / 1200 / 500
  -- Tier 5: Pro Tour (elite, Sky Sports level, ~50k-500k viewers)
  --   Players Championship win: 8000, RU: 4000, SF: 2000, QF: 800
  --   Major win: 15000, RU: 7500, SF: 3500, QF: 1500
  --   World Series win: 20000, RU: 10000, SF: 5000, QF: 2000
  --   Champions Series win: 10000, RU: 5000, SF: 2500, QF: 1000

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
    v_base_rep := CASE v_event.event_type
      WHEN 'major' THEN
        CASE WHEN p_player_won_tournament THEN 800
             WHEN v_placement = 'Runner-Up' THEN 400
             WHEN v_placement = 'Semi-Finalist' THEN 200
             ELSE 80 END
      ELSE
        CASE WHEN p_player_won_tournament THEN 500
             WHEN v_placement = 'Runner-Up' THEN 250
             WHEN v_placement = 'Semi-Finalist' THEN 120
             WHEN v_placement = 'Quarter-Finalist' THEN 50
             ELSE 20 END
    END;
  ELSIF v_career.tier = 4 THEN
    v_base_rep := CASE v_event.event_type
      WHEN 'season_finals' THEN
        CASE WHEN p_player_won_tournament THEN 5000
             WHEN v_placement = 'Runner-Up' THEN 2500
             WHEN v_placement = 'Semi-Finalist' THEN 1200
             ELSE 500 END
      ELSE
        CASE WHEN p_player_won_tournament THEN 2500
             WHEN v_placement = 'Runner-Up' THEN 1200
             WHEN v_placement = 'Semi-Finalist' THEN 600
             WHEN v_placement = 'Quarter-Finalist' THEN 250
             ELSE 100 END
    END;
  ELSIF v_career.tier = 5 THEN
    v_base_rep := CASE
      WHEN v_event.event_type IN ('pro_world_series', 'pro_world_series_finals') THEN
        CASE WHEN p_player_won_tournament THEN 20000
             WHEN v_placement = 'Runner-Up' THEN 10000
             WHEN v_placement = 'Semi-Finalist' THEN 5000
             WHEN v_placement = 'Quarter-Finalist' THEN 2000
             ELSE 500 END
      WHEN v_event.event_type = 'pro_major' THEN
        CASE WHEN p_player_won_tournament THEN 15000
             WHEN v_placement = 'Runner-Up' THEN 7500
             WHEN v_placement = 'Semi-Finalist' THEN 3500
             WHEN v_placement = 'Quarter-Finalist' THEN 1500
             ELSE 400 END
      WHEN v_event.event_type LIKE 'champions_series%' THEN
        CASE WHEN p_player_won_tournament THEN 10000
             WHEN v_placement = 'Runner-Up' THEN 5000
             WHEN v_placement = 'Semi-Finalist' THEN 2500
             WHEN v_placement = 'Quarter-Finalist' THEN 1000
             ELSE 300 END
      ELSE -- Players Championship etc
        CASE WHEN p_player_won_tournament THEN 8000
             WHEN v_placement = 'Runner-Up' THEN 4000
             WHEN v_placement = 'Semi-Finalist' THEN 2000
             WHEN v_placement = 'Quarter-Finalist' THEN 800
             ELSE 200 END
    END;
  ELSE
    v_base_rep := 10;
  END IF;

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

  -- No tier multiplier needed — already baked into base values
  v_rep_earned := ROUND(v_base_rep * v_difficulty_bonus * (1.0 + v_career.form));

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
      'total_rounds', p_total_rounds
    )
  WHERE id = p_event_id;

  -- Update bracket status
  UPDATE career_brackets SET status = 'completed' WHERE id = p_bracket_id;

  -- Winner milestone
  IF p_player_won_tournament THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, day)
    VALUES (p_career_id, 'tournament_win',
      COALESCE(v_event.event_name, 'Tournament') || ' - Winner',
      'Won ' || COALESCE(v_event.event_name, 'a tournament') || ' (+' || v_rep_earned || ' fans)',
      v_career.tier, v_career.season, v_career.day);
  END IF;

  -- Q-school winner milestone for promotion tracking
  IF p_player_won_tournament AND v_event.event_type = 'q_school' THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, day)
    VALUES (p_career_id, 'q_school_winner', 'Tour School Champion',
      'Won the Tour School Playoff — earned promotion!',
      v_career.tier, v_career.season, v_career.day);
  END IF;

  RETURN json_build_object(
    'success', true,
    'placement', v_placement,
    'rep_earned', v_rep_earned,
    'won_tournament', p_player_won_tournament,
    'form_delta', v_form_delta,
    'event_type', v_event.event_type,
    'event_name', v_event.event_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_complete_bracket_event(UUID, UUID, UUID, BOOLEAN, SMALLINT, SMALLINT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
