-- Add coin_toss_winner_id column to track who won the coin toss
-- This is used to alternate leg starters properly

-- Add the column if it doesn't exist
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS coin_toss_winner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add a column to track if coin toss is completed
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS coin_toss_completed boolean DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_match_rooms_coin_toss_winner_id ON public.match_rooms(coin_toss_winner_id);

COMMENT ON COLUMN public.match_rooms.coin_toss_winner_id IS 'ID of the player who won the coin toss (starts leg 1, 3, 5, etc)';
COMMENT ON COLUMN public.match_rooms.coin_toss_completed IS 'Whether the coin toss has been completed to determine first player';
