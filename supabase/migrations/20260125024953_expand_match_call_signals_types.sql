/*
  # Expand Match Call Signals Allowed Types

  1. Changes
    - Add 'video_enabled' to the allowed signal types in match_call_signals table
    - This allows users to signal camera state changes without closing peer connection
    - Ensures all signal types used by the app are allowed by the constraint

  2. Allowed Signal Types
    - offer: WebRTC offer
    - answer: WebRTC answer
    - ice: ICE candidate
    - hangup: End call (only on match end/forfeit/leave)
    - camera_ready: Deprecated, kept for backward compatibility
    - video_enabled: Camera state change (on/off) without closing connection

  3. Notes
    - This prevents 400 Bad Request errors when sending video_enabled signals
    - Existing signals remain unchanged
*/

-- Drop the existing constraint
ALTER TABLE match_call_signals
DROP CONSTRAINT IF EXISTS match_call_signals_type_check;

-- Add the new constraint with all signal types
ALTER TABLE match_call_signals
ADD CONSTRAINT match_call_signals_type_check
CHECK (type IN ('offer', 'answer', 'ice', 'hangup', 'camera_ready', 'video_enabled'));
