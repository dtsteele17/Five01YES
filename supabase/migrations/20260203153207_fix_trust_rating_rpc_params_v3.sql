/*
  # Fix Trust Rating RPC Parameter Names

  1. Purpose
    - Update rpc_set_trust_rating parameter names to match client expectations
    - Parameter order: p_ratee_user_id, p_rating, p_last_match_room_id

  2. Changes
    - Drop all existing function overloads
    - Create single correct version
*/

-- Drop all existing overloads with exact signatures
DROP FUNCTION IF EXISTS rpc_set_trust_rating(p_rated_user_id uuid, p_rating text);
DROP FUNCTION IF EXISTS rpc_set_trust_rating(p_ratee_user_id uuid, p_rating text, p_last_match_room_id uuid);
DROP FUNCTION IF EXISTS rpc_set_trust_rating(p_room_id uuid, p_opponent_user_id uuid, p_rating text);

-- Recreate with correct parameter names and order
CREATE OR REPLACE FUNCTION rpc_set_trust_rating(
  p_ratee_user_id uuid,
  p_rating text,
  p_last_match_room_id uuid
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
  IF v_rater_id = p_ratee_user_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cannot rate yourself.'
    );
  END IF;

  -- Check if rating already exists for this user pair
  SELECT id INTO v_existing_id
  FROM trust_ratings
  WHERE rater_user_id = v_rater_id
    AND ratee_user_id = p_ratee_user_id;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing rating
    UPDATE trust_ratings
    SET rating = p_rating,
        last_match_room_id = p_last_match_room_id,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    -- Insert new rating
    INSERT INTO trust_ratings (rater_user_id, ratee_user_id, last_match_room_id, rating)
    VALUES (v_rater_id, p_ratee_user_id, p_last_match_room_id, p_rating);
  END IF;

  -- Recalculate opponent's trust rating
  PERFORM rpc_calculate_trust_rating(p_ratee_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Rating saved successfully'
  );
END;
$$;

COMMENT ON FUNCTION rpc_set_trust_rating IS 'Set or update trust rating for opponent after a match. Params: p_ratee_user_id (opponent UUID), p_rating (A-E), p_last_match_room_id (room UUID)';
