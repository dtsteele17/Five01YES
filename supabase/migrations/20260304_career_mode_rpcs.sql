-- ============================================================
-- FIVE01 Career Mode — RPCs
-- ============================================================

-- 1) Create a new career profile
CREATE OR REPLACE FUNCTION rpc_create_career_profile(
  p_difficulty TEXT,
  p_save_slot SMALLINT DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_seed BIGINT;
  v_career_id UUID;
  v_existing UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Check for existing active save in this slot
  SELECT id INTO v_existing FROM career_profiles
    WHERE user_id = v_user_id AND save_slot = p_save_slot AND status = 'active';
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('error', 'Save slot already in use. Abandon the existing career first.');
  END IF;

  -- Delete any abandoned/completed careers in this slot to free the unique constraint
  DELETE FROM career_profiles
    WHERE user_id = v_user_id AND save_slot = p_save_slot AND status IN ('abandoned', 'completed');

  -- Generate deterministic seed
  v_seed := floor(random() * 9999999999)::BIGINT;

  -- Create career profile
  INSERT INTO career_profiles (user_id, save_slot, career_seed, difficulty, tier, season, week, day)
  VALUES (v_user_id, p_save_slot, v_seed, p_difficulty, 1, 1, 0, 1)
  RETURNING id INTO v_career_id;

  -- Seed Tier 1 events from templates with day assignments
  -- Tier 1: Day 1 = first tournament, Day 4 = second, Day 8 = third (tournaments played same day for all rounds)
  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
  SELECT v_career_id, t.id, 1, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
    CASE t.sequence_no WHEN 1 THEN 1 WHEN 2 THEN 4 WHEN 3 THEN 8 ELSE t.sequence_no END
  FROM career_schedule_templates t
  WHERE t.tier = 1
  ORDER BY t.sequence_no;

  -- Generate Tier 1 opponents (24 total: 3 tournaments × 8 players, but 7 opponents each + player)
  -- We'll generate 21 unique opponents for Tier 1
  PERFORM rpc_generate_career_opponents(v_career_id, 1::SMALLINT, 21, v_seed);

  -- Create milestone: career started
  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
  VALUES (v_career_id, 'career_started', 'The Journey Begins', 'Started a new career on ' || p_difficulty || ' difficulty.', 1, 1, 0, 1);

  RETURN json_build_object(
    'success', TRUE,
    'career_id', v_career_id,
    'seed', v_seed,
    'difficulty', p_difficulty,
    'tier', 1,
    'save_slot', p_save_slot
  );
END;
$$;

-- 2) Generate opponents for a tier (helper)
CREATE OR REPLACE FUNCTION rpc_generate_career_opponents(
  p_career_id UUID,
  p_tier SMALLINT,
  p_count INT,
  p_seed BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_names TEXT[] := ARRAY[
    'Dave','Mike','Steve','Chris','Andy','Rob','Tom','Phil','Mark','James',
    'Gary','Paul','Kev','Dan','Lee','Terry','Wayne','Craig','Neil','Barry',
    'Ian','Josh','Stu','Mick','Pete','Carl','Jack','Alex','Bob','Jim',
    'Ted','Gabe','Michael','Jordan','Elliott','Ben','Sam','Luke','Ryan','Adam',
    'Nathan','Connor','Kyle','Liam','Jake','Owen','Rhys','Calum','Darren','Shaun',
    'Gavin','Tony','Richie','Frankie','Jordan','Paddy','Declan','Sean','Niall','Brendan',
    'Kyran','Claire','Lisa','Amy','Zoe','Phil','Sarah','Emma','Laura','Ellis',
    'Anson','Holly','Becky','Nicola','Gemma','Hans','Rachel','Harry','Kai','Tina',
    'Simon','George','Will','Harry','Freddie','Charlie','Alfie','Oscar','Archie','Leo',
    'Ricky','Matty','Scotty','Eddie','John','Woody','Macca','Jacko','Matt','Alex',
    'Patrick','Luca','Marco','Antonio','Pierre','Jean','Klaus','Sven','Erik','Finn',
    'Ruben','Hugo','Lars','Theo','Max','Felix','Nico','Fabio','Carlos','Miguel'
  ];
  v_last_names TEXT[] := ARRAY[
    'Smith','Jones','Taylor','Brown','Wilson','Evans','Thomas','Roberts','Johnson','Walker',
    'Wright','Thompson','White','Hall','Clarke','Jackson','Green','Harris','Wood','King',
    'Baker','Turner','Hill','Scott','Moore','Cooper','Ward','Wells','Lee','Murphy',
    'Price','Bennett','Gray','Cox','Mills','Palmer','Mason','Hunt','Holmes','Webb',
    'Steele','Noble','Fletcher','Spencer','Powell','Dixon','Chapman','Ellis','Shaw','Hughes',
    'Barker','Rhodes','Brooks','Watts','Harvey','Mitchell','Barnes','Sullivan','Griffin','Cole',
    'Reeves','Marshall','Pearce','Burton','Knight','Bailey','Fox','Russell','Doyle','Lynch',
    'Gallagher','Fischer','Brennan','Walsh','Davies','Collins','Maguire','Doherty','Keane','Ryan',
    'Maier','Wagner','Schmidt','Fischer','Weber','Becker','Richter','Braun','Hofmann','Krause',
    'Van Ginkel','Peeters','De Vries','Jansen','Bakker','Visser','Watson','De Boer','Mulder','Doyle',
    'Rossi','Russo','Merz','Bianchi','Romano','Colombo','Ricci','Marino','Lat','Bruno',
    'Von Hoofin','Fernandez','Garcia','Martinez','Lopez','Van Den Berg','Ruiz','Sanchez','Romero','Diaz'
  ];
  v_nicknames TEXT[] := ARRAY[
    'The Hammer','Bullseye','Treble Top','The Machine','Steady Eddie','The Rocket',
    'Double Top','The Arrow','Lightning','The Sniper','Old Reliable',
    'The Finisher','Triple Threat','The Assassin','Deadeye','The Silencer','Hot Shot',
    'The Professor','Iceman','The Natural','The Viking','Powerhouse','The Wizard','The Dream',
    'The Menace','Killer','The Phoenix','Fireball','The Cobra','Dynamite','Nitro',
    'The Tornado','Rapid','The Chief','Big Dog','The Flash','Laser','Tombstone',
    'The General','Skill Magill','Jackpot','Wolfie','Chopper','The Dagger','Maverick','Nino',
    'The Thorn','Iron Fist','Showtime','The Ace','Voltage','Sidewinder','Merlin',
    'Smooth','Pitbull','Sparky','Thunder','Phantom','The Hawk','Crosshair','Apex',
    'The Beast','Precision','Hard Man','The Bosh','Razor','The Rocket',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,  -- ~33% chance of no nickname
  ];
  v_hometowns TEXT[] := ARRAY[
    'Steelford','Oche Vale','Dartington','Bullswick','Tapleys Green',
    'Arrowbridge','Fletcham','Tungsten Hill','Trebleworth','Doublegate',
    'Ironside','Copperwell','Bronzebury','Silverton','Goldhaven',
    'Pointsford','Scoreton','Finishby','Setupham','Checkoutvale',
    'Blackpool','Preston','Stoke','Wolverhampton','Barnsley',
    'Grimsby','Halifax','Wigan','Doncaster','Rotherham',
    'Sunderland','Middlesbrough','Hartlepool','Scunthorpe','Wakefield'
  ];
  v_archetypes TEXT[] := ARRAY['scorer','finisher','grinder','streaky','clutch','allrounder'];
  v_skill_base REAL;
  v_skill REAL;
  v_is_rival BOOLEAN;
  i INT;
  v_fi INT;
  v_li INT;
  v_ni INT;
  v_hi INT;
  v_ai INT;
  v_local_seed BIGINT;
BEGIN
  -- Skill ranges by tier
  v_skill_base := CASE p_tier
    WHEN 1 THEN 25.0
    WHEN 2 THEN 35.0
    WHEN 3 THEN 50.0
    WHEN 4 THEN 65.0
    WHEN 5 THEN 80.0
    ELSE 30.0
  END;

  FOR i IN 1..p_count LOOP
    v_local_seed := p_seed + (p_tier * 1000) + i;
    -- Use modular arithmetic to avoid bigint overflow; different offsets per field
    v_fi := (abs((v_local_seed * 31 + 7) % 99991) % array_length(v_first_names, 1)) + 1;
    v_li := (abs((v_local_seed * 97 + 13) % 99989) % array_length(v_last_names, 1)) + 1;
    v_ni := (abs((v_local_seed * 53 + 29) % 99971) % array_length(v_nicknames, 1)) + 1;
    v_hi := (abs((v_local_seed * 71 + 43) % 99961) % array_length(v_hometowns, 1)) + 1;
    v_ai := (abs((v_local_seed * 41 + 59) % 99949) % array_length(v_archetypes, 1)) + 1;

    -- Skill: base ± 15 range
    v_skill := v_skill_base + ((v_local_seed % 30) - 15)::REAL;
    v_skill := GREATEST(10.0, LEAST(95.0, v_skill));

    -- First 2 opponents per tier are rivals
    v_is_rival := (i <= 2);

    INSERT INTO career_opponents (career_id, first_name, last_name, nickname, hometown, tier, archetype, skill_rating, is_rival, avatar_seed)
    VALUES (
      p_career_id,
      v_first_names[v_fi],
      v_last_names[v_li],
      v_nicknames[v_ni],
      v_hometowns[v_hi],
      p_tier,
      v_archetypes[v_ai],
      v_skill,
      v_is_rival,
      (v_local_seed % 999999)::INT
    );
  END LOOP;
END;
$$;

-- 3) Get career home (next event + state)
CREATE OR REPLACE FUNCTION rpc_get_career_home(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_next_event career_events;
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsor JSON;
  v_milestones JSON;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next event: prioritize active (resume in-progress bracket), then pending
  SELECT * INTO v_next_event FROM career_events
    WHERE career_id = p_career_id AND status = 'active'
    ORDER BY sequence_no ASC
    LIMIT 1;
  IF v_next_event.id IS NULL THEN
    SELECT * INTO v_next_event FROM career_events
      WHERE career_id = p_career_id AND status = 'pending'
      ORDER BY sequence_no ASC
      LIMIT 1;
  END IF;

  -- For league events: find next opponent from standings
  IF v_next_event.id IS NOT NULL AND v_next_event.event_type = 'league' THEN
    SELECT co.* INTO v_opponent FROM career_league_standings ls
    JOIN career_opponents co ON co.id = ls.opponent_id
    WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
      AND ls.is_player = FALSE
      AND ls.opponent_id NOT IN (
        SELECT cm.opponent_id FROM career_matches cm
        JOIN career_events ce ON ce.id = cm.event_id
        WHERE cm.career_id = p_career_id AND ce.event_type = 'league' AND ce.season = v_career.season
      )
    ORDER BY random()
    LIMIT 1;
    -- Fallback
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;

  -- Get recent milestones
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones WHERE career_id = p_career_id
    ORDER BY created_at DESC LIMIT 5
  ) m;

  -- Get active sponsor
  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  -- Get league standings if tier >= 2
  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT
        ls.is_player,
        CASE WHEN ls.is_player THEN 'You' ELSE (SELECT o.first_name || ' ' || o.last_name FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average
      FROM career_league_standings ls
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  RETURN json_build_object(
    'career', json_build_object(
      'id', v_career.id,
      'tier', v_career.tier,
      'season', v_career.season,
      'week', v_career.week,
      'day', v_career.day,
      'rep', v_career.rep,
      'form', v_career.form,
      'difficulty', v_career.difficulty,
      'premier_league_active', v_career.premier_league_active
    ),
    'next_event', CASE WHEN v_next_event.id IS NOT NULL THEN json_build_object(
      'id', v_next_event.id,
      'event_type', v_next_event.event_type,
      'event_name', v_next_event.event_name,
      'format_legs', v_next_event.format_legs,
      'bracket_size', v_next_event.bracket_size,
      'sequence_no', v_next_event.sequence_no,
      'day', v_next_event.day,
      'league_opponent_name', CASE WHEN v_opponent.id IS NOT NULL THEN
        COALESCE(v_opponent.first_name || ' ', '') ||
        CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
        COALESCE(v_opponent.last_name, '')
      ELSE NULL END,
      'league_opponent_id', v_opponent.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones
  );
END;
$$;

-- 4) Abandon a career save (soft delete)
CREATE OR REPLACE FUNCTION rpc_abandon_career(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  UPDATE career_profiles
  SET status = 'abandoned', updated_at = now()
  WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found or already abandoned');
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

-- 5) Get user's career saves
CREATE OR REPLACE FUNCTION rpc_get_career_saves()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_saves JSON;
BEGIN
  SELECT json_agg(row_to_json(s) ORDER BY s.save_slot) INTO v_saves
  FROM (
    SELECT id, save_slot, difficulty, tier, season, week, rep, status, created_at, updated_at
    FROM career_profiles
    WHERE user_id = v_user_id AND status IN ('active', 'completed')
  ) s;

  RETURN json_build_object('saves', COALESCE(v_saves, '[]'::json));
END;
$$;
