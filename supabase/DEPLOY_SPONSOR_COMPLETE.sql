-- ============================================================
-- Complete sponsor system:
-- 1. Tournament final reach trigger
-- 2. REP bonus application on match wins
-- 3. End-of-season sponsor data for renewal popup
-- ============================================================

-- 1. Check tournament final reach and offer sponsor
CREATE OR REPLACE FUNCTION _check_tournament_final_sponsor(
  p_career_id UUID,
  p_career career_profiles,
  p_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event career_events;
  v_pending_count INT;
  v_total_rounds INT;
  v_completed_matches INT;
BEGIN
  SELECT * INTO v_event FROM career_events WHERE id = p_event_id;
  IF v_event.id IS NULL OR v_event.event_type NOT IN ('open', 'trial_tournament', 'qualifier', 'major') THEN
    RETURN;
  END IF;

  -- Calculate total rounds needed to reach final
  -- bracket_size 8 = 3 rounds (QF, SF, F) → final = round 3 (match 3)
  -- bracket_size 16 = 4 rounds (R1, QF, SF, F) → final = round 4 (match 4)
  v_total_rounds := CASE 
    WHEN v_event.bracket_size = 8 THEN 3
    WHEN v_event.bracket_size = 16 THEN 4
    WHEN v_event.bracket_size = 32 THEN 5
    ELSE 3
  END;

  -- Count completed wins in this tournament
  SELECT COUNT(*) INTO v_completed_matches
  FROM career_matches
  WHERE event_id = p_event_id AND career_id = p_career_id AND result = 'win';

  -- If they've won enough to reach the final (total_rounds - 1 wins)
  IF v_completed_matches >= v_total_rounds - 1 THEN
    PERFORM _check_offer_sponsor(p_career_id, p_career, 'tournament_final');
  END IF;
END;
$$;

-- Update the match trigger to also check tournament finals
CREATE OR REPLACE FUNCTION trg_check_sponsor_after_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
BEGIN
  IF NEW.result IN ('win', 'loss') AND (OLD.result IS NULL OR OLD.result = 'pending') THEN
    SELECT * INTO v_career FROM career_profiles WHERE id = NEW.career_id AND tier >= 2;
    IF v_career.id IS NOT NULL THEN
      -- Check win streak
      PERFORM _check_win_streak_sponsor(NEW.career_id, v_career);
      -- Check tournament final reach (only on wins)
      IF NEW.result = 'win' THEN
        PERFORM _check_tournament_final_sponsor(NEW.career_id, v_career, NEW.event_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Apply REP bonus on match wins when player has active sponsor
CREATE OR REPLACE FUNCTION _apply_sponsor_rep_bonus(
  p_career_id UUID,
  p_base_rep INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bonus_pct REAL;
  v_bonus_rep INTEGER;
BEGIN
  SELECT sc.rep_bonus_pct INTO v_bonus_pct
  FROM career_sponsor_contracts cc
  JOIN career_sponsor_catalog sc ON sc.id = cc.sponsor_id
  WHERE cc.career_id = p_career_id AND cc.status = 'active'
  LIMIT 1;

  IF v_bonus_pct IS NULL OR v_bonus_pct = 0 THEN
    RETURN p_base_rep;
  END IF;

  v_bonus_rep := ceil(p_base_rep * v_bonus_pct)::INTEGER;
  
  -- Apply bonus to career profile
  UPDATE career_profiles 
  SET rep = rep + v_bonus_rep
  WHERE id = p_career_id;
  
  RETURN p_base_rep + v_bonus_rep;
END;
$$;

-- Trigger: apply sponsor REP bonus after rep is awarded
CREATE OR REPLACE FUNCTION trg_sponsor_rep_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bonus_pct REAL;
  v_bonus_rep INTEGER;
  v_rep_gained INTEGER;
BEGIN
  -- Only fire on rep increase
  IF NEW.rep > OLD.rep THEN
    SELECT sc.rep_bonus_pct INTO v_bonus_pct
    FROM career_sponsor_contracts cc
    JOIN career_sponsor_catalog sc ON sc.id = cc.sponsor_id
    WHERE cc.career_id = NEW.id AND cc.status = 'active'
    LIMIT 1;

    IF v_bonus_pct IS NOT NULL AND v_bonus_pct > 0 THEN
      v_rep_gained := NEW.rep - OLD.rep;
      v_bonus_rep := ceil(v_rep_gained * v_bonus_pct)::INTEGER;
      NEW.rep := NEW.rep + v_bonus_rep;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sponsor_rep ON career_profiles;
CREATE TRIGGER trg_sponsor_rep
  BEFORE UPDATE ON career_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_sponsor_rep_bonus();

-- 3. RPC to get end-of-season sponsor options for renewal popup
CREATE OR REPLACE FUNCTION rpc_get_season_end_sponsor_options(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current JSON := NULL;
  v_alternative JSON := NULL;
  v_alt_sponsor career_sponsor_catalog;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Not found'); END IF;

  -- Get current active sponsor
  SELECT json_build_object(
    'contract_id', cc.id,
    'sponsor_id', sc.id,
    'name', sc.name,
    'rep_bonus_pct', sc.rep_bonus_pct,
    'flavour_text', sc.flavour_text,
    'objectives', sc.rep_objectives
  ) INTO v_current
  FROM career_sponsor_contracts cc
  JOIN career_sponsor_catalog sc ON sc.id = cc.sponsor_id
  WHERE cc.career_id = p_career_id AND cc.status = 'active'
  LIMIT 1;

  -- Get a random alternative sponsor (different from current)
  SELECT sc.* INTO v_alt_sponsor
  FROM career_sponsor_catalog sc
  WHERE sc.tier_min <= v_career.tier AND sc.tier_max >= v_career.tier
    AND (v_current IS NULL OR sc.id != (v_current->>'sponsor_id')::UUID)
  ORDER BY random()
  LIMIT 1;

  IF v_alt_sponsor.id IS NOT NULL THEN
    v_alternative := json_build_object(
      'sponsor_id', v_alt_sponsor.id,
      'name', v_alt_sponsor.name,
      'rep_bonus_pct', v_alt_sponsor.rep_bonus_pct,
      'flavour_text', v_alt_sponsor.flavour_text,
      'objectives', v_alt_sponsor.rep_objectives
    );
  END IF;

  RETURN json_build_object(
    'current_sponsor', v_current,
    'alternative_sponsor', v_alternative,
    'has_sponsor', v_current IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_season_end_sponsor_options(UUID) TO authenticated;
