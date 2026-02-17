-- ============================================================================
-- TRUST RATING SYSTEM - SIMPLIFIED FIX
-- ============================================================================
-- This migration handles both old (safety_rating_*) and new (trust_rating_*) column names
-- without requiring data migration or column renaming

-- 1. Ensure trust_rating columns exist (add them if they don't)
-- ============================================================================
DO $$
BEGIN
  -- Add trust_rating columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_avg') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_avg NUMERIC(3,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_count') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_count INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    ALTER TABLE profiles ADD COLUMN trust_rating_letter CHAR(1) DEFAULT 'C';
  END IF;
  
  -- Also ensure updated_at exists for triggers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
    ALTER TABLE profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- 2. Copy data from old columns to new columns (only if old columns exist)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'safety_rating_letter')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trust_rating_letter') THEN
    
    -- Use a simple UPDATE that doesn't trigger the updated_at trigger issues
    -- by only updating rows that actually need it
    PERFORM pg_notify('migration', 'Copying safety ratings to trust ratings');
    
    -- Copy data where old column has value and new column is default/null
    UPDATE profiles 
    SET trust_rating_letter = safety_rating_letter,
        trust_rating_avg = COALESCE(safety_rating_avg, 0),
        trust_rating_count = COALESCE(safety_rating_count, 0)
    WHERE safety_rating_letter IS NOT NULL 
      AND (trust_rating_letter = 'C' OR trust_rating_letter IS NULL)
      AND trust_rating_count = 0;
  END IF;
END $$;

-- 3. Create/update the main function that saves ratings
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
  
  -- Update the rated user's average (function handles both column sets)
  PERFORM update_user_trust_rating_v2(p_rated_id);
  
  RETURN jsonb_build_object('success', true, 'rating', p_rating, 'value', v_rating_value);
END;
$$;

-- 4. Create a new simplified function that updates the profile
-- ============================================================================
CREATE OR REPLACE FUNCTION update_user_trust_rating_v2(p_user_id UUID)
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
  SELECT AVG(rating_value)::NUMERIC(3,2), COUNT(*)::INTEGER
  INTO v_avg, v_count
  FROM safety_ratings
  WHERE rated_id = p_user_id;
  
  -- Handle no ratings case
  IF v_count IS NULL OR v_count = 0 THEN
    v_count := 0;
    v_avg := 0;
    v_letter := 'C';
  ELSE
    -- Convert average to letter
    v_letter := CASE
      WHEN v_avg >= 4.5 THEN 'A'
      WHEN v_avg >= 3.5 THEN 'B'
      WHEN v_avg >= 2.5 THEN 'C'
      WHEN v_avg >= 1.5 THEN 'D'
      ELSE 'E'
    END;
  END IF;
  
  -- Update profile with new columns
  UPDATE profiles
  SET trust_rating_avg = v_avg,
      trust_rating_count = v_count,
      trust_rating_letter = v_letter
  WHERE user_id = p_user_id;
  
  -- Also try to update old columns if they exist (for backwards compatibility)
  BEGIN
    UPDATE profiles
    SET safety_rating_avg = v_avg,
        safety_rating_count = v_count,
        safety_rating_letter = v_letter
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- Old columns don't exist, that's fine
    NULL;
  END;
END;
$$;

-- 5. Create function to get trust rating
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_trust_rating_v2(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INTEGER;
  v_letter CHAR(1);
BEGIN
  -- Try new columns first
  SELECT trust_rating_avg, trust_rating_count, trust_rating_letter
  INTO v_avg, v_count, v_letter
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- If null, try old columns
  IF v_letter IS NULL THEN
    SELECT safety_rating_avg, safety_rating_count, safety_rating_letter
    INTO v_avg, v_count, v_letter
    FROM profiles
    WHERE user_id = p_user_id;
  END IF;
  
  IF v_letter IS NULL THEN
    RETURN jsonb_build_object('avg', 0, 'count', 0, 'letter', 'C');
  END IF;
  
  RETURN jsonb_build_object('avg', COALESCE(v_avg, 0), 'count', COALESCE(v_count, 0), 'letter', COALESCE(v_letter, 'C'));
END;
$$;

-- 6. Create simple views
-- ============================================================================

-- Drop old views if exist
DROP VIEW IF EXISTS user_safety_rating_view;
DROP VIEW IF EXISTS user_trust_rating_view;

-- Create view using new columns
CREATE OR REPLACE VIEW user_trust_rating_view AS
SELECT 
  user_id,
  COALESCE(trust_rating_avg, safety_rating_avg, 0) as rating_avg,
  COALESCE(trust_rating_count, safety_rating_count, 0) as rating_count,
  COALESCE(trust_rating_letter, safety_rating_letter, 'C') as rating_letter,
  CASE COALESCE(trust_rating_letter, safety_rating_letter, 'C')
    WHEN 'A' THEN 'bg-emerald-500'
    WHEN 'B' THEN 'bg-emerald-400'
    WHEN 'C' THEN 'bg-yellow-400'
    WHEN 'D' THEN 'bg-orange-400'
    WHEN 'E' THEN 'bg-red-500'
    ELSE 'bg-slate-400'
  END as rating_color_class,
  CASE COALESCE(trust_rating_letter, safety_rating_letter, 'C')
    WHEN 'A' THEN 'text-emerald-500'
    WHEN 'B' THEN 'text-emerald-400'
    WHEN 'C' THEN 'text-yellow-400'
    WHEN 'D' THEN 'text-orange-400'
    WHEN 'E' THEN 'text-red-500'
    ELSE 'text-slate-400'
  END as rating_text_class
FROM profiles;

-- Backwards compatible view
CREATE OR REPLACE VIEW user_safety_rating_view AS
SELECT 
  user_id,
  COALESCE(trust_rating_avg, safety_rating_avg, 0) as safety_rating_avg,
  COALESCE(trust_rating_count, safety_rating_count, 0) as safety_rating_count,
  COALESCE(trust_rating_letter, safety_rating_letter, 'C') as safety_rating_letter,
  CASE COALESCE(trust_rating_letter, safety_rating_letter, 'C')
    WHEN 'A' THEN 'bg-emerald-500'
    WHEN 'B' THEN 'bg-emerald-400'
    WHEN 'C' THEN 'bg-yellow-400'
    WHEN 'D' THEN 'bg-orange-400'
    WHEN 'E' THEN 'bg-red-500'
    ELSE 'bg-slate-400'
  END as safety_rating_color_class,
  CASE COALESCE(trust_rating_letter, safety_rating_letter, 'C')
    WHEN 'A' THEN 'text-emerald-500'
    WHEN 'B' THEN 'text-emerald-400'
    WHEN 'C' THEN 'text-yellow-400'
    WHEN 'D' THEN 'text-orange-400'
    WHEN 'E' THEN 'text-red-500'
    ELSE 'text-slate-400'
  END as safety_rating_text_class
FROM profiles;

-- 7. Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION submit_safety_rating(UUID, UUID, CHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_trust_rating_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_trust_rating_v2(UUID) TO authenticated;
GRANT SELECT ON user_trust_rating_view TO authenticated;
GRANT SELECT ON user_safety_rating_view TO authenticated;

-- 8. Verify
-- ============================================================================
SELECT 'Trust Rating system ready!' as status;
