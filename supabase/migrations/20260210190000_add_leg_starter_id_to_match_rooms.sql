-- Add leg_starter_id column to match_rooms table
-- This column tracks which player starts each leg (for alternating starts)

-- Add the column if it doesn't exist
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS leg_starter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update existing rows to set leg_starter_id to player1_id if null
UPDATE public.match_rooms 
SET leg_starter_id = player1_id 
WHERE leg_starter_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_match_rooms_leg_starter_id ON public.match_rooms(leg_starter_id);

COMMENT ON COLUMN public.match_rooms.leg_starter_id IS 'ID of the player who starts the current leg (alternates each leg)';
