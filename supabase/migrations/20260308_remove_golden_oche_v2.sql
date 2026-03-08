-- ============================================================
-- Remove "The Golden Oche Cup" from Tier 2 schedule template
-- Safe to run even if partially applied already
-- ============================================================

-- 1. Null out FK references and skip all Golden Oche events
UPDATE career_events 
SET status = 'skipped', template_id = NULL
WHERE event_name = 'The Golden Oche Cup';

-- 2. Delete from template (may already be gone)
DELETE FROM career_schedule_templates 
WHERE tier = 2 AND event_name = 'The Golden Oche Cup';

-- 3. Renumber: drop unique constraint, renumber, re-add constraint
ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_tier_sequence_no_key;

UPDATE career_schedule_templates SET sequence_no = sequence_no - 1
WHERE tier = 2 AND sequence_no > 5;

ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_tier_sequence_no_key UNIQUE (tier, sequence_no);
