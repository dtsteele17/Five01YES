/*
  # Fix match_call_signals Constraint and Clean Invalid Data

  1. Purpose
    - Clean up any invalid signal types that violate the check constraint
    - Ensure constraint allows exactly: offer, answer, ice, hangup, state, video_enabled
    - Prevent future insert failures due to constraint violations

  2. Changes
    - Delete any rows with invalid signal types (if any exist)
    - Drop and recreate the check constraint with correct type list
    - Document valid signal types for client code

  3. Valid Signal Types
    - offer: WebRTC offer SDP
    - answer: WebRTC answer SDP
    - ice: ICE candidate
    - hangup: End call signal
    - state: Camera/mic state changes (payload: { cameraOn: boolean })
    - video_enabled: Legacy camera state (kept for backward compatibility)

  4. RLS Policies
    - Existing policies already allow:
      * Authenticated users can insert signals for their match
      * Users can select/subscribe to signals for matches they're in
      * Works for both quick_match_lobbies and match_rooms tables
*/

-- Step 1: Check for invalid rows (for diagnostics)
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM match_call_signals
  WHERE type NOT IN ('offer', 'answer', 'ice', 'hangup', 'state', 'video_enabled', 'camera_ready');
  
  IF invalid_count > 0 THEN
    RAISE NOTICE 'Found % invalid rows - will delete them', invalid_count;
  ELSE
    RAISE NOTICE 'No invalid rows found - constraint is clean';
  END IF;
END $$;

-- Step 2: Delete any invalid rows
-- This removes rows with signal types that don't match our allowed list
DELETE FROM match_call_signals
WHERE type NOT IN ('offer', 'answer', 'ice', 'hangup', 'state', 'video_enabled', 'camera_ready');

-- Step 3: Drop existing constraint if it exists
ALTER TABLE match_call_signals
DROP CONSTRAINT IF EXISTS match_call_signals_type_check;

-- Step 4: Recreate constraint with correct types
-- Note: We include 'camera_ready' for backward compatibility even though it's deprecated
ALTER TABLE match_call_signals
ADD CONSTRAINT match_call_signals_type_check
CHECK (type IN ('offer', 'answer', 'ice', 'hangup', 'state', 'video_enabled', 'camera_ready'));

-- Step 5: Verify constraint was created successfully
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'match_call_signals_type_check' 
    AND conrelid = 'match_call_signals'::regclass
  ) THEN
    RAISE NOTICE '✓ Constraint match_call_signals_type_check created successfully';
  ELSE
    RAISE EXCEPTION '✗ Failed to create constraint';
  END IF;
END $$;
