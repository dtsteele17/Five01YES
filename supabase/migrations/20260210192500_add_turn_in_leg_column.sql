-- Add turn_in_leg column to match_rooms if it doesn't exist
-- This tracks the current turn number within the leg

ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS turn_in_leg INTEGER DEFAULT 1;

-- Update existing rows
UPDATE public.match_rooms 
SET turn_in_leg = 1 
WHERE turn_in_leg IS NULL;

COMMENT ON COLUMN public.match_rooms.turn_in_leg IS 'Current turn number within the current leg';
