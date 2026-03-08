-- ============================================================
-- CLEANUP: Remove duplicate/stale tournament events
-- Skip ALL pending open/tournament events that are duplicates
-- or were created by the old rpc_career_complete_match
-- ============================================================

-- 1. Skip all "County Championship" events that are still pending
UPDATE career_events 
SET status = 'skipped'
WHERE event_name = 'County Championship'
  AND status IN ('pending', 'active', 'pending_invite');

-- 2. Skip any duplicate open events per career per season
-- (keep only the first one if multiple exist)
WITH ranked AS (
  SELECT id, career_id, season,
    ROW_NUMBER() OVER (PARTITION BY career_id, season, event_type ORDER BY created_at ASC) as rn
  FROM career_events
  WHERE event_type = 'open' 
    AND status IN ('pending', 'active', 'pending_invite')
)
UPDATE career_events ce
SET status = 'skipped'
FROM ranked r
WHERE ce.id = r.id AND r.rn > 1;

-- 3. Fix week counter — set week to match the number of completed league matches + 1
UPDATE career_profiles cp
SET week = COALESCE((
  SELECT COUNT(*)::SMALLINT + 1
  FROM career_events ce
  WHERE ce.career_id = cp.id
    AND ce.season = cp.season
    AND ce.event_type = 'league'
    AND ce.status = 'completed'
), 1)
WHERE cp.tier >= 2 AND cp.status = 'active';
