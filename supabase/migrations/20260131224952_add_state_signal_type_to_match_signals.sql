/*
  # Add 'state' signal type to match_signals

  1. Changes
    - Update CHECK constraint on match_signals.type to include 'state'
    - Allows WebRTC peers to share state information (camera on/off, etc.)

  2. Security
    - No changes to RLS policies
    - State signals follow same routing rules as other signals
*/

-- Drop old constraint
ALTER TABLE match_signals DROP CONSTRAINT IF EXISTS match_signals_type_check;

-- Add new constraint with 'state' type
ALTER TABLE match_signals ADD CONSTRAINT match_signals_type_check
  CHECK (type IN ('offer', 'answer', 'ice', 'state'));
