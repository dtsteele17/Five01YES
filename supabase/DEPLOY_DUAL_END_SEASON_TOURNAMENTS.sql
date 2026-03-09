-- ============================================================
-- Dual end-of-season tournament invites
-- 2 random tournaments, accept 1 auto-declines the other
-- ============================================================

-- Replace the single tournament creator with dual
CREATE OR REPLACE FUNCTION _check_create_end_season_tournament(
  p_career_id UUID,
  p_career career_profiles,
  p_day INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completed_league_count INTEGER;
  v_total_opponents INTEGER;
  v_name1 TEXT;
  v_name2 TEXT;
  v_size1 INTEGER;
  v_size2 INTEGER;
  v_id1 UUID;
  v_id2 UUID;
  v_sizes INTEGER[] := ARRAY[8, 16, 32];
BEGIN
  -- Count completed league matches this season
  SELECT COUNT(*) INTO v_completed_league_count
  FROM career_events ce
  WHERE ce.career_id = p_career_id
    AND ce.season = p_career.season
    AND ce.event_type = 'league'
    AND ce.status = 'completed';

  -- Count total league opponents
  SELECT COUNT(*) INTO v_total_opponents
  FROM career_league_standings
  WHERE career_id = p_career_id
    AND season = p_career.season
    AND tier = p_career.tier
    AND is_player = FALSE;

  -- Only create if ALL league matches are done
  IF v_completed_league_count < v_total_opponents THEN
    RETURN NULL;
  END IF;

  -- Check no end-of-season tournaments already exist
  IF EXISTS (
    SELECT 1 FROM career_events 
    WHERE career_id = p_career_id 
      AND season = p_career.season 
      AND event_type = 'open'
      AND status IN ('pending', 'pending_invite', 'active')
      AND sequence_no >= 200
  ) THEN
    RETURN NULL;
  END IF;

  -- Generate 2 different random names
  v_name1 := _random_end_of_season_tournament_name();
  v_name2 := _random_end_of_season_tournament_name();
  -- Ensure they're different
  WHILE v_name2 = v_name1 LOOP
    v_name2 := _random_end_of_season_tournament_name();
  END LOOP;

  -- Random bracket sizes (at least 8)
  v_size1 := v_sizes[1 + floor(random() * 3)::int];
  v_size2 := v_sizes[1 + floor(random() * 3)::int];

  -- Create tournament 1
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, p_career.season, 200, 'open', v_name1,
    3, v_size1, 'pending_invite', p_day + 3
  ) RETURNING id INTO v_id1;

  -- Create tournament 2
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, p_career.season, 201, 'open', v_name2,
    3, v_size2, 'pending_invite', p_day + 5
  ) RETURNING id INTO v_id2;

  -- Create invite emails for both
  INSERT INTO career_milestones (
    career_id, milestone_type, title, description,
    tier, season, week, day
  ) VALUES (
    p_career_id, 'tournament_invite',
    v_name1 || ' — You''re Invited!',
    'You''ve been invited to the ' || v_name1 || '! A ' || v_size1 || '-player end-of-season knockout tournament at the local. Do you want to enter?',
    p_career.tier, p_career.season, p_career.week, p_day
  ), (
    p_career_id, 'tournament_invite',
    v_name2 || ' — You''re Invited!',
    'You''ve been invited to the ' || v_name2 || '! A ' || v_size2 || '-player end-of-season knockout tournament at the local. Do you want to enter?',
    p_career.tier, p_career.season, p_career.week, p_day
  );

  RETURN v_id1;
END;
$$;

-- Update respond RPC to auto-decline the other end-of-season invite when accepting
CREATE OR REPLACE FUNCTION rpc_career_respond_tournament_invite(
  p_career_id UUID,
  p_event_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event career_events;
  v_other_id UUID;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not your career');
  END IF;

  -- Get the event
  SELECT * INTO v_event FROM career_events
  WHERE id = p_event_id AND career_id = p_career_id AND status = 'pending_invite';
  
  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No pending invite found');
  END IF;

  IF p_accept THEN
    -- Accept this one
    UPDATE career_events SET status = 'pending',
      sequence_no = (
        SELECT COALESCE(MAX(sequence_no), 0) + 1
        FROM career_events
        WHERE career_id = p_career_id AND season = v_event.season
          AND status IN ('pending', 'active') AND event_type != 'league'
      )
    WHERE id = p_event_id;

    -- Auto-decline any OTHER pending_invite end-of-season tournaments (sequence >= 200)
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id
      AND season = v_event.season
      AND id != p_event_id
      AND status = 'pending_invite'
      AND sequence_no >= 200;

    RETURN jsonb_build_object('success', true, 'message', 'Tournament accepted! Good luck!');
  ELSE
    -- Decline this one
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Tournament declined.');
  END IF;
END;
$$;
