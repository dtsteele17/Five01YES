-- Fix duplicate tournament invite + update trigger
-- Run in Supabase SQL Editor

-- 1. Skip the duplicate tournament
UPDATE career_events 
SET status = 'skipped' 
WHERE id = '5330aba0-0383-436c-9843-8dcece039e88';

-- 2. Update trigger to prevent future duplicates
CREATE OR REPLACE FUNCTION fix_new_tournament_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type = 'open' 
    AND NEW.bracket_size = 16 
    AND NEW.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM career_profiles cp 
      WHERE cp.id = NEW.career_id AND cp.tier >= 2
    )
  THEN
    IF EXISTS (
      SELECT 1 FROM career_events 
      WHERE career_id = NEW.career_id 
        AND season = NEW.season 
        AND event_type = 'open' 
        AND status = 'pending_invite'
        AND bracket_size = 16
    ) THEN
      NEW.status := 'skipped';
    ELSE
      NEW.status := 'pending_invite';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
