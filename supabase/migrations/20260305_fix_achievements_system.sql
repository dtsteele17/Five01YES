-- ============================================================
-- Fix Achievements System: Reset to 0 + Real Tracking
-- Removes fake progress and implements proper achievement tracking
-- ============================================================

-- 1. CREATE ACHIEVEMENTS TABLES IF NOT EXISTS
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT NOT NULL,
  goal_value INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  reward_badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY achievements_read ON achievements FOR SELECT USING (true);

-- 2. CREATE USER ACHIEVEMENTS TABLE IF NOT EXISTS  
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL, -- references achievements.code
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- Enable RLS
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_achievements_own ON user_achievements FOR ALL USING (auth.uid() = user_id);

-- 3. RESET ALL ACHIEVEMENTS DATA (CLEAR FAKE PROGRESS)
-- Clear existing user achievements with fake progress
DELETE FROM user_achievements;

-- Clear existing achievements definitions
DELETE FROM achievements;

-- 4. INSERT PROPER ACHIEVEMENTS (ALL START AT 0)
INSERT INTO achievements (code, name, description, category, icon, goal_value, xp, reward_badge) VALUES
-- Tournament Achievements
('first-blood', 'First Blood', 'Win your first tournament match', 'tournaments', 'trophy', 1, 100, NULL),
('champion', 'Champion', 'Win 1 tournament', 'tournaments', 'trophy', 1, 250, NULL),
('serial-winner', 'Serial Winner', 'Win 5 tournaments', 'tournaments', 'award', 5, 500, NULL),
('trophy-cabinet', 'Trophy Cabinet', 'Win 10 tournaments', 'tournaments', 'trophy', 10, 1000, NULL),
('elite-champion', 'Elite Champion', 'Win 25 tournaments', 'tournaments', 'crown', 25, 2500, NULL),
('tournament-monster', 'Tournament Monster', 'Win 50 tournaments', 'tournaments', 'flame', 50, 5000, NULL),
('legendary', 'Legendary', 'Win 100 tournaments', 'tournaments', 'star', 100, 10000, NULL),

-- Career Achievements  
('career-starter', 'Career Starter', 'Start your first career', 'career', 'play', 1, 100, NULL),
('promotion-party', 'Promotion Party', 'Get promoted in career mode', 'career', 'trending-up', 1, 400, NULL),
('tier-3-champion', 'County Champion', 'Reach Tier 3 (County Circuit)', 'career', 'shield', 1, 500, NULL),
('career-legend', 'Career Legend', 'Reach Tier 5 (World Tour)', 'career', 'crown', 1, 2000, NULL),

-- League Achievements
('joined-ranks', 'Joined the Ranks', 'Join your first league', 'league', 'users', 1, 100, NULL),
('league-winner', 'League Winner', 'Win 1 league title', 'league', 'trophy', 1, 500, NULL),
('dominant-season', 'Dominant Season', 'Win 5 league titles', 'league', 'award', 5, 2000, NULL),
('invincible-season', 'Invincible Season', 'Finish a league unbeaten', 'league', 'shield', 1, 750, 'invincible'),

-- Scoring Achievements  
('boom', 'Boom!', 'Hit your first 180', 'scoring', 'target', 1, 150, NULL),
('maximum-effort', 'Maximum Effort', 'Hit 5x 180s', 'scoring', 'zap', 5, 300, NULL),
('ton-80-club', 'The Ton 80 Club', 'Hit 10x 180s', 'scoring', 'star', 10, 600, NULL),
('treble-trouble', 'Treble Trouble', 'Hit 25x 180s', 'scoring', 'flame', 25, 1500, NULL),
('180-machine', '180 Machine', 'Hit 50x 180s', 'scoring', 'cpu', 50, 3000, NULL),
('maximum-overload', 'Maximum Overload', 'Hit 100x 180s', 'scoring', 'rocket', 100, 6000, NULL),

-- Checkout Achievements
('checked-out', 'Checked Out', 'Win a leg by checkout', 'scoring', 'check', 1, 50, NULL),
('cool-hand', 'Cool Hand', 'Checkout above 100', 'scoring', 'circle-dot', 1, 200, NULL),
('big-finish', 'Big Finish', 'Checkout above 120', 'scoring', 'target', 1, 300, NULL),
('clutch-finisher', 'Clutch Finisher', 'Checkout above 150', 'scoring', 'zap', 1, 500, NULL),
('170-club', '170 Club', 'Checkout 170', 'scoring', 'award', 1, 1000, 'perfect-checkout'),

