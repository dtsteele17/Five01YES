/*
  # Add camera_ready Signal Type

  1. Changes
    - Add 'camera_ready' to the allowed signal types in match_call_signals table
    - This allows users to signal when their camera is ready before initiating WebRTC

  2. Notes
    - Existing signals (offer, answer, ice, hangup) remain unchanged
    - camera_ready signals help coordinate WebRTC offer/answer exchange
*/

-- Drop the existing constraint
ALTER TABLE match_call_signals 
DROP CONSTRAINT IF EXISTS match_call_signals_type_check;

-- Add the new constraint with camera_ready included
ALTER TABLE match_call_signals
ADD CONSTRAINT match_call_signals_type_check 
CHECK (type IN ('offer', 'answer', 'ice', 'hangup', 'camera_ready'));