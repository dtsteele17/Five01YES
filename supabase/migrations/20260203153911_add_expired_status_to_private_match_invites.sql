/*
  # Add expired status to private_match_invites

  1. Purpose
    - Add 'expired' as a valid status for private_match_invites
    - Used when a room no longer exists or is in a terminal state

  2. Changes
    - Drop existing check constraint
    - Add new check constraint including 'expired' status
*/

-- Drop existing check constraint
ALTER TABLE private_match_invites 
  DROP CONSTRAINT IF EXISTS private_match_invites_status_check;

-- Add new check constraint with 'expired' status
ALTER TABLE private_match_invites
  ADD CONSTRAINT private_match_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'));
