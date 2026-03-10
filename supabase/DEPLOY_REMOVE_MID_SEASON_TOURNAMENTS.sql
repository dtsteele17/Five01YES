-- ============================================================
-- Fix: Keep mid-season tournament invites, but NOT after final league match
-- End-of-season tournaments handled by "Next Season" button
-- ============================================================

-- Replace the trigger to only fire mid-season (not when all league matches are done)
CREATE OR REPLACE FUNCTION trg_fn_mid_season_tournament()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed_count INTEGER;
  v_total_opponents INTEGER;
BEGIN
  IF NEW.event_type = 'league' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT * INTO v_career FROM career_profiles WHERE id = NEW.career_id AND tier >= 2;
    IF v_career.id IS NULL THEN RETURN NEW; END IF;
    
    -- Count completed league matches this season
    SELECT COUNT(*) INTO v_completed_count
    FROM career_events
    WHERE career_id = NEW.career_id AND season = v_career.season
      AND event_type = 'league' AND status = 'completed';
    
    -- Count total league opponents
    SELECT COUNT(*) INTO v_total_opponents
    FROM career_league_standings
    WHERE career_id = NEW.career_id AND season = v_career.season
      AND tier = v_career.tier AND is_player = FALSE;
    
    -- Only create mid-season invite after 4th match (NOT after final match)
    IF v_completed_count = 4 AND v_completed_count < v_total_opponents THEN
      -- Check no tournament invite already exists this season
      IF NOT EXISTS (
        SELECT 1 FROM career_events 
        WHERE career_id = NEW.career_id AND season = v_career.season
          AND event_type = 'open' AND status IN ('pending_invite', 'pending', 'active')
          AND sequence_no < 200
      ) THEN
        DECLARE
          v_name TEXT;
          v_size INTEGER;
          v_sizes INTEGER[] := ARRAY[8, 16];
        BEGIN
          v_name := _random_pub_tournament_name();
          v_size := v_sizes[1 + floor(random() * 2)::int];
          
          INSERT INTO career_events (
            career_id, season, sequence_no, event_type, event_name,
            format_legs, bracket_size, status, day
          ) VALUES (
            NEW.career_id, v_career.season, 100, 'open', v_name,
            CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size, 
            'pending_invite', COALESCE(NEW.day, v_career.day) + 3
          );
          
          -- Create invite email milestone
          INSERT INTO career_milestones (
            career_id, milestone_type, title, description, tier, season, week, day
          ) VALUES (
            NEW.career_id, 'tournament_invite',
            v_name || ' — You''re Invited!',
            'You''ve been invited to the ' || v_name || '! A ' || v_size || '-player knockout tournament. Do you want to enter?',
            v_career.tier, v_career.season, v_career.week, COALESCE(NEW.day, v_career.day)
          );
        END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Replace the trigger
DROP TRIGGER IF EXISTS trg_end_season_tournament ON career_events;
DROP TRIGGER IF EXISTS trg_mid_season_tournament ON career_events;
CREATE TRIGGER trg_mid_season_tournament
  AFTER UPDATE ON career_events
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_mid_season_tournament();

-- RPC for frontend to create end-of-season tournament invites on "Next Season" click
DROP FUNCTION IF EXISTS rpc_create_end_season_tournaments(UUID);
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
  
  -- Check if end-of-season tournaments already exist (any status)
  IF EXISTS (
    SELECT 1 FROM career_events 
    WHERE career_id = p_career_id AND season = v_career.season 
      AND event_type = 'open' AND sequence_no >= 200
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;
  
  v_name1 := _random_pub_tournament_name();
  v_name2 := _random_pub_tournament_name();
  WHILE v_name2 = v_name1 LOOP
    v_name2 := _random_pub_tournament_name();
  END LOOP;
  
  IF v_career.tier >= 3 THEN
    v_size1 := CASE WHEN random() < 0.5 THEN 16 ELSE 32 END;
    v_size2 := CASE WHEN random() < 0.5 THEN 32 ELSE 16 END;
  ELSE
    v_size1 := v_sizes[1 + floor(random() * 3)::int];
    v_size2 := v_sizes[1 + floor(random() * 3)::int];
  END IF;
  
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, v_career.season, 200, 'open', v_name1,
    CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END, v_size1, 'pending_invite', v_career.day + 3
  ) RETURNING id INTO v_id1;
  
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
