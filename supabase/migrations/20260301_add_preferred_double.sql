-- Add preferred_double column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_double text DEFAULT NULL;
