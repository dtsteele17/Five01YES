/*
  # Add Country Field to Profiles
  
  ## Overview
  This migration adds the country field to the profiles table for better
  user geographic information.
  
  ## Changes to Tables
  
  ### `profiles`
  Added columns:
  - `country` (text, nullable) - User's country
  
  ## Notes
  - Field is nullable to support existing profiles
  - No RLS changes needed as existing policies cover this field
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'country'
  ) THEN
    ALTER TABLE profiles ADD COLUMN country text;
  END IF;
END $$;
