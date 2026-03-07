-- ============================================================
-- FIX FIFA NAMING CONFLICTS WITH EXISTING SCHEMA
-- Use existing column names and systems instead of creating new ones
-- ============================================================

-- 1. Fix career_league_standings column names - use existing 'won'/'lost' not 'wins'/'losses'
-- First remove the problematic wins/losses columns I tried to add
ALTER TABLE career_league_standings 
DROP COLUMN IF EXISTS wins,
DROP COLUMN IF EXISTS losses;

-- 2. Fix all FIFA functions to use existing column names
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_pub_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER := 7;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier
  SELECT COUNT(*) INTO v_existing_opponents 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2;
  
  -- Use existing opponents first, only create new ones if really needed
  IF v_existing_opponents < v_opponents_needed THEN
    -- Generate minimal new opponents using simple approach
    INSERT INTO career_opponents (career_id, tier, first_name, last_name, hometown, archetype, skill_rating)
    SELECT 
      p_career_id, 
      2,
      'Player' || generate_series(v_existing_opponents + 1, v_opponents_needed),
      'Opponent',
      'Local',
      'allrounder',
      50.0
    FROM generate_series(v_existing_opponents + 1, v_opponents_needed);
  END IF;
  
  -- Clear existing league standings for this season
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 2;
  
  -- Create player standing - USE EXISTING COLUMN NAMES: won/lost not wins/losses
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, won, lost, points
  ) VALUES (
    p_career_id, p_season, 2, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings using existing opponents - USE EXISTING COLUMN NAMES
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, won, lost, points)
  SELECT p_career_id, p_season, 2, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 2
  ORDER BY id
  LIMIT 7;
  
  RETURN json_build_object('success', true, 'league_size', 8);
END;
$$;

-- 3. Fix County League function to use existing column names
CREATE OR REPLACE FUNCTION rpc_fifa_initialize_county_league(p_career_id UUID, p_season SMALLINT)
RETURNS JSON  
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER := 11;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing opponents for this tier  
  SELECT COUNT(*) INTO v_existing_opponents 
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3;
  
  -- Use existing opponents first
  IF v_existing_opponents < v_opponents_needed THEN
    INSERT INTO career_opponents (career_id, tier, first_name, last_name, hometown, archetype, skill_rating)
    SELECT 
      p_career_id, 
      3,
      'County' || generate_series(v_existing_opponents + 1, v_opponents_needed),
      'Player',
      'Regional',
      'allrounder',
      60.0
    FROM generate_series(v_existing_opponents + 1, v_opponents_needed);
  END IF;
  
  -- Clear existing league standings
  DELETE FROM career_league_standings 
  WHERE career_id = p_career_id AND season = p_season AND tier = 3;
  
  -- Create player standing - USE EXISTING COLUMN NAMES
  INSERT INTO career_league_standings (
    career_id, season, tier, is_player, played, won, lost, points
  ) VALUES (
    p_career_id, p_season, 3, TRUE, 0, 0, 0, 0
  );
  
  -- Create opponent standings using existing opponents - USE EXISTING COLUMN NAMES
  INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player, played, won, lost, points)
  SELECT p_career_id, p_season, 3, id, FALSE, 0, 0, 0, 0
  FROM career_opponents 
  WHERE career_id = p_career_id AND tier = 3
  ORDER BY id
  LIMIT 11;
  
  RETURN json_build_object('success', true, 'league_size', 12);
END;
$$;

