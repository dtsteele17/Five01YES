-- =======================================================
-- FIX TOURNAMENT RLS POLICIES - COMPREHENSIVE FIX
-- =======================================================

-- Drop all existing policies and recreate them properly
DROP POLICY IF EXISTS "Anyone authenticated can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments; 
DROP POLICY IF EXISTS "Tournament creators can update tournaments" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators can delete tournaments" ON tournaments;
DROP POLICY IF EXISTS "Authenticated users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "All authenticated users can view tournaments" ON tournaments;

-- Enable RLS if not already enabled
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Simple, permissive policies for testing
CREATE POLICY "allow_authenticated_select_tournaments" 
ON tournaments FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "allow_authenticated_insert_tournaments" 
ON tournaments FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "allow_creators_update_tournaments" 
ON tournaments FOR UPDATE 
TO authenticated 
USING (auth.uid() = created_by) 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "allow_creators_delete_tournaments" 
ON tournaments FOR DELETE 
TO authenticated 
USING (auth.uid() = created_by);

-- Check if there are any constraints causing issues
SELECT conname, contype, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'tournaments'::regclass;

-- Test insert with a simple record
DO $$
BEGIN
  -- This should work if RLS policies are correct
  INSERT INTO tournaments (
    name,
    start_at,
    max_participants,
    status,
    created_by,
    game_mode,
    legs_per_match,
    double_out,
    round_scheduling,
    entry_type
  ) VALUES (
    'RLS Test Tournament',
    NOW() + INTERVAL '1 day',
    8,
    'scheduled',
    auth.uid(),
    501,
    3,
    true,
    'one_day',
    'open'
  );
  
  RAISE NOTICE 'RLS Test Insert Successful';
EXCEPTION 
  WHEN OTHERS THEN
    RAISE NOTICE 'RLS Test Insert Failed: %', SQLERRM;
END $$;