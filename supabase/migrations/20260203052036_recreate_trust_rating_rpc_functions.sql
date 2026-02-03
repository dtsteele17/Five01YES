/*
  # Recreate Trust Rating RPC Functions

  1. Purpose
    - Drop and recreate trust rating RPC functions
    - Ensure correct return types and logic

  2. RPC Functions
    - `rpc_set_trust_rating` - set or update a trust rating
    - `rpc_calculate_trust_rating` - recalculate user's aggregate rating

  3. Rating Scale
    - A = Very trustworthy (5 points)
    - B = Trustworthy (4 points)
    - C = Neutral (3 points)
    - D = Questionable (2 points)
    - E = Not trustworthy (1 point)
*/

-- Drop existing functions
DROP FUNCTION IF EXISTS rpc_set_trust_rating(uuid, uuid, text);
DROP FUNCTION IF EXISTS rpc_calculate_trust_rating(uuid);

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'trust_ratings_rater_ratee_unique'
  ) THEN
    ALTER TABLE trust_ratings 
      ADD CONSTRAINT trust_ratings_rater_ratee_unique 
      UNIQUE(rater_user_id, ratee_user_id);
  END IF;
END $$;

-- Function to calculate trust rating for a user
CREATE OR REPLACE FUNCTION rpc_calculate_trust_rating(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_avg_score numeric;
  v_letter text;
BEGIN
  -- Count total ratings received
  SELECT COUNT(*)
  INTO v_count
  FROM trust_ratings
  WHERE ratee_user_id = p_user_id;

  IF v_count = 0 THEN
    -- No ratings yet - set to defaults
    UPDATE profiles
    SET trust_rating_letter = 'C',
        trust_rating_avg = 3,
        trust_rating_count = 0
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'letter', 'C',
      'count', 0,
      'avg', 3
    );
  END IF;

  -- Calculate average score (A=5, B=4, C=3, D=2, E=1)
  SELECT AVG(
    CASE rating
      WHEN 'A' THEN 5
      WHEN 'B' THEN 4
      WHEN 'C' THEN 3
      WHEN 'D' THEN 2
      WHEN 'E' THEN 1
    END
  )
  INTO v_avg_score
  FROM trust_ratings
  WHERE ratee_user_id = p_user_id;

  -- Convert average back to letter
  IF v_avg_score >= 4.5 THEN
    v_letter := 'A';
  ELSIF v_avg_score >= 3.5 THEN
    v_letter := 'B';
  ELSIF v_avg_score >= 2.5 THEN
    v_letter := 'C';
  ELSIF v_avg_score >= 1.5 THEN
    v_letter := 'D';
  ELSE
    v_letter := 'E';
  END IF;

  -- Update profile
  UPDATE profiles
  SET trust_rating_letter = v_letter,
      trust_rating_avg = v_avg_score,
      trust_rating_count = v_count
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'letter', v_letter,
    'count', v_count,
    'avg', v_avg_score
  );
END;
$$;

-- Function to set or update a trust rating
CREATE OR REPLACE FUNCTION rpc_set_trust_rating(
  p_room_id uuid,
  p_opponent_user_id uuid,
  p_rating text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rater_id uuid;
  v_existing_id uuid;
BEGIN
  -- Get caller's user ID
  v_rater_id := auth.uid();

  -- Validate rating
  IF p_rating NOT IN ('A', 'B', 'C', 'D', 'E') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Invalid rating. Must be A, B, C, D, or E.'
    );
  END IF;

  -- Prevent self-rating
  IF v_rater_id = p_opponent_user_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot rate yourself.'
    );
  END IF;

  -- Check if rating already exists for this user pair
  SELECT id INTO v_existing_id
  FROM trust_ratings
  WHERE rater_user_id = v_rater_id
    AND ratee_user_id = p_opponent_user_id;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing rating
    UPDATE trust_ratings
    SET rating = p_rating,
        last_match_room_id = p_room_id,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    -- Insert new rating
    INSERT INTO trust_ratings (rater_user_id, ratee_user_id, last_match_room_id, rating)
    VALUES (v_rater_id, p_opponent_user_id, p_room_id, p_rating);
  END IF;

  -- Recalculate opponent's trust rating
  PERFORM rpc_calculate_trust_rating(p_opponent_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Rating saved successfully'
  );
END;
$$;

COMMENT ON FUNCTION rpc_set_trust_rating IS 'Set or update trust rating for opponent after a match';
COMMENT ON FUNCTION rpc_calculate_trust_rating IS 'Recalculate aggregate trust rating for a user';