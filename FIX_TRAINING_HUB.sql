-- ============================================
-- FIX TRAINING HUB - Run this in Supabase SQL Editor
-- ============================================

-- 1. Create training_stats table if it doesn't exist
CREATE TABLE IF NOT EXISTS training_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL,
  training_mode VARCHAR(50) DEFAULT 'practice',
  score INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  xp_earned INTEGER DEFAULT 0,
  session_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE training_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own training stats" ON training_stats;
CREATE POLICY "Users can view their own training stats"
  ON training_stats FOR SELECT
  USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "Users can insert their own training stats" ON training_stats;
CREATE POLICY "Users can insert their own training stats"
  ON training_stats FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- 2. Add xp_earned column to match_history if it doesn't exist
ALTER TABLE match_history
ADD COLUMN IF NOT EXISTS xp_earned INTEGER DEFAULT 0;

-- 3. Create get_player_total_xp function
CREATE OR REPLACE FUNCTION get_player_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_match_xp INTEGER := 0;
  v_training_xp INTEGER := 0;
BEGIN
  -- Get XP from match_history
  SELECT COALESCE(SUM(xp_earned), 0)
  INTO v_match_xp
  FROM match_history
  WHERE user_id = p_user_id;

  -- Get XP from training_stats
  SELECT COALESCE(SUM(xp_earned), 0)
  INTO v_training_xp
  FROM training_stats
  WHERE player_id = p_user_id;

  RETURN v_match_xp + v_training_xp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create get_player_training_level function
CREATE OR REPLACE FUNCTION get_player_training_level(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total_xp INTEGER;
  v_level INTEGER := 1;
  v_xp_for_next INTEGER;
  v_xp_into_level INTEGER;
  v_progress INTEGER;
BEGIN
  -- Get total XP
  v_total_xp := get_player_total_xp(p_user_id);

  -- Calculate level (Level N requires (N-1) * (50 + 25 * N) total XP)
  v_level := 1;
  WHILE (v_level * (50 + 25 * (v_level + 1))) <= v_total_xp LOOP
    v_level := v_level + 1;
  END LOOP;

  -- Calculate progress to next level
  v_xp_for_next := v_level * (50 + 25 * (v_level + 1));
  v_xp_into_level := v_total_xp - ((v_level - 1) * (50 + 25 * v_level));
  v_progress := CASE
    WHEN v_xp_for_next > 0 THEN
      LEAST(100, GREATEST(0, ROUND((v_xp_into_level::numeric * 100 / (v_xp_for_next - (v_level - 1) * (50 + 25 * v_level))))))
    ELSE 100
  END;

  RETURN jsonb_build_object(
    'level', v_level,
    'total_xp', v_total_xp,
    'xp_to_next_level', v_xp_for_next - v_total_xp,
    'progress', v_progress
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION get_player_total_xp TO authenticated;
GRANT EXECUTE ON FUNCTION get_player_training_level TO authenticated;

-- Done!
SELECT 'Training Hub functions created successfully!' as status;
