-- ============================================================
-- Remove mid-season tournament invites
-- Only offer tournaments after season ends (via Next Season button)
-- ============================================================

-- Disable the end-of-season tournament trigger (it fires mid-season too)
DROP TRIGGER IF EXISTS trg_end_season_tournament ON career_events;

-- Skip any existing mid-season pending_invite events 
-- (only keep end-of-season ones with sequence_no >= 200)
UPDATE career_events 
SET status = 'skipped' 
WHERE status = 'pending_invite' 
  AND event_type = 'open'
  AND sequence_no < 200;

-- Remove the mid-season tournament creation from rpc_career_complete_match
-- by replacing the trigger with one that ONLY fires at end of season
-- (when ALL league matches are done)

-- RPC for frontend to create end-of-season tournament invites on "Next Season" click
CREATE OR REPLACE FUNCTION rpc_create_end_season_tournaments(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_name1 TEXT;
  v_name2 TEXT;
  v_size1 INTEGER;
  v_size2 INTEGER;
  v_sizes INTEGER[] := ARRAY[8, 16, 32];
  v_id1 UUID;
  v_id2 UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  
  -- Check no invites already exist
  IF EXISTS (
    SELECT 1 FROM career_events 
    WHERE career_id = p_career_id AND season = v_career.season 
      AND event_type = 'open' AND status = 'pending_invite'
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;
  
  -- Generate 2 different random tournament names
  v_name1 := _random_pub_tournament_name();
  v_name2 := _random_pub_tournament_name();
  WHILE v_name2 = v_name1 LOOP
    v_name2 := _random_pub_tournament_name();
  END LOOP;
  
  -- Random bracket sizes (Tier 2: 8/16/32, Tier 3+: 16/32)
  IF v_career.tier >= 3 THEN
    v_size1 := CASE WHEN random() < 0.5 THEN 16 ELSE 32 END;
    v_size2 := CASE WHEN random() < 0.5 THEN 32 ELSE 16 END;
  ELSE
    v_size1 := v_sizes[1 + floor(random() * 3)::int];
    v_size2 := v_sizes[1 + floor(random() * 3)::int];
  END IF;
  
  -- Create tournament 1
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, v_career.season, 200, 'open', v_name1,
    CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size1, 'pending_invite', v_career.day + 3
  ) RETURNING id INTO v_id1;
  
  -- Create tournament 2
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, v_career.season, 201, 'open', v_name2,
    CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size2, 'pending_invite', v_career.day + 5
  ) RETURNING id INTO v_id2;
  
  RETURN json_build_object('success', true, 'id1', v_id1, 'id2', v_id2);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_end_season_tournaments(UUID) TO authenticated;
