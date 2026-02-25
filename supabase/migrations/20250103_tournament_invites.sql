-- Tournament Invite System
-- Run this after the tournament functions are applied

-- Create tournament invites table
CREATE TABLE IF NOT EXISTS tournament_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tournament_invites_tournament_id ON tournament_invites(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_invitee_id ON tournament_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_status ON tournament_invites(status);

-- Add unique constraint to prevent duplicate invites
ALTER TABLE tournament_invites 
ADD CONSTRAINT unique_tournament_invite 
UNIQUE (tournament_id, invitee_id);

-- Enable RLS
ALTER TABLE tournament_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own invites" 
ON tournament_invites FOR SELECT 
USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

CREATE POLICY "Tournament creators can invite players" 
ON tournament_invites FOR INSERT 
WITH CHECK (
  inviter_id = auth.uid() AND 
  EXISTS(SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
);

CREATE POLICY "Invitees can update their invite responses" 
ON tournament_invites FOR UPDATE 
USING (invitee_id = auth.uid())
WITH CHECK (invitee_id = auth.uid());

-- RPC Function: Send tournament invite
CREATE OR REPLACE FUNCTION send_tournament_invite(
  p_tournament_id UUID,
  p_invitee_username TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_inviter_id UUID;
  v_invitee_id UUID;
  v_invite_id UUID;
  v_result JSON;
BEGIN
  -- Get current user
  v_inviter_id := auth.uid();
  
  IF v_inviter_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get tournament details and verify creator
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id AND created_by = v_inviter_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found or not authorized');
  END IF;
  
  -- Check tournament status
  IF v_tournament.status != 'registration' THEN
    RETURN json_build_object('success', false, 'error', 'Tournament registration is closed');
  END IF;
  
  -- Find invitee by username
  SELECT id INTO v_invitee_id
  FROM profiles
  WHERE username = p_invitee_username;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if user is already registered
  IF EXISTS(SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = v_invitee_id) THEN
    RETURN json_build_object('success', false, 'error', 'User is already registered for this tournament');
  END IF;
  
  -- Check if invite already exists
  IF EXISTS(SELECT 1 FROM tournament_invites WHERE tournament_id = p_tournament_id AND invitee_id = v_invitee_id AND status = 'pending') THEN
    RETURN json_build_object('success', false, 'error', 'Invite already sent to this user');
  END IF;
  
  -- Create the invite
  INSERT INTO tournament_invites (
    tournament_id,
    inviter_id,
    invitee_id,
    status
  ) VALUES (
    p_tournament_id,
    v_inviter_id,
    v_invitee_id,
    'pending'
  ) RETURNING id INTO v_invite_id;
  
  -- Create notification
  INSERT INTO notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_invitee_id,
    'tournament_invite',
    'Tournament Invitation',
    'You have been invited to join "' || v_tournament.name || '"',
    json_build_object(
      'tournament_id', p_tournament_id,
      'tournament_name', v_tournament.name,
      'invite_id', v_invite_id,
      'inviter_username', (SELECT username FROM profiles WHERE id = v_inviter_id),
      'action_url', '/app/tournaments/' || p_tournament_id
    ),
    NOW()
  );
  
  v_result := json_build_object(
    'success', true,
    'invite_id', v_invite_id,
    'message', 'Invitation sent successfully'
  );
  
  RETURN v_result;
END;
$function$;

-- RPC Function: Respond to tournament invite
CREATE OR REPLACE FUNCTION respond_to_tournament_invite(
  p_invite_id UUID,
  p_response TEXT -- 'accepted' or 'declined'
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_invite RECORD;
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  -- Validate response
  IF p_response NOT IN ('accepted', 'declined') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid response');
  END IF;
  
  -- Get invite details
  SELECT ti.*, t.name as tournament_name, t.max_participants, t.status as tournament_status
  INTO v_invite
  FROM tournament_invites ti
  JOIN tournaments t ON t.id = ti.tournament_id
  WHERE ti.id = p_invite_id 
    AND ti.invitee_id = auth.uid()
    AND ti.status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found or already responded');
  END IF;
  
  -- Check if tournament is still accepting registrations
  IF v_invite.tournament_status != 'registration' THEN
    -- Update invite as expired
    UPDATE tournament_invites 
    SET status = 'expired', responded_at = NOW()
    WHERE id = p_invite_id;
    
    RETURN json_build_object('success', false, 'error', 'Tournament registration has ended');
  END IF;
  
  -- Update invite status
  UPDATE tournament_invites 
  SET status = p_response, responded_at = NOW()
  WHERE id = p_invite_id;
  
  IF p_response = 'accepted' THEN
    -- Check if tournament is full
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_invite.tournament_id;
    
    IF v_participant_count >= v_invite.max_participants THEN
      RETURN json_build_object('success', false, 'error', 'Tournament is now full');
    END IF;
    
    -- Check if user is already registered (race condition protection)
    IF EXISTS(SELECT 1 FROM tournament_participants WHERE tournament_id = v_invite.tournament_id AND user_id = auth.uid()) THEN
      RETURN json_build_object('success', false, 'error', 'Already registered for this tournament');
    END IF;
    
    -- Add participant
    INSERT INTO tournament_participants (
      tournament_id,
      user_id,
      role,
      status_type,
      joined_at
    ) VALUES (
      v_invite.tournament_id,
      auth.uid(),
      'participant',
      'confirmed',
      NOW()
    );
    
    v_result := json_build_object(
      'success', true,
      'message', 'Successfully joined tournament: ' || v_invite.tournament_name
    );
  ELSE
    v_result := json_build_object(
      'success', true,
      'message', 'Tournament invitation declined'
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- RPC Function: Get user's friends for tournament invites
CREATE OR REPLACE FUNCTION get_friends_for_tournament_invite(
  p_tournament_id UUID
)
RETURNS TABLE(
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  already_invited BOOLEAN,
  already_registered BOOLEAN
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.username,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM tournament_invites ti 
      WHERE ti.tournament_id = p_tournament_id 
        AND ti.invitee_id = p.id 
        AND ti.status = 'pending'
    ) as already_invited,
    EXISTS(
      SELECT 1 FROM tournament_participants tp 
      WHERE tp.tournament_id = p_tournament_id 
        AND tp.user_id = p.id
    ) as already_registered
  FROM profiles p
  WHERE EXISTS(
    SELECT 1 FROM friendships f 
    WHERE (f.requester_id = auth.uid() AND f.addressee_id = p.id)
       OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
    AND f.status = 'accepted'
  )
  AND p.id != auth.uid()
  ORDER BY p.username;
END;
$function$;

-- Enable realtime for tournament invites
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_invites;