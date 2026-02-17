-- Fix status constraint - first update invalid rows, then add constraint

-- 1. See what status values exist
SELECT status, COUNT(*) as count FROM match_rooms GROUP BY status;

-- 2. Update any rows with invalid status to 'active' (most common for in-progress games)
UPDATE match_rooms 
SET status = 'active' 
WHERE status NOT IN ('waiting', 'active', 'finished', 'cancelled');

-- 3. Also fix quick_match_lobbies
UPDATE quick_match_lobbies 
SET status = 'open' 
WHERE status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

-- 4. Now add the constraints
ALTER TABLE match_rooms 
  DROP CONSTRAINT IF EXISTS match_rooms_status_check;

ALTER TABLE match_rooms
  ADD CONSTRAINT match_rooms_status_check 
  CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));

ALTER TABLE quick_match_lobbies 
  DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies
  ADD CONSTRAINT quick_match_lobbies_status_check 
  CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- 5. Verify
SELECT 'Status constraints fixed' as result;
