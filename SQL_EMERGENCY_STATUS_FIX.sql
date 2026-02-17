-- EMERGENCY FIX: Update invalid status values first, then add constraint

-- Step 1: Update match_rooms - set any weird status to 'active'
UPDATE match_rooms 
SET status = 'active' 
WHERE status IS NULL 
   OR status NOT IN ('waiting', 'active', 'finished', 'cancelled');

-- Step 2: Update quick_match_lobbies - set any weird status to 'closed'
UPDATE quick_match_lobbies 
SET status = 'closed' 
WHERE status IS NULL 
   OR status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

-- Step 3: Drop old constraints
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_status_check;
ALTER TABLE quick_match_lobbies DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

-- Step 4: Add new constraints
ALTER TABLE match_rooms
  ADD CONSTRAINT match_rooms_status_check 
  CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));

ALTER TABLE quick_match_lobbies
  ADD CONSTRAINT quick_match_lobbies_status_check 
  CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- Done
SELECT 'Status constraints fixed successfully' as result;
