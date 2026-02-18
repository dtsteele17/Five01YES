-- ============================================
-- FIX: Checkout constraint error in quick_match_lobbies
-- ============================================
-- Error: new row violates check constraint "quick_match_lobbies_status_check"
-- Solution: Fix invalid status values and ensure constraint allows correct values
-- ============================================

-- Step 1: Fix any invalid status values in quick_match_lobbies
UPDATE quick_match_lobbies 
SET status = 'closed' 
WHERE status IS NULL 
   OR status = '' 
   OR status NOT IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed');

-- Step 2: Fix any invalid status in match_rooms (for consistency)
UPDATE match_rooms 
SET status = 'finished' 
WHERE status IS NULL 
   OR status = '' 
   OR status NOT IN ('waiting', 'active', 'finished', 'cancelled');

-- Step 3: Drop and recreate the constraint with correct values
ALTER TABLE quick_match_lobbies 
DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies 
ADD CONSTRAINT quick_match_lobbies_status_check 
CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- Step 4: Ensure match_rooms constraint is correct
ALTER TABLE match_rooms 
DROP CONSTRAINT IF EXISTS match_rooms_status_check;

ALTER TABLE match_rooms 
ADD CONSTRAINT match_rooms_status_check 
CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));

-- ============================================
-- DONE!
-- ============================================
SELECT 'Constraint fix applied!' as status;
