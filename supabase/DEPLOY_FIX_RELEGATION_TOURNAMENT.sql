-- Fix: Remove relegation_tournament from schedule templates
-- End-of-season tournaments are created dynamically by rpc_create_end_season_tournaments
-- The template event is redundant and causes the season to never complete

-- 1. Remove the template row so new seasons don't get it
DELETE FROM career_schedule_templates WHERE event_type = 'relegation_tournament';

-- 2. Skip any existing relegation_tournament events that are still pending/active
-- (these are leftover from schedule template generation)
UPDATE career_events SET status = 'skipped'
WHERE event_type = 'relegation_tournament'
  AND status IN ('pending', 'active', 'pending_invite');

-- 3. Also update the home RPC to auto-skip relegation_tournament events
-- (belt and suspenders — covers any edge cases)
