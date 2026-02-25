-- =======================================================
-- FIX TOURNAMENT VISIBILITY - Allow all users to see tournaments
-- =======================================================

-- Drop existing RLS policies on tournaments table
DROP POLICY IF EXISTS "Users can view tournaments they created" ON tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can update their own tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can delete their own tournaments" ON tournaments;
DROP POLICY IF EXISTS "Public can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Anyone can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can view all tournaments" ON tournaments;

-- Create new RLS policies that allow proper visibility

-- 1. Allow ALL authenticated users to VIEW all tournaments
CREATE POLICY "All authenticated users can view tournaments" 
ON tournaments FOR SELECT 
TO authenticated
USING (true);

-- 2. Allow authenticated users to CREATE tournaments
CREATE POLICY "Authenticated users can create tournaments" 
ON tournaments FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 3. Allow users to UPDATE only their own tournaments
CREATE POLICY "Tournament creators can update their tournaments" 
ON tournaments FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- 4. Allow users to DELETE only their own tournaments
CREATE POLICY "Tournament creators can delete their tournaments" 
ON tournaments FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- =======================================================
-- Also fix tournament_participants visibility
-- =======================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;

-- Allow all authenticated users to view participants
CREATE POLICY "All authenticated users can view tournament participants" 
ON tournament_participants FOR SELECT 
TO authenticated
USING (true);

-- Allow users to join tournaments (insert their own participation)
CREATE POLICY "Users can join tournaments" 
ON tournament_participants FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to leave tournaments (delete their own participation)
CREATE POLICY "Users can leave tournaments" 
ON tournament_participants FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- =======================================================
-- Fix tournament_matches visibility  
-- =======================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tournament matches" ON tournament_matches;

-- Allow all authenticated users to view tournament matches
CREATE POLICY "All authenticated users can view tournament matches" 
ON tournament_matches FOR SELECT 
TO authenticated
USING (true);

-- Allow tournament system to update matches (for bracket progression)
CREATE POLICY "System can update tournament matches" 
ON tournament_matches FOR UPDATE 
TO authenticated
USING (
  -- Tournament creator can update
  EXISTS(SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  OR
  -- Players in the match can update (for match completion)
  (player1_id = auth.uid() OR player2_id = auth.uid())
);

-- =======================================================
-- Update tournament status transitions for proper flow
-- =======================================================

-- Function to update tournament status based on time and participation
CREATE OR REPLACE FUNCTION update_tournament_status()
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_updated_count INTEGER := 0;
BEGIN
  -- Update tournaments that should transition from registration to ready
  FOR v_tournament IN 
    SELECT * FROM tournaments 
    WHERE status = 'registration' 
    AND start_at <= NOW()
  LOOP
    -- Count participants
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id;
    
    IF v_participant_count >= 2 THEN
      -- Enough participants, move to ready and generate bracket
      UPDATE tournaments 
      SET status = 'ready',
          bracket_generated_at = NOW()
      WHERE id = v_tournament.id;
      
      -- Generate bracket
      PERFORM generate_tournament_bracket(v_tournament.id);
      
      v_updated_count := v_updated_count + 1;
    ELSE
      -- Not enough participants, cancel tournament
      UPDATE tournaments 
      SET status = 'cancelled'
      WHERE id = v_tournament.id;
    END IF;
  END LOOP;

  -- Update tournaments from ready to in_progress when first match starts
  UPDATE tournaments 
  SET status = 'in_progress',
      started_at = NOW()
  WHERE status = 'ready' 
  AND EXISTS(
    SELECT 1 FROM tournament_matches 
    WHERE tournament_id = tournaments.id 
    AND status = 'in_progress'
  );

  RETURN json_build_object(
    'success', true,
    'updated_tournaments', v_updated_count,
    'message', 'Tournament statuses updated'
  );
END;
$function$;

-- =======================================================
-- Success message
-- =======================================================

DO $$
BEGIN
  RAISE NOTICE 'Tournament visibility fixed!';
  RAISE NOTICE 'All authenticated users can now see:';
  RAISE NOTICE '- All tournaments (any status)';
  RAISE NOTICE '- All tournament participants';
  RAISE NOTICE '- All tournament matches';
  RAISE NOTICE '';
  RAISE NOTICE 'Tournaments will now appear in:';
  RAISE NOTICE '- "Open to Join" tab when status = registration or ready';
  RAISE NOTICE '- "Live Now" tab when status = in_progress';
  RAISE NOTICE '- "Completed" tab when status = completed';
END $$;