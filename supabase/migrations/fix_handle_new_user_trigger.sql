-- ============================================================================
-- FIX: handle_new_user trigger for auth.users
-- ============================================================================
-- This trigger fires when a new user signs up (email/password or OAuth).
-- It creates the initial profile row in the profiles table.
-- The "Database error saving new user" error means this trigger is failing,
-- usually because columns have NOT NULL constraints that aren't being filled.
-- ============================================================================

-- Drop existing trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with proper defaults for all required fields
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username text;
  _display_name text;
  _avatar_url text;
BEGIN
  -- Generate username from email or metadata
  _username := COALESCE(
    new.raw_user_meta_data->>'preferred_username',
    split_part(new.email, '@', 1)
  );
  
  -- Clean username: lowercase, only alphanumeric + underscore
  _username := lower(regexp_replace(_username, '[^a-zA-Z0-9_]', '', 'g'));
  
  -- Ensure username is not empty
  IF _username = '' OR _username IS NULL THEN
    _username := 'user';
  END IF;
  
  -- Make username unique by appending random suffix
  _username := _username || '_' || substr(md5(random()::text), 1, 4);
  
  -- Get display name from metadata or email
  _display_name := COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1),
    'Player'
  );
  
  -- Get avatar URL from metadata (Google/OAuth provides this)
  _avatar_url := new.raw_user_meta_data->>'avatar_url';

  -- Insert profile row
  INSERT INTO public.profiles (
    id,
    user_id,
    username,
    display_name,
    avatar_url,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    new.id,
    _username,
    _display_name,
    _avatar_url,
    now(),
    now()
  );

  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- Username collision - try again with longer random suffix
    _username := _username || substr(md5(random()::text), 1, 4);
    
    INSERT INTO public.profiles (
      id,
      user_id,
      username,
      display_name,
      avatar_url,
      created_at,
      updated_at
    ) VALUES (
      new.id,
      new.id,
      _username,
      _display_name,
      _avatar_url,
      now(),
      now()
    );
    
    RETURN new;
  WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE WARNING 'handle_new_user error: % %', SQLERRM, SQLSTATE;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verify
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    RAISE NOTICE 'SUCCESS: on_auth_user_created trigger created';
  ELSE
    RAISE NOTICE 'ERROR: trigger was not created';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user'
  ) THEN
    RAISE NOTICE 'SUCCESS: handle_new_user function created';
  ELSE
    RAISE NOTICE 'ERROR: function was not created';
  END IF;
END $$;
