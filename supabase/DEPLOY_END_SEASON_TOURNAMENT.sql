-- ============================================================
-- Add end-of-season tournament after final league match
-- Random name, random 8 or 16 players, BO3 with BO5 final
-- Triggers when all league matches are completed
-- ============================================================

-- Add more tournament name options for end-of-season
CREATE OR REPLACE FUNCTION _random_end_of_season_tournament_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'The Season Finale Cup',
    'The Last Orders Trophy',
    'The Champions Invitational',
    'The Closing Night Classic',
    'The End of Season Showdown',
    'The Grand Finale Open',
    'The Victory Lap Trophy',
    'The Final Flourish Cup',
    'The Farewell Stakes',
    'The Season''s End Championship',
    'The Curtain Call Classic',
    'The Last Dart Trophy',
    'The Endgame Invitational',
    'The Swan Song Cup',
    'The Final Fling Open',
    'The Season Closer',
    'The Last Man Standing Cup',
    'The Oche Finale',
    'The Bottom of the Glass Trophy',
    'The Final Round Invitational'
  ];
BEGIN
  RETURN v_names[1 + floor(random() * array_length(v_names, 1))::int];
END;
$$;

-- Now update rpc_career_complete_match to also trigger end-of-season tournament
-- We need to add the check AFTER updating standings for the final league match

-- First, let's see the current league match counts per tier:
-- Tier 2: 7 opponents = 7 league matches
-- Tier 3: 9 opponents = 9 league matches  
-- Tier 4: 11 opponents = 11 league matches
-- Tier 5: 13 opponents = 13 league matches

-- Create a helper function to check and create end-of-season tournament
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
  v_tournament_name TEXT;
  v_tournament_id UUID;
  v_bracket_size INTEGER;
BEGIN
  -- Count completed league matches this season
  SELECT COUNT(*) INTO v_completed_league_count
  FROM career_events ce
  WHERE ce.career_id = p_career_id
    AND ce.season = p_career.season
    AND ce.event_type = 'league'
    AND ce.status = 'completed';

  -- Count total league opponents (= total league matches needed)
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

  -- Check no end-of-season tournament already exists
  -- (mid-season tournament has 'open' type, end-season will also be 'open' but we check by name pattern)
  IF EXISTS (
    SELECT 1 FROM career_events 
    WHERE career_id = p_career_id 
      AND season = p_career.season 
      AND event_type = 'open'
      AND status IN ('pending', 'pending_invite', 'active')
      AND sequence_no > 90  -- end-of-season tournaments have high sequence numbers
  ) THEN
    RETURN NULL;
  END IF;

  -- Random bracket size: 8 or 16
  v_bracket_size := CASE WHEN random() < 0.5 THEN 8 ELSE 16 END;
  v_tournament_name := _random_end_of_season_tournament_name();

  -- Create the tournament event as pending_invite
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, status, day
  ) VALUES (
    p_career_id, p_career.season,
    200,  -- high sequence = end of season
    'open',
    v_tournament_name,
    3,    -- best of 3 (final will be best of 5, handled in match launch)
    v_bracket_size,
    'pending_invite',
    p_day + 3
  ) RETURNING id INTO v_tournament_id;

  -- Add invite milestone/email
  INSERT INTO career_milestones (
    career_id, milestone_type, title, description,
    tier, season, week, day
  ) VALUES (
    p_career_id, 'tournament_invite',
    v_tournament_name || ' — Invitation',
    'You''ve been invited to the ' || v_tournament_name || '! A ' || v_bracket_size || '-player end-of-season knockout tournament.',
    p_career.tier, p_career.season, p_career.week, p_day
  );

  RETURN v_tournament_id;
END;
$$;

-- Now we need to call this from rpc_career_complete_match.
-- Since the function is huge, we'll create a trigger on career_events status change instead:

CREATE OR REPLACE FUNCTION trg_check_end_season_tournament()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_result UUID;
BEGIN
  -- Only fire when a league event is completed
  IF NEW.event_type = 'league' AND NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT * INTO v_career FROM career_profiles WHERE id = NEW.career_id AND tier >= 2;
    IF v_career.id IS NOT NULL THEN
      v_result := _check_create_end_season_tournament(NEW.career_id, v_career, COALESCE(NEW.day, v_career.day));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_end_season_tournament ON career_events;
CREATE TRIGGER trg_end_season_tournament
  AFTER UPDATE ON career_events
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_end_season_tournament();
