-- ============================================================
-- FIX: Tournament showing before user accepts invite
-- 
-- 1. Skip stale "County Championship" events from old function
-- 2. Convert any 'pending' tournament events that should be 
--    'pending_invite' (created by old rpc_career_complete_match)
-- ============================================================

-- Convert tournaments created by old functions to pending_invite
-- These are 'open' events with bracket_size that are pending 
-- but haven't been explicitly accepted by the user
UPDATE career_events 
SET status = 'pending_invite'
WHERE event_type = 'open'
  AND bracket_size IS NOT NULL
  AND status = 'pending'
  AND event_name IN ('County Championship', 'The Golden Oche Cup')
  AND completed_at IS NULL;

-- Also convert any dynamic pub tournaments that were created with 
-- wrong status by earlier migration versions
UPDATE career_events 
SET status = 'pending_invite'
WHERE event_type = 'open'
  AND bracket_size = 16
  AND status = 'pending'
  AND sequence_no >= 50
  AND completed_at IS NULL;