-- 4. Fix enhanced match completion to use existing column names
CREATE OR REPLACE FUNCTION rpc_fifa_career_match_complete(
  p_career_id UUID,
  p_match_id UUID,
  p_won BOOLEAN,
  p_player_legs SMALLINT,
  p_opponent_legs SMALLINT,
  p_player_average REAL DEFAULT NULL,
  p_opponent_average REAL DEFAULT NULL,
  p_player_checkout_pct REAL DEFAULT NULL,
  p_player_180s SMALLINT DEFAULT 0,
  p_player_highest_checkout SMALLINT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles%ROWTYPE;
  v_match career_matches%ROWTYPE;
  v_event career_events%ROWTYPE;
  v_rep_gained INTEGER := 0;
  v_completed_matches INTEGER;
BEGIN
  -- Get match, career, and event details
  SELECT * INTO v_match FROM career_matches WHERE id = p_match_id;
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  SELECT * INTO v_event FROM career_events WHERE id = v_match.event_id;
  
  IF v_match.id IS NULL OR v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Match or career not found');
  END IF;
  
  -- Update match results
  UPDATE career_matches SET
    result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    player_average = p_player_average,
    opponent_average = p_opponent_average,
    player_checkout_pct = p_player_checkout_pct,
    player_180s = p_player_180s,
    player_highest_checkout = p_player_highest_checkout,
    played_at = now()
  WHERE id = p_match_id;
  
  -- Complete the event
  UPDATE career_events SET 
    status = 'completed',
    completed_at = now()
  WHERE id = v_match.event_id;
  
  -- Update league standings using EXISTING COLUMN NAMES: won/lost not wins/losses
  IF v_event.event_type = 'league' THEN
    -- Update player standings
    IF p_won THEN
      UPDATE career_league_standings SET 
        played = played + 1,
        won = won + 1,  -- USE EXISTING COLUMN NAME
        points = points + 3,
        legs_for = legs_for + p_player_legs,
        legs_against = legs_against + p_opponent_legs
      WHERE career_id = p_career_id 
        AND season = v_career.season 
        AND tier = v_career.tier
        AND is_player = TRUE;
      
      v_rep_gained := CASE WHEN v_career.tier = 3 THEN 20 ELSE 15 END;
    ELSE
      UPDATE career_league_standings SET 
        played = played + 1,
        lost = lost + 1,  -- USE EXISTING COLUMN NAME
        legs_for = legs_for + p_player_legs,
        legs_against = legs_against + p_opponent_legs
      WHERE career_id = p_career_id 
        AND season = v_career.season 
        AND tier = v_career.tier
        AND is_player = TRUE;
      
      v_rep_gained := CASE WHEN v_career.tier = 3 THEN 8 ELSE 5 END;
    END IF;

    -- Update opponent standings (opposite result)
    IF p_won THEN
      UPDATE career_league_standings SET 
        played = played + 1,
        lost = lost + 1,  -- USE EXISTING COLUMN NAME
        legs_for = legs_for + p_opponent_legs,
        legs_against = legs_against + p_player_legs
      WHERE career_id = p_career_id 
        AND season = v_career.season 
        AND tier = v_career.tier
        AND opponent_id = v_match.opponent_id;
    ELSE
      UPDATE career_league_standings SET 
        played = played + 1,
        won = won + 1,  -- USE EXISTING COLUMN NAME
        points = points + 3,
        legs_for = legs_for + p_opponent_legs,
        legs_against = legs_against + p_player_legs
      WHERE career_id = p_career_id 
        AND season = v_career.season 
        AND tier = v_career.tier
        AND opponent_id = v_match.opponent_id;
    END IF;
  END IF;
  
  -- Apply sponsor bonus to REP if applicable
  IF v_rep_gained > 0 AND v_career.current_sponsor_id IS NOT NULL THEN
    DECLARE
      v_sponsor_bonus REAL;
    BEGIN
      SELECT rep_bonus_pct INTO v_sponsor_bonus
      FROM career_sponsor_catalog 
      WHERE id = v_career.current_sponsor_id;
      
      IF v_sponsor_bonus IS NOT NULL THEN
        v_rep_gained := v_rep_gained + (v_rep_gained * v_sponsor_bonus)::integer;
      END IF;
    END;
  END IF;

  -- Award REP
  IF v_rep_gained > 0 THEN
    UPDATE career_profiles SET rep = rep + v_rep_gained WHERE id = p_career_id;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'rep_earned', v_rep_gained
  );
END;
$$;

-- 5. Use existing email system instead of creating new career_emails table
-- Drop the career_emails table I tried to create
DROP TABLE IF EXISTS career_emails CASCADE;

-- Update functions to use existing rpc_generate_career_emails instead
CREATE OR REPLACE FUNCTION rpc_fifa_send_career_email(
  p_career_id UUID,
  p_subject TEXT,
  p_body TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use existing email generation system
  PERFORM rpc_generate_career_emails(p_career_id, p_subject || ': ' || p_body);
  
  RETURN json_build_object('success', true, 'email_sent', true);
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🔧 FIFA Naming Conflicts Fixed!';
  RAISE NOTICE '✅ Using existing won/lost columns (not wins/losses)';
  RAISE NOTICE '✅ Using existing email system (not new career_emails table)';
  RAISE NOTICE '✅ All functions updated to match existing schema';
  RAISE NOTICE 'FIFA system now aligned with existing database! 🎯';
END $$;