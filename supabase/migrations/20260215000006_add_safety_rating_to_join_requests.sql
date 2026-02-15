-- ============================================================================
-- ADD SAFETY RATING FIELDS TO JOIN REQUESTS
-- ============================================================================
-- Adds safety rating fields to quick_match_join_requests table
-- so lobby creators can see the safety rating of requesters
-- ============================================================================

-- Add safety rating columns to join requests table
ALTER TABLE public.quick_match_join_requests
ADD COLUMN IF NOT EXISTS requester_safety_rating_letter CHAR(1),
ADD COLUMN IF NOT EXISTS requester_safety_rating_count INTEGER DEFAULT 0;

-- Update the rpc_submit_join_request function to include safety rating
CREATE OR REPLACE FUNCTION rpc_submit_join_request(
  p_lobby_id UUID,
  p_requester_username TEXT,
  p_requester_avatar_url TEXT,
  p_requester_3dart_avg DECIMAL DEFAULT 0,
  p_requester_has_camera BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requester_id UUID;
  v_lobby_exists BOOLEAN;
  v_lobby_full BOOLEAN;
  v_safety_rating_letter CHAR(1);
  v_safety_rating_count INTEGER;
  v_request_id UUID;
BEGIN
  v_requester_id := auth.uid();
  
  IF v_requester_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Check if lobby exists and is open
  SELECT EXISTS(
    SELECT 1 FROM quick_match_lobbies 
    WHERE id = p_lobby_id AND status = 'open'
  ) INTO v_lobby_exists;
  
  IF NOT v_lobby_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lobby not found or not open');
  END IF;
  
  -- Check if lobby is already full
  SELECT EXISTS(
    SELECT 1 FROM quick_match_lobbies 
    WHERE id = p_lobby_id AND player2_id IS NOT NULL
  ) INTO v_lobby_full;
  
  IF v_lobby_full THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lobby is already full');
  END IF;
  
  -- Get requester's safety rating
  SELECT safety_rating_letter, safety_rating_count
  INTO v_safety_rating_letter, v_safety_rating_count
  FROM profiles
  WHERE user_id = v_requester_id;
  
  -- Check if request already exists
  SELECT id INTO v_request_id
  FROM quick_match_join_requests
  WHERE lobby_id = p_lobby_id 
    AND requester_id = v_requester_id 
    AND status = 'pending';
  
  IF v_request_id IS NOT NULL THEN
    -- Update existing request
    UPDATE quick_match_join_requests
    SET requester_username = p_requester_username,
        requester_avatar_url = p_requester_avatar_url,
        requester_3dart_avg = p_requester_3dart_avg,
        requester_has_camera = p_requester_has_camera,
        requester_safety_rating_letter = v_safety_rating_letter,
        requester_safety_rating_count = v_safety_rating_count,
        updated_at = now()
    WHERE id = v_request_id;
    
    RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'action', 'updated');
  END IF;
  
  -- Create new join request with safety rating
  INSERT INTO quick_match_join_requests (
    lobby_id,
    requester_id,
    requester_username,
    requester_avatar_url,
    requester_3dart_avg,
    requester_has_camera,
    requester_safety_rating_letter,
    requester_safety_rating_count,
    status
  )
  VALUES (
    p_lobby_id,
    v_requester_id,
    p_requester_username,
    p_requester_avatar_url,
    p_requester_3dart_avg,
    p_requester_has_camera,
    v_safety_rating_letter,
    v_safety_rating_count,
    'pending'
  )
  RETURNING id INTO v_request_id;
  
  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'action', 'created');
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_submit_join_request(UUID, TEXT, TEXT, DECIMAL, BOOLEAN) TO authenticated;

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Safety rating fields added to join requests!' as status;
