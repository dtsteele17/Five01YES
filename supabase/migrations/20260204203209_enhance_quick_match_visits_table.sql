/*
  # Enhance quick_match_visits Table

  ## Summary
  Adds missing columns to quick_match_visits table for complete visit tracking:
  - visit_number (alias for turn_no for clarity)
  - bust_reason (to track why a visit was a bust)
  - is_checkout (to track if this visit won the leg)

  ## Changes
  1. Add bust_reason column
  2. Add is_checkout column
  3. Ensure remaining_before and remaining_after are NOT NULL
*/

-- Add bust_reason column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_match_visits' AND column_name = 'bust_reason'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN bust_reason TEXT;
  END IF;
END $$;

-- Add is_checkout column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_match_visits' AND column_name = 'is_checkout'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN is_checkout BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- Make remaining columns NOT NULL with defaults if they aren't already
ALTER TABLE public.quick_match_visits 
  ALTER COLUMN remaining_before SET NOT NULL,
  ALTER COLUMN remaining_before SET DEFAULT 501;

ALTER TABLE public.quick_match_visits 
  ALTER COLUMN remaining_after SET NOT NULL,
  ALTER COLUMN remaining_after SET DEFAULT 501;

COMMENT ON COLUMN public.quick_match_visits.bust_reason IS 'Reason for bust: manual_bust, below_zero, left_on_one, double_out_required';
COMMENT ON COLUMN public.quick_match_visits.is_checkout IS 'Whether this visit won the leg (remaining_after = 0 and not bust)';
COMMENT ON COLUMN public.quick_match_visits.turn_no IS 'Sequential visit number within this leg (also known as visit_number)';
