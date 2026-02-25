-- =======================================================
-- TOURNAMENT SYSTEM COMPLETE SQL SETUP - FINAL VERSION
-- Run these commands in Supabase SQL Editor IN ORDER
-- Handles existing tables, constraints, and functions properly
-- =======================================================

-- =======================================================
-- STEP 1: Add Tournament Winner Columns
-- =======================================================

-- Add winner_id column to tournaments table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tournaments' 
    AND column_name = 'winner_id'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN winner_id UUID REFERENCES profiles(id);
  END IF;
END $$;

-- Add completed_at column to tournaments table  
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tournaments' 
    AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE tournaments ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- =======================================================
-- STEP 2: Core Tournament Functions
-- =======================================================

-- Drop existing functions to avoid return type conflicts
DROP FUNCTION IF EXISTS progress_tournament_bracket(UUID, UUID);
DROP FUNCTION IF EXISTS create_tournament_match_room(UUID, UUID, UUID, UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS join_tournament(UUID, UUID);

-- Progress tournament bracket when a match is completed
CREATE OR REPLACE FUNCTION progress_tournament_bracket(
  p_tournament_match_id UUID,
  p_winner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament_id UUID;
  v_current_match RECORD;
  v_next_match RECORD;
  v_next_round INTEGER;
  v_next_match_index INTEGER;
  v_max_round INTEGER;
  v_tournament_complete BOOLEAN := false;
  v_result JSON;
BEGIN
  -- Get the completed match details
  SELECT tm.*, t.max_participants 
  INTO v_current_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_tournament_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament match not found');
  END IF;

  v_tournament_id := v_current_match.tournament_id;
  
  -- Calculate next round and match index
  v_next_round := v_current_match.round + 1;
  v_next_match_index := v_current_match.match_index / 2;
  
  -- Get the maximum round for this tournament
  SELECT MAX(round) INTO v_max_round 
  FROM tournament_matches 
  WHERE tournament_id = v_tournament_id;
  
  -- Check if this was the final match
  IF v_current_match.round = v_max_round THEN
    -- Tournament is complete! Update tournament status
    UPDATE tournaments 
    SET status = 'completed',
        winner_id = p_winner_id,
        completed_at = NOW()
    WHERE id = v_tournament_id;
    
    v_tournament_complete := true;
    
    v_result := json_build_object(
      'success', true,
      'tournament_complete', true,
      'winner_id', p_winner_id,
      'message', 'Tournament completed!'
    );
  ELSE
    -- Find the next round match where this winner should advance
    SELECT * INTO v_next_match
    FROM tournament_matches
    WHERE tournament_id = v_tournament_id
      AND round = v_next_round
      AND match_index = v_next_match_index;
    
    IF FOUND THEN
      -- Determine if winner goes to player1 or player2 slot
      IF v_current_match.match_index % 2 = 0 THEN
        UPDATE tournament_matches 
        SET player1_id = p_winner_id,
            updated_at = NOW()
        WHERE id = v_next_match.id;
      ELSE
        UPDATE tournament_matches 
        SET player2_id = p_winner_id,
            updated_at = NOW()
        WHERE id = v_next_match.id;
      END IF;
      
      -- Check if the next match now has both players
      SELECT * INTO v_next_match
      FROM tournament_matches
      WHERE id = v_next_match.id;
      
      IF v_next_match.player1_id IS NOT NULL AND v_next_match.player2_id IS NOT NULL THEN
        -- Both players are set, mark match as ready
        UPDATE tournament_matches
        SET status = 'ready',
            updated_at = NOW()
        WHERE id = v_next_match.id;
      END IF;
      
      v_result := json_build_object(
        'success', true,
        'tournament_complete', false,
        'advanced_to_match', v_next_match.id,
        'next_round', v_next_round,
        'message', 'Player advanced to next round'
      );
    ELSE
      v_result := json_build_object(
        'success', false,
        'error', 'Next round match not found'
      );
    END IF;
  END IF;
  
  RETURN v_result;
END;
$function$;

-- Create tournament match room for tournament matches
CREATE OR REPLACE FUNCTION create_tournament_match_room(
  p_tournament_match_id UUID,
  p_player1_id UUID,
  p_player2_id UUID,
  p_tournament_id UUID,
  p_game_mode INTEGER DEFAULT 501,
  p_legs_per_match INTEGER DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_room_id UUID;
  v_legs_to_win INTEGER;
  v_result JSON;
BEGIN
  -- Calculate legs to win based on best-of format
  v_legs_to_win := (p_legs_per_match / 2) + 1;
  
  -- Create the match room
  INSERT INTO match_rooms (
    id,
    player1_id,
    player2_id,
    game_mode,
    match_format,
    match_type,
    legs_to_win,
    status,
    double_out,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_player1_id,
    p_player2_id,
    p_game_mode,
    'best_of_' || p_legs_per_match::text,
    'tournament',
    v_legs_to_win,
    'active',
    true,
    NOW(),
    NOW()
  ) RETURNING id INTO v_room_id;
  
  -- Return the room ID
  v_result := json_build_object(
    'success', true,
    'room_id', v_room_id,
    'legs_to_win', v_legs_to_win
  );
  
  RETURN v_result;
END;
$function$;

-- Join tournament function
CREATE OR REPLACE FUNCTION join_tournament(
  p_tournament_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Check if tournament is open for registration
  IF v_tournament.status != 'registration' THEN
    RETURN json_build_object('success', false, 'error', 'Tournament registration is closed');
  END IF;
  
  -- Check if user is already registered
  IF EXISTS(SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Already registered for this tournament');
  END IF;
  
  -- Count current participants
  SELECT COUNT(*) INTO v_participant_count
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  -- Check if tournament is full
  IF v_participant_count >= v_tournament.max_participants THEN
    RETURN json_build_object('success', false, 'error', 'Tournament is full');
  END IF;
  
  -- Add participant
  INSERT INTO tournament_participants (
    tournament_id,
    user_id,
    role,
    status_type,
    joined_at
  ) VALUES (
    p_tournament_id,
    p_user_id,
    'participant',
    'confirmed',
    NOW()
  );
  
  v_result := json_build_object(
    'success', true,
    'message', 'Successfully joined tournament'
  );
  
  RETURN v_result;
END;
$function$;

-- =======================================================
-- STEP 3: Tournament Invite System
-- =======================================================

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

-- Add indexes for performance (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_tournament_invites_tournament_id ON tournament_invites(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_invitee_id ON tournament_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_status ON tournament_invites(status);

-- Add unique constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_tournament_invite' 
    AND table_name = 'tournament_invites'
  ) THEN
    ALTER TABLE tournament_invites 
    ADD CONSTRAINT unique_tournament_invite 
    UNIQUE (tournament_id, invitee_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tournament_invites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can view their own invites" ON tournament_invites;
DROP POLICY IF EXISTS "Tournament creators can invite players" ON tournament_invites;
DROP POLICY IF EXISTS "Invitees can update their invite responses" ON tournament_invites;

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

-- Drop existing invite functions
DROP FUNCTION IF EXISTS send_tournament_invite(UUID, TEXT);
DROP FUNCTION IF EXISTS respond_to_tournament_invite(UUID, TEXT);
DROP FUNCTION IF EXISTS get_friends_for_tournament_invite(UUID);

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
  
  -- Create notification (only if notifications table exists)
  BEGIN
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
  EXCEPTION WHEN others THEN
    -- Notifications table might not exist, continue without error
    NULL;
  END;
  
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

-- =======================================================
-- STEP 4: Tournament Timing and Ready-Up System
-- =======================================================

-- Create tournament match ready-up table
CREATE TABLE IF NOT EXISTS tournament_match_readyup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ready_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 minutes'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_tournament_id ON tournament_match_readyup(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_match_id ON tournament_match_readyup(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_readyup_user_id ON tournament_match_readyup(user_id);

-- Add unique constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'unique_match_readyup' 
    AND table_name = 'tournament_match_readyup'
  ) THEN
    ALTER TABLE tournament_match_readyup 
    ADD CONSTRAINT unique_match_readyup 
    UNIQUE (match_id, user_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tournament_match_readyup ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Users can view readyup for their matches" ON tournament_match_readyup;
DROP POLICY IF EXISTS "Users can ready up for their matches" ON tournament_match_readyup;

CREATE POLICY "Users can view readyup for their matches" 
ON tournament_match_readyup FOR SELECT 
USING (
  user_id = auth.uid() OR
  EXISTS(
    SELECT 1 FROM tournament_matches tm 
    WHERE tm.id = match_id 
    AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
  )
);

CREATE POLICY "Users can ready up for their matches" 
ON tournament_match_readyup FOR INSERT 
WITH CHECK (
  user_id = auth.uid() AND 
  EXISTS(
    SELECT 1 FROM tournament_matches tm 
    WHERE tm.id = match_id 
    AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
  )
);

-- Drop existing timing functions
DROP FUNCTION IF EXISTS check_tournament_start_times();
DROP FUNCTION IF EXISTS generate_tournament_bracket(UUID);
DROP FUNCTION IF EXISTS tournament_match_ready_up(UUID);
DROP FUNCTION IF EXISTS get_tournament_match_ready_status(UUID);

-- RPC Function: Check and start tournaments at their scheduled time
CREATE OR REPLACE FUNCTION check_tournament_start_times()
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participant_count INTEGER;
  v_result JSON[];
  v_tournament_result JSON;
BEGIN
  v_result := ARRAY[]::JSON[];

  -- Find tournaments that should start now
  FOR v_tournament IN 
    SELECT * FROM tournaments 
    WHERE status = 'registration' 
    AND start_at <= NOW()
    AND start_at > NOW() - INTERVAL '5 minutes' -- Only check recent ones
  LOOP
    -- Count participants
    SELECT COUNT(*) INTO v_participant_count
    FROM tournament_participants
    WHERE tournament_id = v_tournament.id;
    
    -- Need at least 2 participants to start
    IF v_participant_count >= 2 THEN
      -- Lock tournament and generate bracket
      UPDATE tournaments 
      SET status = 'ready',
          bracket_generated_at = NOW()
      WHERE id = v_tournament.id;
      
      -- Generate bracket
      PERFORM generate_tournament_bracket(v_tournament.id);
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'started',
        'participant_count', v_participant_count
      );
    ELSE
      -- Cancel tournament - not enough players
      UPDATE tournaments 
      SET status = 'cancelled'
      WHERE id = v_tournament.id;
      
      v_tournament_result := json_build_object(
        'tournament_id', v_tournament.id,
        'tournament_name', v_tournament.name,
        'action', 'cancelled',
        'reason', 'insufficient_players',
        'participant_count', v_participant_count
      );
    END IF;
    
    v_result := v_result || v_tournament_result;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'tournaments_processed', array_length(v_result, 1),
    'results', v_result
  );
END;
$function$;

-- RPC Function: Generate tournament bracket with byes
CREATE OR REPLACE FUNCTION generate_tournament_bracket(p_tournament_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tournament RECORD;
  v_participants UUID[];
  v_participant_count INTEGER;
  v_bracket_size INTEGER;
  v_round INTEGER;
  v_match_index INTEGER;
  v_total_matches INTEGER;
  v_match_id UUID;
  v_result JSON;
BEGIN
  -- Get tournament details
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Tournament not found');
  END IF;
  
  -- Get participants
  SELECT ARRAY_AGG(user_id ORDER BY joined_at) INTO v_participants
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id;
  
  v_participant_count := array_length(v_participants, 1);
  
  IF v_participant_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Not enough participants');
  END IF;
  
  -- Calculate bracket size (next power of 2)
  v_bracket_size := 2;
  WHILE v_bracket_size < v_participant_count LOOP
    v_bracket_size := v_bracket_size * 2;
  END LOOP;
  
  -- Clear existing matches
  DELETE FROM tournament_matches WHERE tournament_id = p_tournament_id;
  
  -- Create first round matches
  v_round := 1;
  v_match_index := 0;
  
  FOR i IN 1..v_bracket_size/2 LOOP
    v_match_id := gen_random_uuid();
    
    INSERT INTO tournament_matches (
      id,
      tournament_id,
      round,
      match_index,
      player1_id,
      player2_id,
      status,
      created_at
    ) VALUES (
      v_match_id,
      p_tournament_id,
      v_round,
      v_match_index,
      CASE WHEN i <= v_participant_count THEN v_participants[i] ELSE NULL END,
      CASE WHEN i + v_bracket_size/2 <= v_participant_count THEN v_participants[i + v_bracket_size/2] ELSE NULL END,
      CASE 
        WHEN i <= v_participant_count AND i + v_bracket_size/2 <= v_participant_count THEN 'ready'
        WHEN i <= v_participant_count AND i + v_bracket_size/2 > v_participant_count THEN 'completed' -- Bye
        ELSE 'pending'
      END,
      NOW()
    );
    
    -- If it's a bye (only one player), auto-advance them
    IF i <= v_participant_count AND i + v_bracket_size/2 > v_participant_count THEN
      UPDATE tournament_matches 
      SET winner_id = v_participants[i],
          status = 'completed'
      WHERE id = v_match_id;
    END IF;
    
    v_match_index := v_match_index + 1;
  END LOOP;
  
  -- Create subsequent rounds (empty)
  v_total_matches := v_bracket_size/2;
  
  WHILE v_total_matches > 1 LOOP
    v_round := v_round + 1;
    v_total_matches := v_total_matches / 2;
    v_match_index := 0;
    
    FOR i IN 1..v_total_matches LOOP
      INSERT INTO tournament_matches (
        id,
        tournament_id,
        round,
        match_index,
        status,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_tournament_id,
        v_round,
        v_match_index,
        'pending',
        NOW()
      );
      
      v_match_index := v_match_index + 1;
    END LOOP;
  END LOOP;
  
  -- Update tournament status
  UPDATE tournaments 
  SET status = 'ready',
      bracket_generated_at = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'bracket_size', v_bracket_size,
    'participant_count', v_participant_count,
    'rounds', v_round,
    'message', 'Tournament bracket generated successfully'
  );
END;
$function$;

-- RPC Function: Ready up for tournament match
CREATE OR REPLACE FUNCTION tournament_match_ready_up(
  p_match_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_match RECORD;
  v_user_id UUID;
  v_other_ready BOOLEAN;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get match details
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Check if user is a participant in this match
  IF v_match.player1_id != v_user_id AND v_match.player2_id != v_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Not a participant in this match');
  END IF;
  
  -- Check if match is ready for ready-up
  IF v_match.status != 'ready' THEN
    RETURN json_build_object('success', false, 'error', 'Match is not ready for ready-up');
  END IF;
  
  -- Insert ready-up (upsert)
  INSERT INTO tournament_match_readyup (match_id, user_id, tournament_id)
  VALUES (p_match_id, v_user_id, v_match.tournament_id)
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET ready_at = NOW(), expires_at = NOW() + INTERVAL '3 minutes';
  
  -- Check if other player is ready
  SELECT EXISTS(
    SELECT 1 FROM tournament_match_readyup 
    WHERE match_id = p_match_id 
    AND user_id != v_user_id
    AND expires_at > NOW()
  ) INTO v_other_ready;
  
  IF v_other_ready THEN
    -- Both players ready! Start match
    UPDATE tournament_matches 
    SET status = 'starting'
    WHERE id = p_match_id;
    
    v_result := json_build_object(
      'success', true,
      'both_ready', true,
      'message', 'Both players ready! Starting match...'
    );
  ELSE
    v_result := json_build_object(
      'success', true,
      'both_ready', false,
      'message', 'Ready! Waiting for opponent...'
    );
  END IF;
  
  RETURN v_result;
END;
$function$;

-- RPC Function: Get tournament match ready status
CREATE OR REPLACE FUNCTION get_tournament_match_ready_status(
  p_match_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $function$
DECLARE
  v_match RECORD;
  v_readyup_data JSON[];
  v_user_id UUID;
  v_result JSON;
BEGIN
  v_user_id := auth.uid();
  
  -- Get match details
  SELECT tm.*, t.name as tournament_name
  INTO v_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_match_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Get ready-up status
  SELECT ARRAY_AGG(
    json_build_object(
      'user_id', user_id,
      'ready_at', ready_at,
      'expires_at', expires_at,
      'is_ready', expires_at > NOW()
    )
  ) INTO v_readyup_data
  FROM tournament_match_readyup
  WHERE match_id = p_match_id;
  
  v_result := json_build_object(
    'success', true,
    'match', json_build_object(
      'id', v_match.id,
      'status', v_match.status,
      'player1_id', v_match.player1_id,
      'player2_id', v_match.player2_id,
      'tournament_name', v_match.tournament_name,
      'round', v_match.round
    ),
    'ready_status', COALESCE(v_readyup_data, ARRAY[]::JSON[]),
    'user_is_participant', (v_match.player1_id = v_user_id OR v_match.player2_id = v_user_id)
  );
  
  RETURN v_result;
END;
$function$;

-- =======================================================
-- STEP 5: Enable Realtime (Safe)
-- =======================================================

-- Add tables to realtime publication (ignore errors if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_invites;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already added to publication
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_match_readyup;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already added to publication
  END;
END $$;

-- =======================================================
-- SETUP COMPLETE!
-- =======================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Tournament system setup completed successfully!';
  RAISE NOTICE 'You can now:';
  RAISE NOTICE '1. Create tournaments with proper timing';
  RAISE NOTICE '2. Invite players via friends list or username';
  RAISE NOTICE '3. Generate brackets automatically at start time';
  RAISE NOTICE '4. Use the ready-up system with 3-minute timer';
  RAISE NOTICE '5. Progress matches through the tournament bracket';
  RAISE NOTICE '';
  RAISE NOTICE 'Next: Test tournament creation and player registration!';
END $$;