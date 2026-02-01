/*
  # Create Finish Training System

  1. New Tables
    - `finish_training_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `settings` (jsonb) - stores min, max, current_target, attempt_no
      - `status` (text) - 'active', 'completed'
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)
    
    - `finish_training_darts`
      - `id` (uuid, primary key)
      - `session_id` (uuid, references finish_training_sessions)
      - `target` (int) - the checkout number being attempted
      - `attempt_no` (int) - 1, 2, or 3
      - `dart_no` (int) - 1, 2, or 3
      - `input` (jsonb) - contains mode, hit details or typed_total
      - `result` (jsonb) - contains remaining_before, remaining_after, bust, success
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Users can only access their own data
  
  3. Functions
    - `rpc_finish_training_create_session(p_min int, p_max int)` - creates a new session
    - `rpc_finish_training_get_session(p_session_id uuid)` - retrieves session data
    - `rpc_finish_training_set_state(p_session_id uuid, p_state jsonb)` - updates session state
    - `rpc_finish_training_record_dart(p_session_id uuid, p_attempt_no int, p_dart_no int, p_input jsonb, p_result jsonb)` - records a dart
    - `rpc_finish_training_random_checkout(p_min int, p_max int)` - generates random checkout number
*/

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS rpc_finish_training_create_session(int, int);
DROP FUNCTION IF EXISTS rpc_finish_training_get_session(uuid);
DROP FUNCTION IF EXISTS rpc_finish_training_set_state(uuid, jsonb);
DROP FUNCTION IF EXISTS rpc_finish_training_record_dart(uuid, int, int, jsonb, jsonb);
DROP FUNCTION IF EXISTS rpc_finish_training_random_checkout(int, int);

-- Create finish_training_sessions table
CREATE TABLE IF NOT EXISTS finish_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT finish_training_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create finish_training_darts table
CREATE TABLE IF NOT EXISTS finish_training_darts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  target int NOT NULL,
  attempt_no int NOT NULL,
  dart_no int NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finish_training_darts_session_id_fkey FOREIGN KEY (session_id) REFERENCES finish_training_sessions(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE finish_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finish_training_darts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own finish training sessions" ON finish_training_sessions;
DROP POLICY IF EXISTS "Users can insert own finish training sessions" ON finish_training_sessions;
DROP POLICY IF EXISTS "Users can update own finish training sessions" ON finish_training_sessions;
DROP POLICY IF EXISTS "Users can delete own finish training sessions" ON finish_training_sessions;
DROP POLICY IF EXISTS "Users can view own finish training darts" ON finish_training_darts;
DROP POLICY IF EXISTS "Users can insert own finish training darts" ON finish_training_darts;
DROP POLICY IF EXISTS "Users can update own finish training darts" ON finish_training_darts;
DROP POLICY IF EXISTS "Users can delete own finish training darts" ON finish_training_darts;

-- RLS Policies for finish_training_sessions
CREATE POLICY "Users can view own finish training sessions"
  ON finish_training_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own finish training sessions"
  ON finish_training_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own finish training sessions"
  ON finish_training_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own finish training sessions"
  ON finish_training_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for finish_training_darts
CREATE POLICY "Users can view own finish training darts"
  ON finish_training_darts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finish_training_sessions
      WHERE finish_training_sessions.id = finish_training_darts.session_id
      AND finish_training_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own finish training darts"
  ON finish_training_darts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finish_training_sessions
      WHERE finish_training_sessions.id = finish_training_darts.session_id
      AND finish_training_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own finish training darts"
  ON finish_training_darts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finish_training_sessions
      WHERE finish_training_sessions.id = finish_training_darts.session_id
      AND finish_training_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM finish_training_sessions
      WHERE finish_training_sessions.id = finish_training_darts.session_id
      AND finish_training_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own finish training darts"
  ON finish_training_darts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM finish_training_sessions
      WHERE finish_training_sessions.id = finish_training_darts.session_id
      AND finish_training_sessions.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_finish_training_sessions_user_id ON finish_training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_finish_training_darts_session_id ON finish_training_darts(session_id);

-- RPC: Create session
CREATE FUNCTION rpc_finish_training_create_session(p_min int, p_max int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Validate inputs
  IF p_min < 2 OR p_min > 150 OR p_max > 170 OR p_min >= p_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid min/max values');
  END IF;

  -- Create session
  INSERT INTO finish_training_sessions (user_id, settings, status)
  VALUES (
    auth.uid(),
    jsonb_build_object('min', p_min, 'max', p_max, 'current_target', null, 'attempt_no', 1),
    'active'
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object('ok', true, 'session_id', v_session_id);
END;
$$;

-- RPC: Get session
CREATE FUNCTION rpc_finish_training_get_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session finish_training_sessions;
  v_darts jsonb;
BEGIN
  -- Get session
  SELECT * INTO v_session
  FROM finish_training_sessions
  WHERE id = p_session_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  -- Get all darts for this session
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'target', target,
      'attempt_no', attempt_no,
      'dart_no', dart_no,
      'input', input,
      'result', result,
      'created_at', created_at
    ) ORDER BY created_at ASC
  ) INTO v_darts
  FROM finish_training_darts
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', v_session.id,
      'user_id', v_session.user_id,
      'settings', v_session.settings,
      'status', v_session.status,
      'created_at', v_session.created_at,
      'completed_at', v_session.completed_at
    ),
    'darts', COALESCE(v_darts, '[]'::jsonb)
  );
END;
$$;

-- RPC: Set state
CREATE FUNCTION rpc_finish_training_set_state(p_session_id uuid, p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update session settings
  UPDATE finish_training_sessions
  SET settings = settings || p_state
  WHERE id = p_session_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- RPC: Record dart
CREATE FUNCTION rpc_finish_training_record_dart(
  p_session_id uuid,
  p_attempt_no int,
  p_dart_no int,
  p_input jsonb,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target int;
BEGIN
  -- Get current target from session
  SELECT (settings->>'current_target')::int INTO v_target
  FROM finish_training_sessions
  WHERE id = p_session_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Session not found');
  END IF;

  -- Insert dart
  INSERT INTO finish_training_darts (session_id, target, attempt_no, dart_no, input, result)
  VALUES (p_session_id, v_target, p_attempt_no, p_dart_no, p_input, p_result);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- RPC: Random checkout
CREATE FUNCTION rpc_finish_training_random_checkout(p_min int, p_max int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkout int;
BEGIN
  -- Generate random number in range [p_min, p_max]
  v_checkout := p_min + floor(random() * (p_max - p_min + 1))::int;

  RETURN jsonb_build_object('ok', true, 'checkout', v_checkout);
END;
$$;
