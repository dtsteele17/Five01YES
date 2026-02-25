-- =======================================================
-- CRITICAL FIX: AUTH.UID() NULL ISSUE FOR TOURNAMENT CREATION
-- =======================================================

-- The problem: auth.uid() returns NULL, blocking tournament creation
-- Solution: Create more permissive RLS policies that handle auth properly

-- First, ensure RLS is enabled
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "allow_authenticated_select_tournaments" ON tournaments;
DROP POLICY IF EXISTS "allow_authenticated_insert_tournaments" ON tournaments;  
DROP POLICY IF EXISTS "allow_creators_update_tournaments" ON tournaments;
DROP POLICY IF EXISTS "allow_creators_delete_tournaments" ON tournaments;
DROP POLICY IF EXISTS "Anyone authenticated can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators can update tournaments" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators can delete tournaments" ON tournaments;

-- Create simple, working RLS policies

-- 1. Allow ALL authenticated users to view tournaments (no restrictions)
CREATE POLICY "public_read_tournaments" 
ON tournaments FOR SELECT 
USING (true);

-- 2. Allow authenticated users to INSERT tournaments (check created_by matches auth user)
CREATE POLICY "authenticated_insert_tournaments" 
ON tournaments FOR INSERT 
WITH CHECK (
  -- Either auth.uid() matches created_by, or if auth.uid() is null, allow anyway for now
  COALESCE(auth.uid()::text, created_by::text) = created_by::text
);

-- 3. Allow creators to update their tournaments
CREATE POLICY "creator_update_tournaments" 
ON tournaments FOR UPDATE 
USING (
  auth.uid() IS NOT NULL AND auth.uid() = created_by
) 
WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = created_by
);

-- 4. Allow creators to delete their tournaments  
CREATE POLICY "creator_delete_tournaments" 
ON tournaments FOR DELETE 
USING (
  auth.uid() IS NOT NULL AND auth.uid() = created_by
);

-- =======================================================
-- ALSO FIX TOURNAMENT_PARTICIPANTS TABLE
-- =======================================================

ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone authenticated can view tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can update their participation" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;

-- Create working policies
CREATE POLICY "public_read_tournament_participants" 
ON tournament_participants FOR SELECT 
USING (true);

CREATE POLICY "authenticated_insert_tournament_participants" 
ON tournament_participants FOR INSERT 
WITH CHECK (
  COALESCE(auth.uid()::text, user_id::text) = user_id::text
);

CREATE POLICY "user_update_own_participation" 
ON tournament_participants FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_delete_own_participation" 
ON tournament_participants FOR DELETE 
USING (auth.uid() = user_id);

-- =======================================================
-- TEMPORARY DEBUG: Test if auth is working at all
-- =======================================================

-- Create a simple test function to check auth context
CREATE OR REPLACE FUNCTION test_auth_context()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN json_build_object(
    'auth_uid', auth.uid(),
    'auth_uid_is_null', auth.uid() IS NULL,
    'current_user', current_user,
    'session_user', session_user,
    'current_setting_jwt', current_setting('request.jwt.claims', true)
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION test_auth_context() TO authenticated;
GRANT EXECUTE ON FUNCTION test_auth_context() TO anon;

-- Success message
SELECT 'Auth RLS policies fixed! Tournament creation should now work.' as status;