-- Milestone Achievements
('ton-up', 'Ton Up', 'Hit 100+', 'milestones', 'arrow-up', 1, 100, NULL),
('ton-machine', 'Ton Machine', 'Hit 10x 100+', 'milestones', 'repeat', 10, 300, NULL),
('heavy-scorer', 'Heavy Scorer', 'Average 60+ in a match', 'milestones', 'trending-up', 1, 200, NULL),
('serious-business', 'Serious Business', 'Average 80+ in a match', 'milestones', 'bar-chart', 1, 400, NULL),
('centurion', 'Centurion', 'Average 100+ in a match', 'milestones', 'trophy', 1, 800, 'centurion'),

-- Ranked Achievements
('ranked-rookie', 'Ranked Rookie', 'Play your first ranked match', 'ranked', 'play', 1, 100, NULL),
('on-the-ladder', 'On The Ladder', 'Win 5 ranked matches', 'ranked', 'trending-up', 5, 250, NULL),
('ranked-grinder', 'Ranked Grinder', 'Win 25 ranked matches', 'ranked', 'award', 25, 1000, NULL),
('win-streak', 'Win Streak', 'Win 5 ranked matches in a row', 'ranked', 'zap', 5, 500, NULL),

-- Training Achievements  
('warm-up', 'Warm Up', 'Complete 10 practice sessions', 'practice', 'activity', 10, 150, NULL),
('dedicated', 'Dedicated', 'Practice 50 times', 'practice', 'target', 50, 500, NULL),
('training-arc', 'Training Arc', 'Practice 100 times', 'practice', 'dumbbell', 100, 1000, 'dedicated'),

-- Around The Clock
('clock-starter', 'Clock Starter', 'Complete Around The Clock once', 'atc', 'clock', 1, 100, NULL),
('clock-master', 'Clock Master', 'Complete 10 times', 'atc', 'timer', 10, 500, NULL),
('speed-runner', 'Speed Runner', 'Complete Around The Clock under 5 minutes', 'atc', 'zap', 1, 750, NULL),

-- Funny Achievements
('nice', 'Nice.', 'Score exactly 69 in a single visit', 'funny', 'smile', 1, 69, 'nice'),
('feared-number', 'The Feared Number', 'Score 26 for the first time', 'funny', 'alert-triangle', 1, 10, NULL),
('double-trouble', 'Double Trouble', 'Miss 5 doubles in a row', 'funny', 'x-circle', 5, 100, 'unlucky'),
('bottle-job', 'The Bottle Job', 'Lose a match from 1 dart away', 'funny', 'alert-circle', 1, 50, 'bottler');

-- 5. RPC: Update Achievement Progress
CREATE OR REPLACE FUNCTION rpc_update_achievement_progress(
  p_achievement_code TEXT,
  p_increment INTEGER DEFAULT 1,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_achievement achievements;
  v_user_achievement user_achievements;
  v_new_progress INTEGER;
  v_newly_completed BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;
  
  -- Get achievement definition
  SELECT * INTO v_achievement FROM achievements WHERE code = p_achievement_code;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Achievement not found: ' || p_achievement_code);
  END IF;
  
  -- Get or create user achievement
  SELECT * INTO v_user_achievement 
  FROM user_achievements 
  WHERE user_id = v_user_id AND achievement_id = p_achievement_code;
  
  IF NOT FOUND THEN
    INSERT INTO user_achievements (user_id, achievement_id, progress)
    VALUES (v_user_id, p_achievement_code, LEAST(p_increment, v_achievement.goal_value))
    RETURNING * INTO v_user_achievement;
    v_new_progress := v_user_achievement.progress;
  ELSE
    -- Don't increment if already completed
    IF v_user_achievement.completed THEN
      RETURN json_build_object(
        'success', true,
        'already_completed', true,
        'achievement', v_achievement.name
      );
    END IF;
    
    v_new_progress := LEAST(v_user_achievement.progress + p_increment, v_achievement.goal_value);
    
    UPDATE user_achievements 
    SET progress = v_new_progress, updated_at = now()
    WHERE id = v_user_achievement.id;
  END IF;
  
  -- Check if newly completed
  IF v_new_progress >= v_achievement.goal_value AND NOT COALESCE(v_user_achievement.completed, FALSE) THEN
    UPDATE user_achievements 
    SET completed = TRUE, completed_at = now(), updated_at = now()
    WHERE user_id = v_user_id AND achievement_id = p_achievement_code;
    v_newly_completed := TRUE;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'achievement', v_achievement.name,
    'progress', v_new_progress,
    'goal', v_achievement.goal_value,
    'newly_completed', v_newly_completed,
    'xp_earned', CASE WHEN v_newly_completed THEN v_achievement.xp ELSE 0 END
  );
