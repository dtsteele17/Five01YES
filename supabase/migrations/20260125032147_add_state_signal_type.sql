/*
  # Add 'state' Signal Type to Match Call Signals

  1. Changes
    - Add 'state' to the allowed signal types in match_call_signals table
    - This allows users to signal camera/mic state changes (payload: { cameraOn: boolean, micOn: boolean })
    - Replaces deprecated 'video_enabled' and 'camera_ready' with unified 'state' type

  2. Allowed Signal Types (after this migration)
    - offer: WebRTC offer
    - answer: WebRTC answer
    - ice: ICE candidate
    - hangup: End call
    - camera_ready: Deprecated, kept for backward compatibility
    - video_enabled: Deprecated, kept for backward compatibility
    - state: Camera/mic state changes (NEW, preferred method)

  3. Notes
    - This prevents 400 Bad Request errors when sending 'state' signals
    - Existing signals remain unchanged
    - New code should use 'state' instead of 'video_enabled' or 'camera_ready'
*/

-- Drop the existing constraint
ALTER TABLE match_call_signals
DROP CONSTRAINT IF EXISTS match_call_signals_type_check;

-- Add the new constraint with 'state' included
ALTER TABLE match_call_signals
ADD CONSTRAINT match_call_signals_type_check
CHECK (type IN ('offer', 'answer', 'ice', 'hangup', 'camera_ready', 'video_enabled', 'state'));
