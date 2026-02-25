-- =======================================================
-- TOURNAMENT LOADING FIX - NO JSON SYNTAX ERRORS
-- =======================================================

-- =======================================================
-- 1. Fix tournaments table RLS
-- =======================================================

-- Drop ALL existing policies on tournaments
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'tournaments'
        AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON tournaments';
    END LOOP;
END $$;

-- Create simple, clear policies for tournaments
CREATE POLICY "Anyone authenticated can view tournaments" 
ON tournaments FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can create tournaments" 
ON tournaments FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Tournament creators can update tournaments" 
ON tournaments FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Tournament creators can delete tournaments" 
ON tournaments FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- =======================================================
-- 2. Fix tournament_participants table RLS  
-- =======================================================

-- Drop ALL existing policies on tournament_participants
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'tournament_participants'
        AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON tournament_participants';
    END LOOP;
END $$;

-- Create simple policies for tournament_participants
CREATE POLICY "Anyone authenticated can view tournament participants" 
ON tournament_participants FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users can join tournaments" 
ON tournament_participants FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their participation" 
ON tournament_participants FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave tournaments" 
ON tournament_participants FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- =======================================================
-- 3. Fix tournament_matches table RLS
-- =======================================================

-- Drop ALL existing policies on tournament_matches
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'tournament_matches'
        AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || policy_record.policyname || '" ON tournament_matches';
    END LOOP;
END $$;

-- Create simple policies for tournament_matches
CREATE POLICY "Anyone authenticated can view tournament matches" 
ON tournament_matches FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Tournament system can manage matches" 
ON tournament_matches FOR ALL
TO authenticated
USING (
  -- Tournament creator
  EXISTS(SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  OR
  -- Match participants  
  (player1_id = auth.uid() OR player2_id = auth.uid())
);

-- =======================================================
-- 4. Create tournament summary view
-- =======================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS tournament_summary;

-- Create a view that combines tournament data with participant counts
CREATE VIEW tournament_summary AS
SELECT 
  t.*,
  COALESCE(p.participant_count, 0) as participant_count
FROM tournaments t
LEFT JOIN (
  SELECT 
    tournament_id,
    COUNT(*) as participant_count
  FROM tournament_participants
  GROUP BY tournament_id
) p ON t.id = p.tournament_id;

-- Grant access to the view
GRANT SELECT ON tournament_summary TO authenticated;

-- =======================================================
-- 5. Create RPC function without JSON issues
-- =======================================================

CREATE OR REPLACE FUNCTION get_tournaments_with_user_status()
RETURNS TABLE(
  id UUID,
  name TEXT,
  description TEXT,
  start_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  max_participants INTEGER,
  round_scheduling TEXT,
  entry_type TEXT,
  game_mode INTEGER,
  legs_per_match INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  bracket_generated_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  winner_id UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  participant_count BIGINT,
  is_registered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.description,
    t.start_at,
    t.status,
    t.max_participants,
    t.round_scheduling,
    t.entry_type,
    t.game_mode,
    t.legs_per_match,
    t.created_by,
    t.created_at,
    t.bracket_generated_at,
    t.started_at,
    t.winner_id,
    t.completed_at,
    COALESCE(p.participant_count, 0) as participant_count,
    COALESCE(ur.is_registered, false) as is_registered
  FROM tournaments t
  LEFT JOIN (
    SELECT 
      tournament_id,
      COUNT(*) as participant_count
    FROM tournament_participants
    GROUP BY tournament_id
  ) p ON t.id = p.tournament_id
  LEFT JOIN (
    SELECT 
      tournament_id,
      true as is_registered
    FROM tournament_participants
    WHERE user_id = auth.uid()
  ) ur ON t.id = ur.tournament_id
  ORDER BY t.created_at DESC;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_tournaments_with_user_status() TO authenticated;

-- =======================================================
-- 6. Tournament status update function (simplified)
-- =======================================================

CREATE OR REPLACE FUNCTION update_tournament_statuses()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Move tournaments from registration to ready when start time is reached
  UPDATE tournaments 
  SET status = 'ready',
      bracket_generated_at = CASE 
        WHEN bracket_generated_at IS NULL THEN NOW() 
        ELSE bracket_generated_at 
      END
  WHERE status = 'registration' 
  AND start_at <= NOW()
  AND EXISTS(
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = tournaments.id 
    HAVING COUNT(*) >= 2
  );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Cancel tournaments with insufficient participants
  UPDATE tournaments 
  SET status = 'cancelled'
  WHERE status = 'registration' 
  AND start_at <= NOW()
  AND NOT EXISTS(
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = tournaments.id 
    HAVING COUNT(*) >= 2
  );

  -- Move tournaments to in_progress when matches start
  UPDATE tournaments 
  SET status = 'in_progress',
      started_at = CASE WHEN started_at IS NULL THEN NOW() ELSE started_at END
  WHERE status = 'ready'
  AND EXISTS(
    SELECT 1 FROM tournament_matches 
    WHERE tournament_id = tournaments.id 
    AND status IN ('in_progress', 'starting')
  );

  RETURN 'Updated ' || updated_count || ' tournaments';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_tournament_statuses() TO authenticated;

-- =======================================================
-- SUCCESS CONFIRMATION
-- =======================================================

-- Simple success message without JSON
SELECT 'Tournament visibility and loading fixed successfully!' as status;