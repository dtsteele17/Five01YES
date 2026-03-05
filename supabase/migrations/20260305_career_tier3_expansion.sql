-- ============================================================
-- Career Mode Tier 3 Expansion Migration
-- Implements tournament choice system, enhanced sponsors, tier 2 relegation
-- ============================================================

-- Update event type constraints to include new event types
ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_event_type_check 
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament'
  ));
  
ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;
ALTER TABLE career_events ADD CONSTRAINT career_events_event_type_check 
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament'
  ));

-- Remove existing Tier 3 schedule and replace with new tournament choice system
DELETE FROM career_schedule_templates WHERE tier = 3;

-- ===================== NEW TIER 3: County Circuit (9 league games + tournaments) =====================
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

-- Add Tier 2 relegation tournament
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(2, 9, 'relegation_tournament', 'Pub League Playoff', 'pub_relegation', 3, 8, FALSE, '{
  "description": "One last chance to prove yourself before starting a new season",
  "triggers_new_season": true,
  "refreshes_opponents": true,
  "refresh_positions": [1, 2, 7, 8]
}');

-- ============================================================
-- RPC Functions
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
    
    -- Initialize the tournament bracket
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
      '[]'::jsonb,  -- Will be populated by existing bracket generation logic
      'active'
    );
    
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

-- RPC: Handle tier 2 season completion and potential relegation
CREATE OR REPLACE FUNCTION rpc_career_tier2_season_complete(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_player_position INTEGER;
  v_promoted BOOLEAN := FALSE;
  v_relegation_event_id UUID;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Check player's final position in tier 2
  SELECT 
    ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) as position
  INTO v_player_position
  FROM career_league_standings 
  WHERE career_id = p_career_id 
    AND season = v_career.season 
    AND tier = 2 
    AND is_player = TRUE;
  
  -- Check if promoted (top 2)
  IF v_player_position <= 2 THEN
    v_promoted := TRUE;
    
    -- Promote to tier 3
    UPDATE career_profiles SET 
      tier = 3,
      season = season + 1,
      week = 0,
      day = 1
    WHERE id = p_career_id;
    
    -- Add promotion milestone
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
      'promotion',
      'Promoted to County Circuit!',
      'Finished ' || 
      CASE v_player_position 
        WHEN 1 THEN '1st' 
        WHEN 2 THEN '2nd' 
      END || ' in the Pub Leagues',
      3,
      v_career.season + 1,
      0,
      1
    );
    
    RETURN json_build_object(
      'promoted', true,
      'new_tier', 3,
      'position', v_player_position,
      'message', 'Congratulations! You have been promoted to the County Circuit!'
    );
  ELSE
    -- Not promoted - create relegation tournament
    INSERT INTO career_events (
      career_id,
      season,
      sequence_no,
      event_type,
      event_name,
      format_legs,
      bracket_size,
      day,
      status
    ) VALUES (
      p_career_id,
      v_career.season,
      9,  -- matches the template sequence_no
      'relegation_tournament',
      'Pub League Playoff',
      3,
      8,
      COALESCE(v_career.day, 1) + 1,
      'pending'
    ) RETURNING id INTO v_relegation_event_id;
    
    RETURN json_build_object(
      'promoted', false,
      'position', v_player_position,
      'relegation_tournament_id', v_relegation_event_id,
      'message', 'Season complete. One final tournament to prove yourself before starting fresh!'
    );
  END IF;
END;
$$;

