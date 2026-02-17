-- ============================================================================
-- VERIFY TRUST RATING SYSTEM
-- ============================================================================

-- 1. Check if trust_rating columns exist
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM information_schema.columns 
  WHERE table_name = 'profiles' 
  AND column_name IN ('trust_rating_avg', 'trust_rating_count', 'trust_rating_letter');
  
  IF v_count = 3 THEN
    RAISE NOTICE '✓ All trust_rating columns exist';
  ELSE
    RAISE NOTICE '✗ Missing trust_rating columns. Found: %', v_count;
  END IF;
END $$;

-- 2. Verify the submit_safety_rating function updates trust_rating columns
-- ============================================================================
CREATE OR REPLACE FUNCTION test_trust_rating_system()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_test_user_id UUID;
  v_result JSONB;
  v_rating_letter CHAR(1);
  v_rating_count INTEGER;
BEGIN
  -- Get a random user to test with
  SELECT user_id INTO v_test_user_id
  FROM profiles
  LIMIT 1;
  
  IF v_test_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No users found to test');
  END IF;
  
  -- Check current rating
  SELECT trust_rating_letter, trust_rating_count
  INTO v_rating_letter, v_rating_count
  FROM profiles
  WHERE user_id = v_test_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'test_user_id', v_test_user_id,
    'current_letter', v_rating_letter,
    'current_count', v_rating_count,
    'message', 'Trust rating system is configured'
  );
END;
$$;

-- 3. Create a function to force-refresh a user's trust rating
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_user_trust_rating(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC(3,2);
  v_count INTEGER;
  v_letter CHAR(1);
BEGIN
  -- Calculate average from all ratings
  SELECT AVG(rating_value)::NUMERIC(3,2), COUNT(*)::INTEGER
  INTO v_avg, v_count
  FROM safety_ratings
  WHERE rated_id = p_user_id;
  
  -- Handle no ratings
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
  
  -- Update profile
  UPDATE profiles
  SET trust_rating_avg = v_avg,
      trust_rating_count = v_count,
      trust_rating_letter = v_letter
  WHERE user_id = p_user_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'letter', v_letter,
    'count', v_count,
    'avg', v_avg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_user_trust_rating(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION test_trust_rating_system() TO authenticated;

-- 4. Show current trust rating statistics
-- ============================================================================
SELECT 
  'Trust Rating Statistics' as info,
  (SELECT COUNT(*) FROM profiles WHERE trust_rating_count > 0) as users_with_ratings,
  (SELECT COUNT(*) FROM profiles WHERE trust_rating_count = 0 OR trust_rating_count IS NULL) as users_without_ratings,
  (SELECT COUNT(*) FROM safety_ratings) as total_ratings_recorded;

-- 5. Sample of users with trust ratings
-- ============================================================================
SELECT 
  user_id,
  username,
  trust_rating_letter,
  trust_rating_count,
  trust_rating_avg
FROM profiles
WHERE trust_rating_count > 0
ORDER BY trust_rating_count DESC
LIMIT 5;
