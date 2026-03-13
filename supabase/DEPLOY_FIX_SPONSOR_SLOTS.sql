DO $fn$ BEGIN
  ALTER TABLE career_profiles ADD COLUMN sponsor_slots SMALLINT NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION rpc_career_unlock_sponsor_slot(
  p_career_id UUID,
  p_reason TEXT DEFAULT 'league_win'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_current_slots SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Career not found'); END IF;

  v_current_slots := COALESCE(v_career.sponsor_slots, 1);

  IF v_current_slots >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'Max sponsor slots reached');
  END IF;

  UPDATE career_profiles SET sponsor_slots = v_current_slots + 1, updated_at = now()
  WHERE id = p_career_id;

  INSERT INTO career_milestones (career_id, milestone_type, title, description, season, day)
  VALUES (p_career_id, 'sponsor_slot', 'New Sponsor Slot Unlocked',
    CASE p_reason
      WHEN 'league_win' THEN 'Winning the league has attracted attention. You can now hold 2 sponsors.'
      WHEN 'win_streak' THEN 'Your 3-match winning streak caught the eye of sponsors. New sponsor slot unlocked.'
      WHEN 'top_8_finish' THEN 'A top 8 finish has opened doors. New sponsor slot unlocked.'
      ELSE 'New sponsor slot unlocked.'
    END,
    v_career.season, v_career.day);

  RETURN json_build_object('success', true, 'new_slots', v_current_slots + 1, 'reason', p_reason);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_career_unlock_sponsor_slot(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION rpc_career_lose_sponsor_on_relegation(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_removed_sponsor RECORD;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Career not found'); END IF;

  SELECT * INTO v_removed_sponsor FROM career_sponsor_contracts
  WHERE career_id = p_career_id AND status = 'active'
  ORDER BY created_at ASC LIMIT 1;

  IF FOUND THEN
    UPDATE career_sponsor_contracts SET status = 'expired'
    WHERE id = v_removed_sponsor.id;

    INSERT INTO career_milestones (career_id, milestone_type, title, description, season, day)
    VALUES (p_career_id, 'sponsor_lost', 'Sponsor Lost',
      'Relegation has cost you a sponsor. You will need to rebuild your reputation.',
      v_career.season, v_career.day);
  END IF;

  IF COALESCE(v_career.sponsor_slots, 1) > 1 THEN
    UPDATE career_profiles SET sponsor_slots = GREATEST(1, COALESCE(sponsor_slots, 1) - 1), updated_at = now()
    WHERE id = p_career_id;
  END IF;

  RETURN json_build_object('success', true, 'lost_sponsor', v_removed_sponsor.id IS NOT NULL);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_career_lose_sponsor_on_relegation(UUID) TO authenticated;