-- RPC: Generate tier 3 league with 10 players (user + 9 opponents)
CREATE OR REPLACE FUNCTION rpc_career_generate_tier3_league(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_existing_opponents INTEGER;
  v_opponents_needed INTEGER;
  v_new_opponent RECORD;
  v_i INTEGER;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Count existing tier 3 opponents
  SELECT COUNT(*) INTO v_existing_opponents
  FROM career_opponents
  WHERE career_id = p_career_id AND tier = 3;
  
  -- Generate additional opponents to reach 9 total (10 including player)
  v_opponents_needed := 9 - v_existing_opponents;
  
  FOR v_i IN 1..v_opponents_needed LOOP
    INSERT INTO career_opponents (
      career_id,
      first_name,
      last_name,
      nickname,
      hometown,
      tier,
      archetype,
      skill_rating,
      avatar_seed
    ) SELECT 
      p_career_id,
      first_names.name,
      last_names.name,
      CASE WHEN random() < 0.35 THEN nicknames.name ELSE NULL END,
      towns.name,
      3,  -- tier 3
      archetypes.name,
      40 + (random() * 25)::int,  -- skill 40-65 for tier 3 (higher than tier 2)
      (random() * 1000000)::int
    FROM 
      -- Much more diverse first names
      (VALUES 
        ('Aaron'),('Abdul'),('Adrian'),('Alan'),('Albert'),('Alex'),('Andrew'),('Anthony'),('Arthur'),('Barry'),
        ('Ben'),('Billy'),('Bob'),('Brandon'),('Brian'),('Bruce'),('Carl'),('Charlie'),('Chris'),('Colin'),
        ('Craig'),('Dale'),('Dan'),('Danny'),('Dave'),('Dean'),('Derek'),('Eddie'),('Frank'),('Gary'),
        ('George'),('Glen'),('Gordon'),('Grant'),('Greg'),('Harry'),('Ian'),('Jack'),('James'),('Jason'),
        ('Jeff'),('Jerry'),('Jim'),('Joe'),('John'),('Keith'),('Ken'),('Kevin'),('Lee'),('Luke'),
        ('Malcolm'),('Mark'),('Martin'),('Matt'),('Michael'),('Mick'),('Nathan'),('Neil'),('Nick'),('Nigel'),
        ('Paul'),('Pete'),('Phil'),('Ray'),('Richard'),('Rob'),('Roger'),('Ryan'),('Sam'),('Scott'),
        ('Sean'),('Simon'),('Steve'),('Stuart'),('Terry'),('Tim'),('Tom'),('Tony'),('Wayne'),('Will')
      ) AS first_names(name),
      -- Varied British surnames  
      (VALUES 
        ('Adams'),('Anderson'),('Bailey'),('Baker'),('Barnes'),('Bell'),('Bennett'),('Brown'),('Butler'),('Campbell'),
        ('Carter'),('Chapman'),('Clark'),('Clarke'),('Cole'),('Collins'),('Cook'),('Cooper'),('Cox'),('Davies'),
        ('Davis'),('Edwards'),('Evans'),('Fisher'),('Fletcher'),('Foster'),('Fox'),('Gibson'),('Green'),('Griffiths'),
        ('Hall'),('Harris'),('Harrison'),('Hill'),('Holmes'),('Hughes'),('Jackson'),('James'),('Johnson'),('Jones'),
        ('Kelly'),('King'),('Knight'),('Lewis'),('Marshall'),('Martin'),('Mason'),('Miller'),('Mitchell'),('Moore'),
        ('Morgan'),('Morris'),('Murphy'),('Parker'),('Patel'),('Phillips'),('Powell'),('Price'),('Richards'),('Richardson'),
        ('Roberts'),('Robinson'),('Rogers'),('Scott'),('Shaw'),('Simpson'),('Smith'),('Stevens'),('Stewart'),('Stone'),
        ('Taylor'),('Thomas'),('Thompson'),('Turner'),('Walker'),('Ward'),('Watson'),('White'),('Williams'),('Wilson'),
        ('Wood'),('Wright'),('Young')
      ) AS last_names(name),
      -- County-level nicknames (more prestigious than pub level)
      (VALUES 
        ('The Hammer'),('Bullseye'),('The Machine'),('Lightning'),('The Rock'),('Precision'),('The Sniper'),('Triple Crown'),
        ('The County King'),('Tungsten'),('The Professor'),('Double Top'),('The Cannon'),('Clutch'),('The Arrow'),
        ('Checkout Charlie'),('The Finisher'),('Maximum'),('The Tungsten Terror'),('Steady Eddie'),('The Calculator'),
        ('Triple Twenty'),('The Dartboard Demon'),('County Champion'),('The Surgeon'),('Boom Boom'),('The Iceman'),
        ('Fast Eddie'),('The Wizard'),('County Crusher'),('The Ace'),('Darting Dan'),('The Missile'),('Sharp Shooter')
      ) AS nicknames(name),
      -- County towns and areas (more prestigious than generic pub towns)
      (VALUES 
        ('Ashford'),('Barnsley'),('Basingstoke'),('Bedford'),('Blackpool'),('Bolton'),('Bournemouth'),('Bracknell'),
        ('Bradford'),('Bridgwater'),('Brighton'),('Bristol'),('Burnley'),('Bury'),('Cambridge'),('Canterbury'),
        ('Carlisle'),('Chelmsford'),('Chester'),('Chesterfield'),('Colchester'),('Coventry'),('Crewe'),('Derby'),
        ('Doncaster'),('Dover'),('Dudley'),('Durham'),('Eastbourne'),('Exeter'),('Gloucester'),('Grimsby'),
        ('Guildford'),('Halifax'),('Harrogate'),('Hastings'),('Hereford'),('Huddersfield'),('Hull'),('Ipswich'),
        ('Lancaster'),('Leicester'),('Lincoln'),('Luton'),('Maidstone'),('Middlesbrough'),('Milton Keynes'),('Newcastle'),
        ('Northampton'),('Norwich'),('Nottingham'),('Oldham'),('Oxford'),('Peterborough'),('Plymouth'),('Portsmouth'),
        ('Preston'),('Reading'),('Rochdale'),('Rotherham'),('Salford'),('Sheffield'),('Shrewsbury'),('Southampton'),
        ('Southend'),('St Albans'),('Stockport'),('Stoke'),('Sunderland'),('Swansea'),('Swindon'),('Taunton'),
        ('Telford'),('Wakefield'),('Warrington'),('Watford'),('Wigan'),('Winchester'),('Wolverhampton'),('Worcester'),
        ('Worthing'),('York')
      ) AS towns(name),
      (VALUES ('scorer'),('finisher'),('grinder'),('streaky'),('clutch'),('allrounder')) AS archetypes(name)
    ORDER BY random()
    LIMIT 1;
  END LOOP;
  
  -- Initialize league table for the new season
  -- Player row
  INSERT INTO career_league_standings (
    career_id,
    season,
    tier,
    is_player,
    played,
    won,
    lost,
    legs_for,
    legs_against,
    points,
    average
  ) VALUES (
    p_career_id,
    v_career.season,
    3,
    TRUE,
    0, 0, 0, 0, 0, 0, 0.0
  );
  
  -- Opponent rows
  INSERT INTO career_league_standings (
    career_id,
    season,
    tier,
    opponent_id,
    is_player,
    played,
    won,
    lost,
    legs_for,
    legs_against,
    points,
    average
  )
  SELECT 
    p_career_id,
    v_career.season,
    3,
    id,
    FALSE,
    0, 0, 0, 0, 0, 0, skill_rating
  FROM career_opponents
  WHERE career_id = p_career_id AND tier = 3;
  
  RETURN json_build_object(
    'success', true,
    'total_opponents', v_existing_opponents + v_opponents_needed,
    'new_opponents_created', v_opponents_needed,
    'league_size', 10,
    'message', 'Tier 3 league generated with 10 players total'
  );
END;
$$;