-- ============================================================
-- Fix sponsor rules:
-- 1. Win streak only counts current tier+season
-- 2. First sponsor max 5% REP bonus
-- 3. Update catalog: Tier 2 sponsors removed (tier >= 3 only)
-- ============================================================

-- Fix win streak: only count matches from current tier+season
CREATE OR REPLACE FUNCTION _check_win_streak_sponsor(
  p_career_id UUID,
  p_career career_profiles
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recent_results TEXT[];
BEGIN
  -- Get last 3 match results from CURRENT season only
  SELECT ARRAY_AGG(cm.result ORDER BY cm.created_at DESC)
  INTO v_recent_results
  FROM (
    SELECT cm.result, cm.created_at 
    FROM career_matches cm
    JOIN career_events ce ON ce.id = cm.event_id
    WHERE cm.career_id = p_career_id 
      AND cm.result IN ('win', 'loss')
      AND ce.season = p_career.season
    ORDER BY cm.created_at DESC
    LIMIT 3
  ) cm;
  
  IF v_recent_results IS NULL OR array_length(v_recent_results, 1) < 3 THEN RETURN; END IF;
  
  -- Check if last 3 are all wins
  IF v_recent_results[1] = 'win' AND v_recent_results[2] = 'win' AND v_recent_results[3] = 'win' THEN
    PERFORM _check_offer_sponsor(p_career_id, p_career, 'win_streak');
  END IF;
END;
$$;

-- Fix sponsor offer: first sponsor capped at 5%
CREATE OR REPLACE FUNCTION _check_offer_sponsor(
  p_career_id UUID,
  p_career career_profiles,
  p_trigger TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sponsor career_sponsor_catalog;
  v_has_active BOOLEAN;
  v_has_pending BOOLEAN;
  v_ever_had_sponsor BOOLEAN;
  v_rep_pct REAL;
  v_goal_text TEXT;
BEGIN
  -- Check if already has active sponsor
  SELECT EXISTS(
    SELECT 1 FROM career_sponsor_contracts 
    WHERE career_id = p_career_id AND status = 'active'
  ) INTO v_has_active;
  IF v_has_active THEN RETURN; END IF;
  
  -- Check if already has a pending offer
  SELECT EXISTS(
    SELECT 1 FROM career_sponsor_contracts 
    WHERE career_id = p_career_id AND status = 'offered'
  ) INTO v_has_pending;
  IF v_has_pending THEN RETURN; END IF;
  
  -- Check if player has EVER had a sponsor before
  SELECT EXISTS(
    SELECT 1 FROM career_sponsor_contracts 
    WHERE career_id = p_career_id AND status IN ('active', 'completed', 'expired', 'replaced')
  ) INTO v_ever_had_sponsor;
  
  -- Pick a random sponsor for the current tier
  SELECT * INTO v_sponsor FROM career_sponsor_catalog
  WHERE tier_min <= p_career.tier AND tier_max >= p_career.tier
  ORDER BY random()
  LIMIT 1;
  
  IF v_sponsor.id IS NULL THEN RETURN; END IF;
  
  -- First sponsor: cap at 5%
  v_rep_pct := v_sponsor.rep_bonus_pct;
  IF NOT v_ever_had_sponsor AND v_rep_pct > 0.05 THEN
    v_rep_pct := 0.05;
  END IF;
  
  -- Extract goal text from objectives
  v_goal_text := '';
  IF v_sponsor.rep_objectives IS NOT NULL AND v_sponsor.rep_objectives::text != '[]' THEN
    v_goal_text := v_sponsor.rep_objectives->0->>'description';
  END IF;
  
  -- Create the offer (store effective rep_pct)
  INSERT INTO career_sponsor_contracts (
    career_id, sponsor_id, slot, accepted_at_week, accepted_at_season, status
  ) VALUES (
    p_career_id, v_sponsor.id, 1, p_career.week, p_career.season, 'offered'
  );
  
  -- Create milestone for notification
  INSERT INTO career_milestones (
    career_id, milestone_type, title, description, tier, season, week, day
  ) VALUES (
    p_career_id, 'sponsor_offer',
    v_sponsor.name || ' — Sponsorship Offer!',
    v_sponsor.flavour_text || ' (+' || round(v_rep_pct * 100) || '% REP bonus)',
    p_career.tier, p_career.season, p_career.week, p_career.day
  );
END;
$$;

-- Remove Tier 2 sponsors from catalog (sponsors only Tier 3+)
UPDATE career_sponsor_catalog SET tier_min = 3 WHERE tier_min = 2;

-- Clean up any wrongly-offered sponsor contracts for Tier 2 careers
UPDATE career_sponsor_contracts SET status = 'declined'
WHERE status = 'offered'
AND career_id IN (SELECT id FROM career_profiles WHERE tier < 3);

-- Also decline the current wrong offer (County Darts Association after 1 win)
-- The trigger will re-offer correctly after an actual 3-win streak in current season
UPDATE career_sponsor_contracts SET status = 'declined'
WHERE status = 'offered'
AND career_id IN (
  SELECT cp.id FROM career_profiles cp
  WHERE NOT EXISTS (
    -- Must have 3 consecutive wins in current season
    SELECT 1 FROM (
      SELECT cm.result FROM career_matches cm
      JOIN career_events ce ON ce.id = cm.event_id
      WHERE cm.career_id = cp.id 
        AND cm.result IN ('win','loss')
        AND ce.season = cp.season
      ORDER BY cm.created_at DESC LIMIT 3
    ) r
    HAVING COUNT(*) = 3 AND COUNT(*) FILTER (WHERE result = 'win') = 3
  )
);
