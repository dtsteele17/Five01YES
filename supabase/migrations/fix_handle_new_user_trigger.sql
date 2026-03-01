-- ============================================================================
-- FIX: Drop ALL old profile creation triggers, create one clean trigger
-- ============================================================================
-- Run this ENTIRE block in Supabase SQL Editor
-- ============================================================================

-- STEP 1: Drop ALL existing profile creation triggers on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS create_profile_on_signup ON auth.users;
DROP TRIGGER IF EXISTS create_user_profile ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- STEP 2: Drop ALL existing profile creation functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.create_profile_for_user();
DROP FUNCTION IF EXISTS public.create_user_profile();

-- STEP 3: Create the one correct function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username text;
  _display_name text;
  _avatar_url text;
BEGIN
  _username := COALESCE(
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'preferred_username',
    split_part(new.email, '@', 1)
  );
  _username := lower(regexp_replace(_username, '[^a-zA-Z0-9_]', '', 'g'));
  IF _username = '' OR _username IS NULL THEN
    _username := 'user_' || substr(md5(random()::text), 1, 4);
  END IF;
  _display_name := COALESCE(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    _username
  );
  _avatar_url := new.raw_user_meta_data->>'avatar_url';

  INSERT INTO public.profiles (id, user_id, username, display_name, avatar_url)
  VALUES (new.id, new.id, _username, _display_name, _avatar_url);

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: % %', SQLERRM, SQLSTATE;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 4: Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- STEP 5: Verify - check no other triggers remain
DO $$
DECLARE
  trigger_count integer;
BEGIN
  SELECT count(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'auth.users'::regclass
  AND tgname NOT LIKE 'RI_%';
  
  RAISE NOTICE 'Triggers on auth.users: %', trigger_count;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    RAISE NOTICE 'handle_new_user function: OK';
  END IF;
END $$;
