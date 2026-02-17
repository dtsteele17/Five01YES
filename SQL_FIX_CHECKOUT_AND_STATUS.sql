-- EMERGENCY FIX: Checkout not working + Status constraint
-- Run this in Supabase SQL Editor

-- 1. Fix the quick_match_lobbies constraint
ALTER TABLE quick_match_lobbies 
  DROP CONSTRAINT IF EXISTS quick_match_lobbies_status_check;

ALTER TABLE quick_match_lobbies
  ADD CONSTRAINT quick_match_lobbies_status_check 
  CHECK (status IN ('open', 'waiting', 'full', 'active', 'in_progress', 'cancelled', 'closed'));

-- 2. Fix match_rooms constraint
ALTER TABLE match_rooms 
  DROP CONSTRAINT IF EXISTS match_rooms_status_check;

ALTER TABLE match_rooms
  ADD CONSTRAINT match_rooms_status_check 
  CHECK (status IN ('waiting', 'active', 'finished', 'cancelled'));

-- 3. Verify
SELECT 'Status constraints fixed' as result;
