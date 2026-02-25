-- =======================================================
-- TEST TOURNAMENT QUERY - Verify Date Filtering
-- =======================================================

-- Test the tournament query logic
-- This should only show:
-- 1. All tournaments with status: registration, ready, in_progress
-- 2. Completed tournaments from last 30 days only

SELECT 
  id,
  name,
  status,
  start_at,
  completed_at,
  created_at,
  CASE 
    WHEN status IN ('registration', 'ready', 'in_progress') THEN 'Always shown'
    WHEN status = 'completed' AND completed_at >= (NOW() - INTERVAL '30 days') THEN 'Recent completed'
    ELSE 'Should be filtered out'
  END as display_reason
FROM tournaments
WHERE (
  status IN ('registration', 'ready', 'in_progress')
  OR 
  (status = 'completed' AND completed_at >= (NOW() - INTERVAL '30 days'))
)
ORDER BY created_at DESC;

-- Also show what would be filtered out
SELECT 
  'FILTERED OUT' as note,
  id,
  name,
  status,
  start_at,
  completed_at,
  created_at
FROM tournaments
WHERE NOT (
  status IN ('registration', 'ready', 'in_progress')
  OR 
  (status = 'completed' AND completed_at >= (NOW() - INTERVAL '30 days'))
)
ORDER BY created_at DESC;