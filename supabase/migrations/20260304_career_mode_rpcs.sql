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

  -- Check for existing save in this slot
  SELECT id INTO v_existing FROM career_profiles
    WHERE user_id = v_user_id AND save_slot = p_save_slot AND status = 'active';
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('error', 'Save slot already in use. Abandon the existing career first.');
  END IF;

  -- Generate deterministic seed
  v_seed := floor(random() * 9999999999)::BIGINT;

  -- Create career profile
  INSERT INTO career_profiles (user_id, save_slot, career_seed, difficulty, tier, season, week, day)
  VALUES (v_user_id, p_save_slot, v_seed, p_difficulty, 1, 1, 0, 1)
  RETURNING id INTO v_career_id;

  -- Seed Tier 1 events from templates
  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size)
  SELECT v_career_id, t.id, 1, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size
  FROM career_schedule_templates t
  WHERE t.tier = 1
  ORDER BY t.sequence_no;

  -- Generate Tier 1 opponents (24 total: 3 tournaments × 8 players, but 7 opponents each + player)
  -- We'll generate 21 unique opponents for Tier 1
  PERFORM rpc_generate_career_opponents(v_career_id, 1, 21, v_seed);

  -- Create milestone: career started
  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week)
  VALUES (v_career_id, 'career_started', 'The Journey Begins', 'Started a new career on ' || p_difficulty || ' difficulty.', 1, 1, 0);

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
    'Ian','Baz','Col','Stu','Mick','Nige','Pete','Ade','Carl','Gaz',
    'Daz','Trev','Kev','Wal','Bob','Reg','Jim','Ted','Vic','Ken',
    'Emma','Sarah','Lisa','Helen','Donna','Claire','Jess','Amy','Zoe','Kim'
  ];
  v_last_names TEXT[] := ARRAY[
    'Smith','Jones','Taylor','Brown','Wilson','Evans','Thomas','Roberts','Johnson','Walker',
    'Wright','Thompson','White','Hall','Clarke','Jackson','Green','Harris','Wood','King',
    'Baker','Turner','Hill','Scott','Moore','Cooper','Ward','Morris','Lee','Murphy',
    'Price','Bennett','Gray','Cox','Mills','Palmer','Mason','Hunt','Holmes','Webb'
  ];
  v_nicknames TEXT[] := ARRAY[
    'The Hammer','Bullseye','Treble Top','The Machine','Steady Eddie','The Rocket',
    'Double Top','The Arrow','Lightning','The Sniper','Dartboard Dave','Old Reliable',
    'The Finisher','Triple Threat','The Assassin','Deadeye','The Silencer','Hot Shot',
    'The Professor','Iceman','The Natural','The Viking','Powerhouse','The Wizard',
    NULL, NULL, NULL, NULL, NULL, NULL  -- 40% chance of no nickname
  ];
  v_hometowns TEXT[] := ARRAY[
    'Steelford','Oche Vale','Dartington','Bullswick','Tapleys Green',
    'Arrowbridge','Fletcham','Tungsten Hill','Trebleworth','Doublegate',
    'Ironside','Copperwell','Bronzebury','Silverton','Goldhaven',
    'Pointsford','Scoreton','Finishby','Setupham','Checkoutvale'
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
    v_fi := (v_local_seed % array_length(v_first_names, 1)) + 1;
    v_li := ((v_local_seed / 7) % array_length(v_last_names, 1)) + 1;
    v_ni := ((v_local_seed / 13) % array_length(v_nicknames, 1)) + 1;
    v_hi := ((v_local_seed / 19) % array_length(v_hometowns, 1)) + 1;
    v_ai := ((v_local_seed / 31) % array_length(v_archetypes, 1)) + 1;

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

  -- Get next pending event
  SELECT * INTO v_next_event FROM career_events
    WHERE career_id = p_career_id AND status = 'pending'
    ORDER BY sequence_no ASC
    LIMIT 1;

  -- Get recent milestones
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, created_at
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
      'sequence_no', v_next_event.sequence_no
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
