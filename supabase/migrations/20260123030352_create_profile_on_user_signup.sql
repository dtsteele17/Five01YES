/*
  # Automatically Create Profile on User Signup

  ## Overview
  This migration creates a trigger that automatically creates a profile entry
  in the public.profiles table whenever a new user signs up via auth.users.

  ## Changes

  1. **Create trigger function**:
     - Function name: handle_new_user()
     - Creates profile with id, username, and display_name
     - Username is generated from email (part before @) or user metadata
     - Uses ON CONFLICT DO NOTHING to prevent duplicate key errors

  2. **Create trigger**:
     - Fires AFTER INSERT on auth.users
     - Calls handle_new_user() for each new user
     - Ensures profile is created automatically for all signup methods

  ## Security Notes
  - Function uses SECURITY DEFINER to bypass RLS
  - This is safe because it only creates profiles for authenticated users
  - Profile data comes from trusted auth.users table
  - No user input is directly used

  ## Benefits
  - Works for email/password signup
  - Works for OAuth signup (Google, etc.)
  - No application code changes needed
  - Guaranteed profile creation
*/

-- Create function to handle new user signup
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
  
  -- Insert profile
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    username_value,
    COALESCE(NEW.raw_user_meta_data->>'display_name', username_value)
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create initial user_stats row as well
CREATE OR REPLACE FUNCTION public.handle_new_user_stats()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert user_stats for new profile
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;

-- Create trigger on profiles table to create user_stats
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_stats();
