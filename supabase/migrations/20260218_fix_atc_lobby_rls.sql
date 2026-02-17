-- ============================================================================
-- FIX: Allow ATC lobby players to view the lobby
-- ============================================================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view open lobbies or their own" ON public.quick_match_lobbies;

-- Create updated policy that allows players in the lobby to view it
CREATE POLICY "Users can view open lobbies, their own, or where they are a player"
  ON public.quick_match_lobbies
  FOR SELECT
  TO authenticated
  USING (
    status = 'open' OR
    created_by = auth.uid() OR
    player1_id = auth.uid() OR
    player2_id = auth.uid() OR
    EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(players) AS player
      WHERE player->>'id' = auth.uid()::text
    )
  );

-- Also update the policy to allow lobby updates by players in the lobby (for ready status)
DROP POLICY IF EXISTS "Host can update their lobby" ON public.quick_match_lobbies;

CREATE POLICY "Host can update their lobby or players can update ready status"
  ON public.quick_match_lobbies
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(players) AS player
      WHERE player->>'id' = auth.uid()::text
    )
  );

SELECT 'ATC lobby RLS policies updated!' as status;
