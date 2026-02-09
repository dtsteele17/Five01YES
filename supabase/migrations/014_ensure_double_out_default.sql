-- Ensure double_out column exists and has proper default

-- Add column if it doesn't exist
ALTER TABLE public.match_rooms 
ADD COLUMN IF NOT EXISTS double_out BOOLEAN DEFAULT true;

-- Set default for existing rows
ALTER TABLE public.match_rooms 
ALTER COLUMN double_out SET DEFAULT true;

-- Update any NULL values to true (standard darts rules)
UPDATE public.match_rooms 
SET double_out = true 
WHERE double_out IS NULL;

-- Add comment
COMMENT ON COLUMN public.match_rooms.double_out IS 'Whether checkout must be on a double (standard darts rules)';
