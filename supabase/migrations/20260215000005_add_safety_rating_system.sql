-- ============================================================================
-- SAFETY/TRUST RATING SYSTEM
-- ============================================================================
-- Similar to DartCounter.net star rating
-- A=5, B=4, C=3, D=2, E=1

-- 1. Create table to store safety ratings
-- ============================================================================
CREATE TABLE IF NOT EXISTS safety_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rated_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating CHAR(1) NOT NULL CHECK (rating IN ('A', 'B', 'C', 'D', 'E')),
  rating_value INTEGER NOT NULL CHECK (rating_value BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id, rater_id, rated_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_safety_ratings_rated_id ON safety_ratings(rated_id);
CREATE INDEX IF NOT EXISTS idx_safety_ratings_rater_id ON safety_ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_safety_ratings_match_id ON safety_ratings(match_id);

-- 2. Add average safety rating to profiles
-- ============================================================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS safety_rating_avg NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS safety_rating_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS safety_rating_letter CHAR(1) DEFAULT 'C';

-- 3. Function to submit a safety rating
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_safety_rating(
  p_match_id UUID,
  p_rated_id UUID,
  p_rating CHAR(1)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rater_id UUID;
  v_rating_value INTEGER;
  v_existing_rating RECORD;
BEGIN
  v_rater_id := auth.uid();
  
  IF v_rater_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Convert letter to value
  v_rating_value := CASE p_rating
    WHEN 'A' THEN 5
    WHEN 'B' THEN 4
    WHEN 'C' THEN 3
    WHEN 'D' THEN 2
    WHEN 'E' THEN 1
    ELSE 3
  END;
  
  -- Check if already rated this user in this match
  SELECT * INTO v_existing_rating
  FROM safety_ratings
  WHERE match_id = p_match_id AND rater_id = v_rater_id AND rated_id = p_rated_id;
  
  IF v_existing_rating IS NOT NULL THEN
    -- Update existing rating
    UPDATE safety_ratings
    SET rating = p_rating, rating_value = v_rating_value, created_at = now()
    WHERE id = v_existing_rating.id;
  ELSE
    -- Insert new rating
    INSERT INTO safety_ratings (match_id, rater_id, rated_id, rating, rating_value)
    VALUES (p_match_id, v_rater_id, p_rated_id, p_rating, v_rating_value);
  END IF;
  
  -- Update the rated user's average
  PERFORM update_user_safety_rating(p_rated_id);
  
  RETURN jsonb_build_object('success', true, 'rating', p_rating, 'value', v_rating_value);
END;
$$;

-- 4. Function to update a user's average safety rating
-- ============================================================================
CREATE OR REPLACE FUNCTION update_user_safety_rating(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INTEGER;
  v_letter CHAR(1);
BEGIN
  -- Calculate average
  SELECT AVG(rating_value), COUNT(*)
  INTO v_avg, v_count
  FROM safety_ratings
  WHERE rated_id = p_user_id;
  
  -- Convert average to letter
  IF v_count = 0 THEN
    v_letter := 'C';
    v_avg := 0;
  ELSE
    v_letter := CASE
      WHEN v_avg >= 4.5 THEN 'A'
      WHEN v_avg >= 3.5 THEN 'B'
      WHEN v_avg >= 2.5 THEN 'C'
      WHEN v_avg >= 1.5 THEN 'D'
      ELSE 'E'
    END;
  END IF;
  
  -- Update profile
  UPDATE profiles
  SET safety_rating_avg = v_avg,
      safety_rating_count = v_count,
      safety_rating_letter = v_letter
  WHERE user_id = p_user_id;
END;
$$;

-- 5. Function to get user's safety rating
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_safety_rating(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT safety_rating_avg, safety_rating_count, safety_rating_letter
  INTO v_result
  FROM profiles
  WHERE user_id = p_user_id;
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'avg', 0,
      'count', 0,
      'letter', 'C'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'avg', v_result.safety_rating_avg,
    'count', v_result.safety_rating_count,
    'letter', v_result.safety_rating_letter
  );
END;
$$;

-- 6. Function to check if user has already rated in a match
-- ============================================================================
CREATE OR REPLACE FUNCTION has_rated_in_match(p_match_id UUID, p_rated_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rater_id UUID;
  v_exists BOOLEAN;
BEGIN
  v_rater_id := auth.uid();
  
  SELECT EXISTS(
    SELECT 1 FROM safety_ratings
    WHERE match_id = p_match_id 
      AND rater_id = v_rater_id 
      AND rated_id = p_rated_id
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION submit_safety_rating(UUID, UUID, CHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_safety_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_rated_in_match(UUID, UUID) TO authenticated;

-- 7. RLS policies for safety_ratings
-- ============================================================================
ALTER TABLE safety_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ratings about themselves" 
ON safety_ratings FOR SELECT 
USING (rated_id = auth.uid());

CREATE POLICY "Users can view their own ratings" 
ON safety_ratings FOR SELECT 
USING (rater_id = auth.uid());

CREATE POLICY "Users can insert their own ratings" 
ON safety_ratings FOR INSERT 
WITH CHECK (rater_id = auth.uid());

-- 8. Create a view for rating display with colors
-- ============================================================================
CREATE OR REPLACE VIEW user_safety_rating_view AS
SELECT 
  user_id,
  safety_rating_avg,
  safety_rating_count,
  safety_rating_letter,
  CASE safety_rating_letter
    WHEN 'A' THEN 'bg-emerald-500'
    WHEN 'B' THEN 'bg-emerald-400'
    WHEN 'C' THEN 'bg-yellow-400'
    WHEN 'D' THEN 'bg-orange-400'
    WHEN 'E' THEN 'bg-red-500'
    ELSE 'bg-slate-400'
  END as rating_color_class,
  CASE safety_rating_letter
    WHEN 'A' THEN 'text-emerald-500'
    WHEN 'B' THEN 'text-emerald-400'
    WHEN 'C' THEN 'text-yellow-400'
    WHEN 'D' THEN 'text-orange-400'
    WHEN 'E' THEN 'text-red-500'
    ELSE 'text-slate-400'
  END as rating_text_class
FROM profiles;

GRANT SELECT ON user_safety_rating_view TO authenticated;

SELECT 'Safety rating system installed!' AS status;
