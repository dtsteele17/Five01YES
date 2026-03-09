-- Fix: Sponsors only for County Circuit (Tier 3) and above
-- Was triggering in Pub Leagues (Tier 2)

CREATE OR REPLACE FUNCTION trg_check_sponsor_after_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
BEGIN
  IF NEW.result IN ('win', 'loss') AND (OLD.result IS NULL OR OLD.result = 'pending') THEN
    SELECT * INTO v_career FROM career_profiles WHERE id = NEW.career_id AND tier >= 3;
    IF v_career.id IS NOT NULL THEN
      PERFORM _check_win_streak_sponsor(NEW.career_id, v_career);
      IF NEW.result = 'win' THEN
        PERFORM _check_tournament_final_sponsor(NEW.career_id, v_career, NEW.event_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Also delete any wrongly-created Tier 2 sponsor offers
UPDATE career_sponsor_contracts SET status = 'declined'
WHERE status = 'offered' 
AND career_id IN (
  SELECT id FROM career_profiles WHERE tier < 3
);
