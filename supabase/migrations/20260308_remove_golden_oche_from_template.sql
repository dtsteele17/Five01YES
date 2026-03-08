-- ============================================================
-- Remove "The Golden Oche Cup" from Tier 2 schedule template
-- It's replaced by the dynamic pub tournament invite after 4th match
-- Also skip any existing Golden Oche events for all careers
-- ============================================================

-- Remove from template so new careers don't get it
DELETE FROM career_schedule_templates 
WHERE tier = 2 AND event_name = 'The Golden Oche Cup';

-- Skip any existing ones that haven't been played
UPDATE career_events 
SET status = 'skipped'
WHERE event_name = 'The Golden Oche Cup'
  AND status IN ('pending', 'active', 'pending_invite');

-- Renumber remaining Tier 2 template sequences so there's no gap
-- Original: 1-4 (league), 5 (golden oche - deleted), 6-8 (league)
-- New: 1-4 (league), 5-7 (league matchdays 5-7)
UPDATE career_schedule_templates 
SET sequence_no = sequence_no - 1
WHERE tier = 2 AND sequence_no > 5;