END;
$$;

-- 6. RPC: Track Multiple Achievements At Once
CREATE OR REPLACE FUNCTION rpc_track_match_achievements(
  p_match_data JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_achievements_updated JSON[] := '{}';
  v_result JSON;
  v_total_xp INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;
  
  -- Track 180s
  IF (p_match_data->>'one_eighties')::integer > 0 THEN
    SELECT rpc_update_achievement_progress('boom', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
    
    SELECT rpc_update_achievement_progress('maximum-effort', (p_match_data->>'one_eighties')::integer) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
    
    SELECT rpc_update_achievement_progress('ton-80-club', (p_match_data->>'one_eighties')::integer) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Track 100+ scores
  IF (p_match_data->>'hundreds')::integer > 0 THEN
    SELECT rpc_update_achievement_progress('ton-up', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
    
    SELECT rpc_update_achievement_progress('ton-machine', (p_match_data->>'hundreds')::integer) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Track high checkouts
  IF (p_match_data->>'highest_checkout')::integer >= 170 THEN
    SELECT rpc_update_achievement_progress('170-club', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  ELSIF (p_match_data->>'highest_checkout')::integer >= 150 THEN
    SELECT rpc_update_achievement_progress('clutch-finisher', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  ELSIF (p_match_data->>'highest_checkout')::integer >= 120 THEN
    SELECT rpc_update_achievement_progress('big-finish', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  ELSIF (p_match_data->>'highest_checkout')::integer >= 100 THEN
    SELECT rpc_update_achievement_progress('cool-hand', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Track checkouts
  IF (p_match_data->>'checkouts')::integer > 0 THEN
    SELECT rpc_update_achievement_progress('checked-out', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Track high averages
  IF (p_match_data->>'average')::numeric >= 100 THEN
    SELECT rpc_update_achievement_progress('centurion', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  ELSIF (p_match_data->>'average')::numeric >= 80 THEN
    SELECT rpc_update_achievement_progress('serious-business', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  ELSIF (p_match_data->>'average')::numeric >= 60 THEN
    SELECT rpc_update_achievement_progress('heavy-scorer', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Track match type specific achievements
  IF p_match_data->>'match_type' = 'ranked' THEN
    SELECT rpc_update_achievement_progress('ranked-rookie', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
    
    IF (p_match_data->>'won')::boolean THEN
      SELECT rpc_update_achievement_progress('on-the-ladder', 1) INTO v_result;
      v_achievements_updated := array_append(v_achievements_updated, v_result);
    END IF;
  ELSIF p_match_data->>'match_type' = 'tournament' THEN
    SELECT rpc_update_achievement_progress('first-blood', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
    
    IF (p_match_data->>'won')::boolean THEN
      SELECT rpc_update_achievement_progress('champion', 1) INTO v_result;
      v_achievements_updated := array_append(v_achievements_updated, v_result);
    END IF;
  ELSIF p_match_data->>'match_type' = 'practice' THEN
    SELECT rpc_update_achievement_progress('warm-up', 1) INTO v_result;
    v_achievements_updated := array_append(v_achievements_updated, v_result);
  END IF;
  
  -- Calculate total XP earned
  SELECT SUM((achievement->>'xp_earned')::integer) INTO v_total_xp 
  FROM unnest(v_achievements_updated) AS achievement;
  
  RETURN json_build_object(
    'success', true,
    'achievements_updated', v_achievements_updated,
    'total_xp_earned', COALESCE(v_total_xp, 0)
  );
END;
$$;

-- 7. RPC: Get User Achievement Progress
CREATE OR REPLACE FUNCTION rpc_get_user_achievements(
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
  v_achievements JSON;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;
  
  SELECT json_agg(
    json_build_object(
      'id', a.code,
      'title', a.name,
      'description', a.description,
      'category', a.category,
      'icon', a.icon,
      'goal', a.goal_value,
      'xp', a.xp,
      'reward_badge', a.reward_badge,
      'progress', COALESCE(ua.progress, 0),
      'completed', COALESCE(ua.completed, false),
      'completed_at', ua.completed_at
    )
    ORDER BY a.category, a.goal_value, a.name
  ) INTO v_achievements
  FROM achievements a
  LEFT JOIN user_achievements ua ON ua.achievement_id = a.code AND ua.user_id = v_user_id;
  
  RETURN json_build_object(
    'success', true,
    'achievements', v_achievements
  );
END;
$$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed achievements system: Reset all progress to 0, added proper tracking, created real achievement system';
END $$;