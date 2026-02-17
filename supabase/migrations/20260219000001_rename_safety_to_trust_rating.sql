-- ============================================================================
-- RENAME SAFETY RATING TO TRUST RATING
-- ============================================================================
-- This migration renames all safety_rating references to trust_rating
-- and ensures the rating system works correctly

-- 1. Rename columns in profiles table (only if old columns exist and new ones don't)
-- ============================================================================
DO $$
BEGIN
  -- Rename safety_rating_avg to trust_rating_avg (only if trust_rating_avg doesn't already exist)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_avg') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_avg') THEN
    ALTER TABLE profiles RENAME COLUMN safety_rating_avg TO trust_rating_avg;
  END IF;
  
  -- Rename safety_rating_count to trust_rating_count (only if trust_rating_count doesn't already exist)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_count') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_count') THEN
    ALTER TABLE profiles RENAME COLUMN safety_rating_count TO trust_rating_count;
  END IF;
  
  -- Rename safety_rating_letter to trust_rating_letter (only if trust_rating_letter doesn't already exist)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_letter') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    ALTER TABLE profiles RENAME COLUMN safety_rating_letter TO trust_rating_letter;
  END IF;
END $$;

-- 2. Ensure columns exist (in case they were never created with old names)
-- ============================================================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS trust_rating_avg NUMERIC(3,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS trust_rating_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trust_rating_letter CHAR(1) DEFAULT 'C';

-- Also ensure updated_at column exists (required by trigger)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Update the submit_safety_rating function to also update trust columns
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
  
  -- Update the rated user's average (updates both old and new column names)
  PERFORM update_user_safety_rating(p_rated_id);
  
  RETURN jsonb_build_object('success', true, 'rating', p_rating, 'value', v_rating_value);
END;
$$;

-- 4. Update the update_user_safety_rating function to use trust columns (with fallback)
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
  
  -- Update profile with whichever columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    UPDATE profiles
    SET trust_rating_avg = v_avg,
        trust_rating_count = v_count,
        trust_rating_letter = v_letter
    WHERE user_id = p_user_id;
  ELSE
    UPDATE profiles
    SET safety_rating_avg = v_avg,
        safety_rating_count = v_count,
        safety_rating_letter = v_letter
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- 5. Update the get_user_safety_rating function to use trust columns (with fallback)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_safety_rating(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Check if trust_rating columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    SELECT trust_rating_avg, trust_rating_count, trust_rating_letter
    INTO v_result
    FROM profiles
    WHERE user_id = p_user_id;
  ELSE
    -- Fall back to old column names
    SELECT safety_rating_avg, safety_rating_count, safety_rating_letter
    INTO v_result
    FROM profiles
    WHERE user_id = p_user_id;
  END IF;
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'avg', 0,
      'count', 0,
      'letter', 'C'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'avg', COALESCE(v_result.trust_rating_avg, v_result.safety_rating_avg, 0),
    'count', COALESCE(v_result.trust_rating_count, v_result.safety_rating_count, 0),
    'letter', COALESCE(v_result.trust_rating_letter, v_result.safety_rating_letter, 'C')
  );
END;
$$;

-- 6. Create alias functions with trust_rating names for future use
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_trust_rating(
  p_match_id UUID,
  p_rated_id UUID,
  p_rating CHAR(1)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Just call the original function
  RETURN submit_safety_rating(p_match_id, p_rated_id, p_rating);
END;
$$;

CREATE OR REPLACE FUNCTION get_user_trust_rating(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Check if trust_rating columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    SELECT trust_rating_avg, trust_rating_count, trust_rating_letter
    INTO v_result
    FROM profiles
    WHERE user_id = p_user_id;
  ELSE
    -- Fall back to old column names
    SELECT safety_rating_avg, safety_rating_count, safety_rating_letter
    INTO v_result
    FROM profiles
    WHERE user_id = p_user_id;
  END IF;
  
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'avg', 0,
      'count', 0,
      'letter', 'C'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'avg', COALESCE(v_result.trust_rating_avg, v_result.safety_rating_avg, 0),
    'count', COALESCE(v_result.trust_rating_count, v_result.safety_rating_count, 0),
    'letter', COALESCE(v_result.trust_rating_letter, v_result.safety_rating_letter, 'C')
  );
END;
$$;

CREATE OR REPLACE FUNCTION update_user_trust_rating(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Just call the original function
  PERFORM update_user_safety_rating(p_user_id);
END;
$$;

-- 7. Update the view to use trust_rating column names (with fallback)
-- ============================================================================
DROP VIEW IF EXISTS user_safety_rating_view;

-- Create view dynamically based on which columns exist
DO $$
BEGIN
  -- Check if trust_rating columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    EXECUTE 'CREATE OR REPLACE VIEW user_trust_rating_view AS
      SELECT 
        user_id,
        trust_rating_avg as rating_avg,
        trust_rating_count as rating_count,
        trust_rating_letter as rating_letter,
        CASE trust_rating_letter
          WHEN ''A'' THEN ''bg-emerald-500''
          WHEN ''B'' THEN ''bg-emerald-400''
          WHEN ''C'' THEN ''bg-yellow-400''
          WHEN ''D'' THEN ''bg-orange-400''
          WHEN ''E'' THEN ''bg-red-500''
          ELSE ''bg-slate-400''
        END as rating_color_class,
        CASE trust_rating_letter
          WHEN ''A'' THEN ''text-emerald-500''
          WHEN ''B'' THEN ''text-emerald-400''
          WHEN ''C'' THEN ''text-yellow-400''
          WHEN ''D'' THEN ''text-orange-400''
          WHEN ''E'' THEN ''text-red-500''
          ELSE ''text-slate-400''
        END as rating_text_class
      FROM profiles';
  ELSE
    -- Use old column names
    EXECUTE 'CREATE OR REPLACE VIEW user_trust_rating_view AS
      SELECT 
        user_id,
        safety_rating_avg as rating_avg,
        safety_rating_count as rating_count,
        safety_rating_letter as rating_letter,
        CASE safety_rating_letter
          WHEN ''A'' THEN ''bg-emerald-500''
          WHEN ''B'' THEN ''bg-emerald-400''
          WHEN ''C'' THEN ''bg-yellow-400''
          WHEN ''D'' THEN ''bg-orange-400''
          WHEN ''E'' THEN ''bg-red-500''
          ELSE ''bg-slate-400''
        END as rating_color_class,
        CASE safety_rating_letter
          WHEN ''A'' THEN ''text-emerald-500''
          WHEN ''B'' THEN ''text-emerald-400''
          WHEN ''C'' THEN ''text-yellow-400''
          WHEN ''D'' THEN ''text-orange-400''
          WHEN ''E'' THEN ''text-red-500''
          ELSE ''text-slate-400''
        END as rating_text_class
      FROM profiles';
  END IF;
END $$;

GRANT SELECT ON user_trust_rating_view TO authenticated;

-- 8. Create backwards-compatible view with old name (handles both column names)
-- ============================================================================
DO $$
BEGIN
  -- Check if trust_rating columns exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    -- Use new column names
    EXECUTE 'CREATE OR REPLACE VIEW user_safety_rating_view AS
      SELECT 
        user_id,
        trust_rating_avg as safety_rating_avg,
        trust_rating_count as safety_rating_count,
        trust_rating_letter as safety_rating_letter,
        CASE trust_rating_letter
          WHEN ''A'' THEN ''bg-emerald-500''
          WHEN ''B'' THEN ''bg-emerald-400''
          WHEN ''C'' THEN ''bg-yellow-400''
          WHEN ''D'' THEN ''bg-orange-400''
          WHEN ''E'' THEN ''bg-red-500''
          ELSE ''bg-slate-400''
        END as safety_rating_color_class,
        CASE trust_rating_letter
          WHEN ''A'' THEN ''text-emerald-500''
          WHEN ''B'' THEN ''text-emerald-400''
          WHEN ''C'' THEN ''text-yellow-400''
          WHEN ''D'' THEN ''text-orange-400''
          WHEN ''E'' THEN ''text-red-500''
          ELSE ''text-slate-400''
        END as safety_rating_text_class
      FROM profiles';
  ELSE
    -- Use old column names
    EXECUTE 'CREATE OR REPLACE VIEW user_safety_rating_view AS
      SELECT 
        user_id,
        safety_rating_avg,
        safety_rating_count,
        safety_rating_letter,
        CASE safety_rating_letter
          WHEN ''A'' THEN ''bg-emerald-500''
          WHEN ''B'' THEN ''bg-emerald-400''
          WHEN ''C'' THEN ''bg-yellow-400''
          WHEN ''D'' THEN ''bg-orange-400''
          WHEN ''E'' THEN ''bg-red-500''
          ELSE ''bg-slate-400''
        END as safety_rating_color_class,
        CASE safety_rating_letter
          WHEN ''A'' THEN ''text-emerald-500''
          WHEN ''B'' THEN ''text-emerald-400''
          WHEN ''C'' THEN ''text-yellow-400''
          WHEN ''D'' THEN ''text-orange-400''
          WHEN ''E'' THEN ''text-red-500''
          ELSE ''text-slate-400''
        END as safety_rating_text_class
      FROM profiles';
  END IF;
END $$;

GRANT SELECT ON user_safety_rating_view TO authenticated;

-- 9. Update all existing profiles to copy data from old columns if they exist
-- ============================================================================
DO $$
BEGIN
  -- Only run if both old and new columns exist and we need to migrate data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'safety_rating_letter'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter'
  ) THEN
    -- Temporarily disable the updated_at trigger to avoid issues
    ALTER TABLE profiles DISABLE TRIGGER ALL;
    
    UPDATE profiles 
    SET trust_rating_letter = COALESCE(safety_rating_letter, trust_rating_letter),
        trust_rating_avg = COALESCE(safety_rating_avg, trust_rating_avg),
        trust_rating_count = COALESCE(safety_rating_count, trust_rating_count),
        updated_at = NOW()
    WHERE safety_rating_letter IS NOT NULL 
    AND (trust_rating_letter IS NULL OR trust_rating_letter = 'C');
    
    -- Re-enable triggers
    ALTER TABLE profiles ENABLE TRIGGER ALL;
  END IF;
END $$;

-- 10. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION submit_safety_rating(UUID, UUID, CHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_trust_rating(UUID, UUID, CHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_safety_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_trust_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_safety_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_trust_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_rated_in_match(UUID, UUID) TO authenticated;

-- 11. Verify the setup (works with either column name)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_count') THEN
    RAISE NOTICE 'Trust Rating system updated! Profiles with ratings: %', 
      (SELECT COUNT(*) FROM profiles WHERE trust_rating_count > 0);
  ELSE
    RAISE NOTICE 'Trust Rating system updated! Profiles with ratings: %', 
      (SELECT COUNT(*) FROM profiles WHERE safety_rating_count > 0);
  END IF;
END $$;

SELECT 
  'Trust Rating system updated!' as status,
  (SELECT COUNT(*) FROM safety_ratings) as total_ratings;
