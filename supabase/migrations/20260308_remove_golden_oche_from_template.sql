-- ============================================================
-- Remove "The Golden Oche Cup" from Tier 2 schedule template
-- It's replaced by the dynamic pub tournament invite after 4th match
-- Also skip any existing Golden Oche events for all careers
-- ============================================================

-- First: null out template_id references and skip existing events
UPDATE career_events 
SET status = 'skipped', template_id = NULL
WHERE event_name = 'The Golden Oche Cup';

-- Now safe to delete from template
DELETE FROM career_schedule_templates 
WHERE tier = 2 AND event_name = 'The Golden Oche Cup';

-- Renumber remaining Tier 2 template sequences so there's no gap
-- Must update one at a time to avoid unique constraint conflicts
UPDATE career_schedule_templates SET sequence_no = 5 WHERE tier = 2 AND sequence_no = 6;
UPDATE career_schedule_templates SET sequence_no = 6 WHERE tier = 2 AND sequence_no = 7;
UPDATE career_schedule_templates SET sequence_no = 7 WHERE tier = 2 AND sequence_no = 8;
