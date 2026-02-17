-- FINAL FIX: Two-step process - first update bad data, then add constraints

-- Step 1: See current status values
SELECT 'Current match_rooms status values:' as info;
SELECT status, COUNT(*) FROM match_rooms GROUP BY status;

SELECT 'Current quick_match_lobbies status values:' as info;
SELECT status, COUNT(*) FROM quick_match_lobbies GROUP BY status;

-- Step 2: Fix any invalid status in match_rooms
-- (Update these to valid values based on what you see above)
UPDATE match_rooms SET status = 'active' WHERE status NOT IN ('waiting', 'active', 'finished', 'cancelled');

-- Step 3: Fix any invalid status in quick_match_lobbies
UPDATE quick_match_lobbies SET status = 'closed' WHERE status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

-- Step 4: Now drop and recreate constraints
ALTER TABLE match_rooms DROP CONSTRAINT IF EXISTS match_rooms_status_check;
ALTER TABLE quick_match_lobbies DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

-- Step 5: Add constraints (should work now that data is clean)
ALTER TABLE match_rooms ADD CONSTRAINT match_rooms_status_check CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));
ALTER TABLE quick_match_lobbies ADD CONSTRAINT quick_match_lobbies_status_check CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- Step 6: Verify
SELECT 'Constraints added successfully' as result;
SELECT status, COUNT(*) as count FROM match_rooms GROUP BY status ORDER BY status;
