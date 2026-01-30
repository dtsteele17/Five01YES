/*
  # Add Profile Fields

  ## Overview
  This migration adds additional profile fields to support user profile customization.

  ## Changes to Tables

  ### `profiles`
  Added columns:
  - `location` (text, nullable) - User's location (City, Country format)
  - `about` (text, nullable) - User bio/about text (max 400 chars)
  - `favorite_format` (text, nullable) - User's favorite game format (301, 501)
  - `playing_since` (integer, nullable) - Year user started playing darts
  - `preferred_hand` (text, nullable) - User's preferred throwing hand (Left, Right)
  - `updated_at` (timestamptz) - Track profile updates

  ## Notes
  - All new fields are nullable to support existing profiles
  - No RLS changes needed as existing policies already cover these fields
*/

-- Add new profile fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'location'
  ) THEN
    ALTER TABLE profiles ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'about'
  ) THEN
    ALTER TABLE profiles ADD COLUMN about text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'favorite_format'
  ) THEN
    ALTER TABLE profiles ADD COLUMN favorite_format text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'playing_since'
  ) THEN
    ALTER TABLE profiles ADD COLUMN playing_since integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'preferred_hand'
  ) THEN
    ALTER TABLE profiles ADD COLUMN preferred_hand text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add check constraints for data validation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_favorite_format_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_favorite_format_check
    CHECK (favorite_format IN ('301', '501') OR favorite_format IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_preferred_hand_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_preferred_hand_check
    CHECK (preferred_hand IN ('Left', 'Right') OR preferred_hand IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_playing_since_check'
  ) THEN
    ALTER TABLE profiles
    ADD CONSTRAINT profiles_playing_since_check
    CHECK (playing_since >= 1900 AND playing_since <= EXTRACT(YEAR FROM CURRENT_DATE) OR playing_since IS NULL);
  END IF;
END $$;
