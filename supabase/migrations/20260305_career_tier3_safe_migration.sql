-- ============================================================
-- Career Tier 3 - Safe Migration (No Duplicates)
-- Updates existing data and adds new features safely
-- ============================================================

-- First, let's check what exists and update safely
DO $$
BEGIN
  -- Update existing Tier 3 schedule OR insert new one
  DELETE FROM career_schedule_templates WHERE tier = 3;
  
  -- Insert new Tier 3 schedule (County Circuit with tournament choices)
  INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
  -- First 3 league games
  (3, 1,  'league', 'County League — Matchday 1', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 2,  'league', 'County League — Matchday 2', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 3,  'league', 'County League — Matchday 3', 'county_league', 5, NULL, FALSE, '{}'),

  -- Tournament choice #1 (after 3 games)
  (3, 4,  'tournament_choice', 'Tournament Choice #1', 'county_tournament_choice', 5, NULL, FALSE, '{
    "description": "Choose your tournament or skip to continue league play",
    "tournaments": [
      {"name": "County Cup", "size": 16, "description": "16-player knockout tournament"},
      {"name": "Regional Open", "size": 32, "description": "32-player championship"}
    ],
    "can_decline": true
  }'),

  -- Next 3 league games
  (3, 5,  'league', 'County League — Matchday 4', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 6,  'league', 'County League — Matchday 5', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 7,  'league', 'County League — Matchday 6', 'county_league', 5, NULL, FALSE, '{}'),

  -- Tournament choice #2 (after 6 games)
  (3, 8,  'tournament_choice', 'Tournament Choice #2', 'county_tournament_choice', 5, NULL, FALSE, '{
    "description": "Choose your tournament or skip to continue league play", 
    "tournaments": [
      {"name": "County Masters", "size": 16, "description": "16-player elite tournament"},
      {"name": "Championship Open", "size": 32, "description": "32-player grand tournament"}
    ],
    "can_decline": true
  }'),

  -- Final 3 league games
  (3, 9,  'league', 'County League — Matchday 7', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 10, 'league', 'County League — Matchday 8', 'county_league', 5, NULL, FALSE, '{}'),
  (3, 11, 'league', 'County League — Matchday 9', 'county_league', 5, NULL, FALSE, '{}'),

  -- Tournament choice #3 (after 9 games - end of season)
  (3, 12, 'tournament_choice', 'Tournament Choice #3', 'county_tournament_choice', 5, NULL, FALSE, '{
    "description": "Final tournament of the season",
    "tournaments": [
      {"name": "Season Finale", "size": 16, "description": "16-player season ending tournament"},
      {"name": "Grand Championship", "size": 32, "description": "32-player ultimate championship"}
    ],
    "can_decline": true
  }');

  -- Add Tier 2 relegation tournament using next available sequence_no
  INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) 
  SELECT 
    2,
    COALESCE(MAX(sequence_no), 0) + 1,
    'relegation_tournament',
    'Pub League Playoff',
    'pub_relegation',
    3,
    8,
    FALSE,
    '{
      "description": "One last chance to prove yourself before starting a new season",
      "triggers_new_season": true,
      "refreshes_opponents": true,
      "refresh_positions": [1, 2, 7, 8]
    }'::jsonb
  FROM career_schedule_templates 
  WHERE tier = 2;

END $$;

-- Update event type constraints safely
DO $$
BEGIN
  -- Drop old constraints if they exist
  ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
  ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;
  
  -- Add new constraints with all event types
  ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_event_type_check 
    CHECK (event_type IN (
      'league','open','qualifier','promotion','training','rest',
      'trial_tournament','premier_league_night','major','season_finals',
      'tournament_choice','relegation_tournament'
    ));
    
  ALTER TABLE career_events ADD CONSTRAINT career_events_event_type_check 
    CHECK (event_type IN (
      'league','open','qualifier','promotion','training','rest',
      'trial_tournament','premier_league_night','major','season_finals',
      'tournament_choice','relegation_tournament'
    ));
