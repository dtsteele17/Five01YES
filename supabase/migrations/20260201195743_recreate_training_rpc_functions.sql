/*
  # Recreate Training RPC Functions

  1. Drop Existing Functions
    - Drop old versions of training RPC functions
  
  2. Create New RPC Functions
    - `rpc_create_training_session(payload)` - Creates a new training session
    - `rpc_record_training_throw(session_id, payload)` - Records a single throw
  
  3. Security
    - Functions require authentication
    - Automatically set user_id to auth.uid()
    - Validate ownership before allowing operations
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS rpc_create_training_session(jsonb);
DROP FUNCTION IF EXISTS rpc_record_training_throw(uuid, jsonb);

-- Function: Create a training session
CREATE OR REPLACE FUNCTION rpc_create_training_session(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
  v_user_id uuid;
  v_game text;
  v_settings jsonb;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Extract fields from payload
  v_game := payload->>'game';
  v_settings := payload->'settings';

  -- Validate game type
  IF v_game IS NULL OR v_game = '' THEN
    RAISE EXCEPTION 'game is required';
  END IF;

  -- Insert new session
  INSERT INTO training_sessions (user_id, game, settings, status, started_at)
  VALUES (v_user_id, v_game, v_settings, 'active', now())
  RETURNING id INTO v_session_id;

  -- Return session info
  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'user_id', v_user_id,
    'game', v_game,
    'settings', v_settings
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', SQLERRM
    );
END;
$$;

-- Function: Record a training throw
CREATE OR REPLACE FUNCTION rpc_record_training_throw(
  p_session_id uuid,
  payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_throw_id uuid;
  v_user_id uuid;
  v_session_user_id uuid;
  v_dart_number int;
  v_input jsonb;
  v_result jsonb;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify session exists and belongs to user
  SELECT user_id INTO v_session_user_id
  FROM training_sessions
  WHERE id = p_session_id;

  IF v_session_user_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session_user_id != v_user_id THEN
    RAISE EXCEPTION 'Not authorized for this session';
  END IF;

  -- Extract fields from payload
  v_dart_number := (payload->>'dart_number')::int;
  v_input := payload->'input';
  v_result := payload->'result';

  -- Validate dart_number
  IF v_dart_number IS NULL OR v_dart_number < 1 OR v_dart_number > 3 THEN
    RAISE EXCEPTION 'dart_number must be 1, 2, or 3';
  END IF;

  -- Insert throw
  INSERT INTO training_throws (session_id, user_id, dart_number, input, result, created_at)
  VALUES (p_session_id, v_user_id, v_dart_number, v_input, v_result, now())
  RETURNING id INTO v_throw_id;

  -- Return throw info
  RETURN jsonb_build_object(
    'ok', true,
    'throw_id', v_throw_id,
    'session_id', p_session_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', SQLERRM
    );
END;
$$;