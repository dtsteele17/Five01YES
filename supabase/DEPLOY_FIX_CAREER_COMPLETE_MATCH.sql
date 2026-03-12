DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'rpc_career_complete_match'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

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
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Career not found'); END IF;

  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Match not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;

  UPDATE career_matches SET
    result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    player_average = p_player_average,
    opponent_average = p_opponent_average,
    player_checkout_pct = p_player_checkout_pct,
    player_180s = p_player_180s,
    player_highest_checkout = p_player_highest_checkout
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

  CASE v_career.tier
    WHEN 1 THEN v_rep_base := 3;
    WHEN 2 THEN v_rep_base := 5;
    WHEN 3 THEN v_rep_base := 12;
    WHEN 4 THEN v_rep_base := 35;
    WHEN 5 THEN v_rep_base := 150;
    ELSE v_rep_base := 3;
  END CASE;

  IF p_won THEN
    v_rep_earned := v_rep_base;

    SELECT COUNT(*) INTO v_streak FROM (
      SELECT result FROM career_matches
      WHERE career_id = p_career_id AND result IS NOT NULL
      ORDER BY id DESC LIMIT 10
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
      ORDER BY id DESC LIMIT 5
    ) sub WHERE sub.result = 'loss';

    IF v_streak >= 4 THEN
      v_loss_penalty := ceil(v_rep_base * 0.3);
    ELSIF v_streak >= 3 THEN
      v_loss_penalty := ceil(v_rep_base * 0.15);
    END IF;
    v_rep_earned := GREATEST(1, ceil(v_rep_base * 0.2)) - v_loss_penalty;
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