END $$;

-- ============================================================
-- RPC Functions (Create or Replace - Safe)
-- ============================================================

-- RPC: Handle tournament choice in Tier 3
CREATE OR REPLACE FUNCTION rpc_career_tournament_choice(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_choice SMALLINT,  -- 1 or 2 for tournament options, 0 to decline
  p_tournament_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_tournament_data JSONB;
  v_chosen_tournament JSONB;
  v_bracket_size SMALLINT;
  v_event_name TEXT;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get the tournament choice event
  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id AND event_type = 'tournament_choice';
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Tournament choice event not found');
  END IF;
  
  -- Get tournament options from the template
  SELECT metadata INTO v_tournament_data 
  FROM career_schedule_templates 
  WHERE tier = v_career.tier AND sequence_no = v_event.sequence_no;
  
  -- Handle tournament choice
  IF p_tournament_choice = 0 THEN
    -- User declined tournament
    UPDATE career_events SET 
      status = 'completed',
      completed_at = now(),
      result = json_build_object('declined', true, 'choice', 'declined')
    WHERE id = p_event_id;
    
    RETURN json_build_object(
      'success', true,
      'declined', true,
      'message', 'Tournament declined, continuing with league play'
    );
  ELSE
    -- User chose a tournament
    v_chosen_tournament := (v_tournament_data->'tournaments'->>(p_tournament_choice-1)::int)::jsonb;
    v_bracket_size := (v_chosen_tournament->>'size')::smallint;
    v_event_name := v_chosen_tournament->>'name';
    
    -- Update the event to become a tournament bracket event
    UPDATE career_events SET 
      event_type = 'open',
      event_name = v_event_name,
      bracket_size = v_bracket_size,
      status = 'active',
      result = json_build_object('choice', p_tournament_choice, 'tournament_name', v_event_name)
    WHERE id = p_event_id;
    
    -- Initialize the tournament bracket (only if not exists)
    INSERT INTO career_brackets (
      event_id,
      career_id,
      bracket_size,
      rounds_total,
      current_round,
      bracket_data,
      status
    ) VALUES (
      p_event_id,
      p_career_id,
      v_bracket_size,
      CASE 
        WHEN v_bracket_size = 8 THEN 3
        WHEN v_bracket_size = 16 THEN 4 
        WHEN v_bracket_size = 32 THEN 5
      END,
      1,
      '[]'::jsonb,
      'active'
    )
    ON CONFLICT (event_id) DO NOTHING;
    
    RETURN json_build_object(
      'success', true,
      'tournament_chosen', true,
      'tournament_name', v_event_name,
      'bracket_size', v_bracket_size,
      'event_id', p_event_id
    );
  END IF;
END;
$$;

-- RPC: Check and offer sponsor based on performance
CREATE OR REPLACE FUNCTION rpc_career_check_sponsor_offer(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_has_sponsor BOOLEAN := FALSE;
  v_recent_wins INTEGER := 0;
  v_tournament_final BOOLEAN := FALSE;
  v_should_offer BOOLEAN := FALSE;
  v_sponsors JSONB := '[]'::jsonb;
  v_sponsor_cursor CURSOR FOR 
    SELECT * FROM career_sponsor_catalog 
    WHERE tier_min <= (SELECT tier FROM career_profiles WHERE id = p_career_id)
    AND tier_max >= (SELECT tier FROM career_profiles WHERE id = p_career_id)
    ORDER BY RANDOM()
    LIMIT 3;
  v_sponsor_record career_sponsor_catalog;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Only check for tier 3+
  IF v_career.tier < 3 THEN
    RETURN json_build_object('no_offer', true, 'reason', 'Tier too low');
  END IF;
  
  -- Check if already has sponsor
  SELECT COUNT(*) > 0 INTO v_has_sponsor
  FROM career_sponsor_contracts 
  WHERE career_id = p_career_id AND status = 'active';
  
  IF v_has_sponsor THEN
    RETURN json_build_object('no_offer', true, 'reason', 'Already has sponsor');
  END IF;
  
  -- Check for 3 consecutive league wins
  WITH recent_league_matches AS (
    SELECT cm.result, cm.played_at
    FROM career_matches cm
    JOIN career_events ce ON cm.event_id = ce.id
    WHERE cm.career_id = p_career_id 
    AND ce.event_type = 'league'
    AND cm.result IS NOT NULL
    ORDER BY cm.played_at DESC
    LIMIT 3
  )
  SELECT COUNT(*) INTO v_recent_wins
  FROM recent_league_matches
  WHERE result = 'win';
  
  -- Check for recent tournament final
  WITH recent_tournaments AS (
    SELECT cb.player_eliminated_round, cb.rounds_total, ce.completed_at
    FROM career_brackets cb
    JOIN career_events ce ON cb.event_id = ce.id
    WHERE cb.career_id = p_career_id
    AND ce.status = 'completed'
    AND ce.completed_at > now() - INTERVAL '30 days'
    ORDER BY ce.completed_at DESC
    LIMIT 1
  )
  SELECT (player_eliminated_round IS NULL OR player_eliminated_round >= rounds_total - 1) INTO v_tournament_final
  FROM recent_tournaments;
  
  -- Determine if should offer sponsor
  v_should_offer := (v_recent_wins >= 3) OR COALESCE(v_tournament_final, FALSE);
  
  IF NOT v_should_offer THEN
    RETURN json_build_object('no_offer', true, 'reason', 'Performance criteria not met');
  END IF;
  
  -- Get 3 random sponsors for current tier
  FOR v_sponsor_record IN v_sponsor_cursor LOOP
    v_sponsors := v_sponsors || json_build_object(
      'id', v_sponsor_record.id,
      'name', v_sponsor_record.name,
      'rep_bonus_pct', v_sponsor_record.rep_bonus_pct,
      'rep_objectives', v_sponsor_record.rep_objectives,
      'flavour_text', v_sponsor_record.flavour_text,
      'rarity', v_sponsor_record.rarity
    );
  END LOOP;
  
  RETURN json_build_object(
    'sponsor_offer', true,
    'sponsors', v_sponsors,
    'trigger_reason', CASE 
      WHEN v_recent_wins >= 3 THEN '3 consecutive league wins'
      WHEN v_tournament_final THEN 'Reached tournament final'
      ELSE 'Performance milestone'
    END
  );
END;
$$;

-- RPC: Accept sponsor contract
CREATE OR REPLACE FUNCTION rpc_career_accept_sponsor(
  p_career_id UUID,
  p_sponsor_id UUID,
  p_slot SMALLINT DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_sponsor career_sponsor_catalog;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get sponsor details
  SELECT * INTO v_sponsor FROM career_sponsor_catalog WHERE id = p_sponsor_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Sponsor not found');
  END IF;
  
  -- Deactivate any existing sponsor in this slot
  UPDATE career_sponsor_contracts 
  SET status = 'replaced'
  WHERE career_id = p_career_id AND slot = p_slot AND status = 'active';
  
  -- Create new sponsor contract
  INSERT INTO career_sponsor_contracts (
    career_id,
    sponsor_id,
    slot,
    accepted_at_week,
    accepted_at_season,
    objectives_progress,
    status
  ) VALUES (
    p_career_id,
    p_sponsor_id,
    p_slot,
    v_career.week,
    v_career.season,
    '{}'::jsonb,
    'active'
  );
  
  -- Add milestone
  INSERT INTO career_milestones (
    career_id,
    milestone_type,
    title,
    description,
    tier,
    season,
    week,
    day
  ) VALUES (
    p_career_id,
    'sponsor_signed',
    'New Sponsor!',
    'Signed with ' || v_sponsor.name,
    v_career.tier,
    v_career.season,
    v_career.week,
    v_career.day
  );
  
  RETURN json_build_object(
    'success', true,
    'sponsor_name', v_sponsor.name,
    'message', 'Sponsor contract signed successfully!'
  );
END;
$$;