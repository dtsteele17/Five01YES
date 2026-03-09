-- ============================================================
-- Sponsor offer system:
-- Triggers on 3-win streak or tournament final reach
-- Shows in notifications, creates email
-- Only 1 active sponsor at a time
-- End-of-season renewal handled in frontend
-- ============================================================

-- Function to check and generate a sponsor offer
CREATE OR REPLACE FUNCTION _check_offer_sponsor(
  p_career_id UUID,
  p_career career_profiles,
  p_trigger TEXT  -- 'win_streak' or 'tournament_final'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sponsor career_sponsor_catalog;
  v_has_active BOOLEAN;
  v_has_pending BOOLEAN;
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
  
  -- Pick a random sponsor for the current tier
  SELECT * INTO v_sponsor FROM career_sponsor_catalog
  WHERE tier_min <= p_career.tier AND tier_max >= p_career.tier
  ORDER BY random()
  LIMIT 1;
  
  IF v_sponsor.id IS NULL THEN RETURN; END IF;
  
  -- Create the offer
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
    v_sponsor.flavour_text || ' (' || 
      CASE WHEN v_sponsor.rep_bonus_pct > 0 
        THEN '+' || round(v_sponsor.rep_bonus_pct * 100) || '% REP bonus' 
        ELSE 'Special deal' 
      END || ')',
    p_career.tier, p_career.season, p_career.week, p_career.day
  );
END;
$$;

-- Add 'offered' to the status check constraint (if not already there)
DO $$
BEGIN
  ALTER TABLE career_sponsor_contracts DROP CONSTRAINT IF EXISTS career_sponsor_contracts_status_check;
  ALTER TABLE career_sponsor_contracts ADD CONSTRAINT career_sponsor_contracts_status_check 
    CHECK (status IN ('active','completed','expired','replaced','offered','declined'));
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Function to check win streak and trigger sponsor offer
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
  v_streak INT := 0;
BEGIN
  -- Get last 3 match results
  SELECT ARRAY_AGG(cm.result ORDER BY cm.created_at DESC)
  INTO v_recent_results
  FROM (
    SELECT result, created_at FROM career_matches 
    WHERE career_id = p_career_id AND result IN ('win', 'loss')
    ORDER BY created_at DESC
    LIMIT 3
  ) cm;
  
  IF v_recent_results IS NULL OR array_length(v_recent_results, 1) < 3 THEN RETURN; END IF;
  
  -- Check if last 3 are all wins
  IF v_recent_results[1] = 'win' AND v_recent_results[2] = 'win' AND v_recent_results[3] = 'win' THEN
    PERFORM _check_offer_sponsor(p_career_id, p_career, 'win_streak');
  END IF;
END;
$$;

-- RPC to accept or decline a sponsor offer
CREATE OR REPLACE FUNCTION rpc_career_respond_sponsor(
  p_career_id UUID,
  p_contract_id UUID,
  p_accept BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contract career_sponsor_contracts;
  v_sponsor career_sponsor_catalog;
BEGIN
  SELECT * INTO v_contract FROM career_sponsor_contracts 
  WHERE id = p_contract_id AND career_id = p_career_id AND status = 'offered';
  
  IF v_contract.id IS NULL THEN
    RETURN json_build_object('error', 'No pending sponsor offer found');
  END IF;
  
  SELECT * INTO v_sponsor FROM career_sponsor_catalog WHERE id = v_contract.sponsor_id;
  
  IF p_accept THEN
    -- Expire any existing active sponsors first
    UPDATE career_sponsor_contracts 
    SET status = 'replaced' 
    WHERE career_id = p_career_id AND status = 'active';
    
    -- Accept the offer
    UPDATE career_sponsor_contracts 
    SET status = 'active', accepted_at_week = (SELECT week FROM career_profiles WHERE id = p_career_id)
    WHERE id = p_contract_id;
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Welcome aboard! ' || v_sponsor.name || ' is now your sponsor.',
      'sponsor_name', v_sponsor.name
    );
  ELSE
    UPDATE career_sponsor_contracts SET status = 'declined' WHERE id = p_contract_id;
    RETURN json_build_object('success', true, 'message', 'Offer declined.');
  END IF;
END;
$$;

-- RPC to renew or switch sponsor at end of season
CREATE OR REPLACE FUNCTION rpc_career_end_season_sponsor(
  p_career_id UUID,
  p_action TEXT,  -- 'renew', 'switch', or 'drop'
  p_new_sponsor_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_current career_sponsor_contracts;
  v_new_sponsor career_sponsor_catalog;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  
  SELECT * INTO v_current FROM career_sponsor_contracts 
  WHERE career_id = p_career_id AND status = 'active' LIMIT 1;
  
  IF p_action = 'renew' AND v_current.id IS NOT NULL THEN
    -- Renew: update the season
    UPDATE career_sponsor_contracts 
    SET accepted_at_season = v_career.season + 1
    WHERE id = v_current.id;
    RETURN json_build_object('success', true, 'message', 'Sponsor renewed for next season!');
    
  ELSIF p_action = 'switch' AND p_new_sponsor_id IS NOT NULL THEN
    -- Expire current
    IF v_current.id IS NOT NULL THEN
      UPDATE career_sponsor_contracts SET status = 'expired' WHERE id = v_current.id;
    END IF;
    
    SELECT * INTO v_new_sponsor FROM career_sponsor_catalog WHERE id = p_new_sponsor_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Sponsor not found'); END IF;
    
    INSERT INTO career_sponsor_contracts (career_id, sponsor_id, slot, accepted_at_week, accepted_at_season, status)
    VALUES (p_career_id, p_new_sponsor_id, 1, 1, v_career.season + 1, 'active');
    
    RETURN json_build_object('success', true, 'message', 'Switched to ' || v_new_sponsor.name || '!');
    
  ELSIF p_action = 'drop' THEN
    IF v_current.id IS NOT NULL THEN
      UPDATE career_sponsor_contracts SET status = 'expired' WHERE id = v_current.id;
    END IF;
    RETURN json_build_object('success', true, 'message', 'Going without a sponsor next season.');
  END IF;
  
  RETURN json_build_object('error', 'Invalid action');
END;
$$;

-- Trigger: after career match complete, check for win streak sponsor
CREATE OR REPLACE FUNCTION trg_check_sponsor_after_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
BEGIN
  IF NEW.result IN ('win', 'loss') AND OLD.result = 'pending' THEN
    SELECT * INTO v_career FROM career_profiles WHERE id = NEW.career_id AND tier >= 3;
    IF v_career.id IS NOT NULL THEN
      PERFORM _check_win_streak_sponsor(NEW.career_id, v_career);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sponsor_check ON career_matches;
CREATE TRIGGER trg_sponsor_check
  AFTER UPDATE ON career_matches
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_sponsor_after_match();

GRANT EXECUTE ON FUNCTION rpc_career_respond_sponsor(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_career_end_season_sponsor(UUID, TEXT, UUID) TO authenticated;
