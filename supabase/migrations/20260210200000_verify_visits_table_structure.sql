-- Verify and fix the quick_match_visits table structure if needed

-- Ensure all required columns exist with correct types
DO $$
BEGIN
  -- Add is_checkout column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_match_visits' AND column_name = 'is_checkout'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN is_checkout BOOLEAN DEFAULT FALSE;
  END IF;

  -- Add darts_thrown column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_match_visits' AND column_name = 'darts_thrown'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN darts_thrown INTEGER DEFAULT 3;
  END IF;

  -- Add remaining_before column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_match_visits' AND column_name = 'remaining_before'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN remaining_before INTEGER DEFAULT 501;
  END IF;

  -- Add leg column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quick_match_visits' AND column_name = 'leg'
  ) THEN
    ALTER TABLE public.quick_match_visits ADD COLUMN leg INTEGER DEFAULT 1;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_room_player ON public.quick_match_visits(room_id, player_id);
CREATE INDEX IF NOT EXISTS idx_quick_match_visits_checkout ON public.quick_match_visits(is_checkout) WHERE is_checkout = TRUE;

-- Verify recent visits have correct data
SELECT 
  'Recent visits sample' as info,
  COUNT(*) as total_visits,
  COUNT(*) FILTER (WHERE is_checkout = TRUE) as checkout_visits,
  COUNT(*) FILTER (WHERE darts_thrown IS NULL) as missing_darts_thrown,
  COUNT(*) FILTER (WHERE remaining_before IS NULL) as missing_remaining_before
FROM public.quick_match_visits
WHERE created_at > NOW() - INTERVAL '1 day';
