-- ============================================
-- FIVE01 Darts - FIXES for Issues
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- FIX 1: Add 'waiting' status to matches
-- ============================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE matches ADD CONSTRAINT matches_status_check 
  CHECK (status IN ('pending', 'waiting', 'active', 'completed', 'abandoned'));

-- ============================================
-- FIX 2: Create tournament bracket function
-- ============================================
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS VOID AS $$
DECLARE
  v_participant_count INTEGER;
  v_rounds INTEGER;
  v_participants UUID[];
  v_i INTEGER;
  v_j INTEGER;
  v_match_number INTEGER := 1;
  v_next_match_id UUID;
  v_match_ids UUID[];
BEGIN
  -- Get participant count
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status IN ('registered', 'checked_in');
  
  -- Calculate rounds needed
  v_rounds := CEIL(LOG(2, v_participant_count));
  
  -- Get participant IDs
  SELECT ARRAY_AGG(player_id) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id AND status IN ('registered', 'checked_in')
  ORDER BY seed;
  
  -- Create first round matches
  FOR v_i IN 1..(2^(v_rounds-1)) LOOP
    INSERT INTO tournament_matches (
      tournament_id,
      round,
      match_number,
      player1_id,
      player2_id,
      status
    ) VALUES (
      p_tournament_id,
      1,
      v_i,
      CASE WHEN v_i*2-1 <= v_participant_count THEN v_participants[v_i*2-1] ELSE NULL END,
      CASE WHEN v_i*2 <= v_participant_count THEN v_participants[v_i*2] ELSE NULL END,
      CASE 
        WHEN v_i*2-1 > v_participant_count OR v_i*2 > v_participant_count THEN 'bye'
        ELSE 'pending'
      END
    )
    RETURNING id INTO v_match_ids[v_i];
  END LOOP;
  
  -- Update tournament
  UPDATE tournaments 
  SET status = 'active',
      current_round = 1,
      total_rounds = v_rounds
  WHERE id = p_tournament_id;
  
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FIX 3: Fix RLS for leagues to allow viewing
-- ============================================
DROP POLICY IF EXISTS "Leagues are viewable by everyone" ON leagues;
CREATE POLICY "Leagues are viewable by everyone"
  ON leagues FOR SELECT
  USING (true);

-- ============================================
-- FIX 4: Fix RLS for tournament participants
-- ============================================
DROP POLICY IF EXISTS "Tournament participants are viewable by everyone" ON tournament_participants;
CREATE POLICY "Tournament participants are viewable by everyone"
  ON tournament_participants FOR SELECT
  USING (true);

-- ============================================
-- FIX 5: Enable realtime for all tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE leagues;
ALTER PUBLICATION supabase_realtime ADD TABLE league_members;

-- ============================================
-- DONE!
-- ============================================
SELECT 'Fixes applied!' as status;
