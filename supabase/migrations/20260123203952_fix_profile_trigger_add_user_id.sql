/*
  # Fix Profile Creation Trigger to Include user_id

  ## Overview
  This migration updates the handle_new_user() trigger function to properly set
  the user_id field when creating profiles. The user_id field is required by
  foreign key constraints in tournaments, matches, and other tables.

  ## Changes
  
  1. **Update handle_new_user() function**:
     - Now inserts both `id` and `user_id` with the same value (NEW.id)
     - This ensures all foreign key references work correctly
     - Maintains backward compatibility with existing logic

  ## Why This Is Needed
  - The profiles table has a `user_id` column that references the auth user
  - Many tables (tournaments, matches, lobbies) reference profiles.user_id
  - Without setting user_id, these foreign key constraints fail
  - This ensures seamless authentication flow

  ## Security Notes
  - Uses SECURITY DEFINER to bypass RLS (safe for system operations)
  - Only operates on trusted auth.users data
  - No user input is directly used
*/

-- Update function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  username_value text;
BEGIN
  -- Try to get username from user metadata first
  username_value := NEW.raw_user_meta_data->>'username';
  
  -- If not in metadata, generate from email
  IF username_value IS NULL OR username_value = '' THEN
    username_value := split_part(NEW.email, '@', 1);
  END IF;
  
  -- Make username unique by appending random suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_value) LOOP
    username_value := split_part(NEW.email, '@', 1) || '_' || substr(md5(random()::text), 1, 6);
  END LOOP;
  
  -- Insert profile with BOTH id and user_id set to auth user id
  INSERT INTO public.profiles (id, user_id, username, display_name)
  VALUES (
    NEW.id,
    NEW.id,  -- Critical: set user_id to match id
    username_value,
    COALESCE(NEW.raw_user_meta_data->>'display_name', username_value)
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;
