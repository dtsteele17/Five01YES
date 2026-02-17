-- ============================================================================
-- FINAL TRUST RATING SYSTEM FIX
-- ============================================================================
-- This migration ensures the trust rating system works end-to-end:
-- 1. User rates opponent in WinnerPopup
-- 2. Rating is saved to safety_ratings table
-- 3. Profile is updated with new trust_rating columns
-- 4. Profile displays updated rating

-- 1. Ensure all trust_rating columns exist
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_avg') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_avg NUMERIC(3,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_count') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_letter CHAR(1);
  END IF;
END $$;

-- 2. Ensure safety_ratings table exists and has proper constraints
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_safety_ratings_rated_id ON safety_ratings(rated_id);
CREATE INDEX IF NOT EXISTS idx_safety_ratings_match_id ON safety_ratings(match_id);

-- Enable RLS
ALTER TABLE safety_ratings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view ratings about themselves" ON safety_ratings;
DROP POLICY IF EXISTS "Users can view their own ratings" ON safety_ratings;
DROP POLICY IF EXISTS "Users can insert their own ratings" ON safety_ratings;

-- RLS Policies
CREATE POLICY "Users can view ratings about themselves" 
ON safety_ratings FOR SELECT 
USING (rated_id = auth.uid());

CREATE POLICY "Users can view their own ratings" 
ON safety_ratings FOR SELECT 
USING (rater_id = auth.uid());

CREATE POLICY "Users can insert their own ratings" 
ON safety_ratings FOR INSERT 
WITH CHECK (rater_id = auth.uid());

-- 3. Main function to submit a rating - UPDATES TRUST RATING COLUMNS
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
  v_avg NUMERIC(3,2);
  v_count INTEGER;
  v_letter CHAR(1);
BEGIN
  v_rater_id := auth.uid();
  
  IF v_rater_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Validate rating
  IF p_rating NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid rating. Must be A, B, C, D, or E');
  END IF;
  
  -- Convert letter to numeric value
  v_rating_value := CASE p_rating
    WHEN 'A' THEN 5
    WHEN 'B' THEN 4
    WHEN 'C' THEN 3
    WHEN 'D' THEN 2
    WHEN 'E' THEN 1
    ELSE 3
  END;
  
  -- Check if already rated this user in this match
  SELECT id, rating INTO v_existing_rating
  FROM safety_ratings
  WHERE match_id = p_match_id AND rater_id = v_rater_id AND rated_id = p_rated_id;
  
  IF v_existing_rating IS NOT NULL THEN
    -- Update existing rating
    UPDATE safety_ratings
    SET rating = p_rating, 
        rating_value = v_rating_value, 
        created_at = now()
    WHERE id = v_existing_rating.id;
  ELSE
    -- Insert new rating
    INSERT INTO safety_ratings (match_id, rater_id, rated_id, rating, rating_value)
    VALUES (p_match_id, v_rater_id, p_rated_id, p_rating, v_rating_value);
  END IF;
  
  -- Calculate new average for the rated user
  SELECT AVG(rating_value)::NUMERIC(3,2), COUNT(*)::INTEGER
  INTO v_avg, v_count
  FROM safety_ratings
  WHERE rated_id = p_rated_id;
  
  -- Convert average to letter grade
  IF v_count = 0 THEN
    v_letter := NULL;
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
  
  -- Update the rated user's profile with trust_rating columns
  UPDATE profiles
  SET trust_rating_avg = v_avg,
      trust_rating_count = v_count,
      trust_rating_letter = v_letter,
      updated_at = NOW()
  WHERE user_id = p_rated_id;
  
  -- Also update old columns for backwards compatibility
  BEGIN
    UPDATE profiles
    SET safety_rating_avg = v_avg,
        safety_rating_count = v_count,
        safety_rating_letter = v_letter
    WHERE user_id = p_rated_id;
  EXCEPTION WHEN undefined_column THEN
    NULL; -- Old columns don't exist, that's fine
  END;
  
  RETURN jsonb_build_object(
    'success', true, 
    'rating', p_rating, 
    'value', v_rating_value,
    'new_avg', v_avg,
    'new_count', v_count,
    'new_letter', v_letter
  );
END;
$$;

-- 4. Function to check if user has already rated in a match
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

-- 5. Function to get user's trust rating
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_trust_rating(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INTEGER;
  v_letter CHAR(1);
BEGIN
  -- Get from new columns first
  SELECT trust_rating_avg, trust_rating_count, trust_rating_letter
  INTO v_avg, v_count, v_letter
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- If no data, check old columns
  IF v_letter IS NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_letter') THEN
    SELECT safety_rating_avg, safety_rating_count, safety_rating_letter
    INTO v_avg, v_count, v_letter
    FROM profiles
    WHERE user_id = p_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'avg', COALESCE(v_avg, 0),
    'count', COALESCE(v_count, 0),
    'letter', v_letter
  );
END;
$$;

-- 6. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION submit_safety_rating(UUID, UUID, CHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION has_rated_in_match(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_trust_rating(UUID) TO authenticated;

-- 7. Copy any existing data from old columns to new columns
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_letter')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    
    UPDATE profiles 
    SET trust_rating_letter = safety_rating_letter,
        trust_rating_avg = COALESCE(safety_rating_avg, 0),
        trust_rating_count = COALESCE(safety_rating_count, 0)
    WHERE safety_rating_letter IS NOT NULL 
      AND trust_rating_letter IS NULL;
  END IF;
END $$;

-- 8. Verify setup
-- ============================================================================
SELECT 
  'Trust Rating System Ready' as status,
  (SELECT COUNT(*) FROM safety_ratings) as total_ratings,
  (SELECT COUNT(*) FROM profiles WHERE trust_rating_count > 0) as users_with_trust_ratings;
