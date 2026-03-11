DROP FUNCTION IF EXISTS rpc_world_rankings_simulate(UUID);
CREATE OR REPLACE FUNCTION rpc_world_rankings_simulate(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_ai RECORD;
  v_change NUMERIC;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF NOT EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('no_rankings', true);
  END IF;

  IF v_career.tier >= 5 THEN
    RETURN json_build_object('skipped', true, 'reason', 'Pro Tour uses real award_points');
  END IF;

  FOR v_ai IN
    SELECT id, ranking_points, ranking_position
    FROM career_pro_rankings
    WHERE career_id = p_career_id AND is_player = FALSE
  LOOP
    v_change := floor(random() * 15)::int - 5;
    IF v_ai.ranking_position <= 5 THEN
      v_change := floor(random() * 8)::int - 2;
    ELSIF v_ai.ranking_position <= 15 THEN
      v_change := floor(random() * 12)::int - 4;
    ELSIF v_ai.ranking_position >= 80 THEN
      v_change := floor(random() * 20)::int - 8;
    END IF;

    UPDATE career_pro_rankings
    SET prev_points = ranking_points, ranking_points = GREATEST(5, ranking_points + v_change)
    WHERE id = v_ai.id;
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_world_rankings_simulate(UUID) TO authenticated;

DROP FUNCTION IF EXISTS rpc_pro_tour_init_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_init_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_i INT;
  v_points NUMERIC;
  v_names TEXT[];
  v_first_names TEXT[] := ARRAY[
    'Joel','Jasper','Felix','Ruben','Sven','Connor','Kal','Aidan','Roman','Ronan',
    'Kyle','Declan','Callum','Theo','Jake','Matty','Noel','Zach','Cillian','Ellis',
    'Hugo','Brendan','Liam','Oscar','Kai','Finn','Leon','Max','Owen','Tyler',
    'Bradley','Patrick','Dominic','Kieran','Marcus','Stefan','Lars','Kris','Marco','Fabio',
    'Klaus','Hans','Erik','Nils','Piotr','Tomas','Andrei','Viktor','Dmitri','Yuki',
    'Kenji','Raj','Arjun','Isaac','Gabriel','Rafael','Antonio','Pedro','Diego','Mateo',
    'Dan','Kyran','Josh','Ethan','Jordan','Matt','Harry','Chris','Gabe','Jacob',
    'Ollie','Freddie','George','Archie','Dylan','Logan','Charlie','Rory','Wayne','Craig',
    'Darren','Jason','Neil','Glen','Karl','Toby','Jack','Noah','Callum','Aiden',
    'Miguel','Carlos','Ali','Omar','Hamza','Vikram','Hugo','Felix','Soren','Axel'
  ];
  v_last_names TEXT[] := ARRAY[
    'Russell','Harvey','Holt','Cooper','Fletcher','Quinn','Murphy','Brennan','Gray','Visser',
    'Drake','Richter','Thorne','Hughes','Lawson','Reeves','Holmes','Hartley','Romano','Wells',
    'Langley','Jarvis','Conway','Steele','Hall','Maier','Baker','Hutchinson','Perry','Davies',
    'Smith','Jones','Brown','Wilson','Taylor','Clark','Lewis','Walker','Green','King',
    'Wright','Scott','Adams','Hill','Moore','Wood','Kelly','Evans','Cox','Webb',
    'Stone','Cole','Ford','Ross','Reed','Mills','West','Fox','Hayes','Day',
    'Hart','Long','Cross','Lane','Flynn','Nash','Burke','Walsh','Burns','Quinn',
    'Rhodes','Marshall','Hunter','Barker','Watson','Palmer','Ryan','Price','Bennett','Campbell',
    'Murray','Stewart','Crawford','Cameron','Davidson','Grant','Hamilton','Robertson','Thomson','Henderson',
    'Novak','Kowalski','Petrov','Mueller','Fischer','Weber','Schneider','Becker','Berg','Johansson'
  ];
  v_nicknames TEXT[] := ARRAY[
    'Big Dog','Voltage','The Phantom','Killer','Rapid','Razor','Crosshair','Lightning','Smooth','Stealth',
    'The Sniper','Sidewinder','The Gladiator','The General','Fireball','Apex','The Magician','Pitbull',
    'The Hammer','Ice','Bulletproof','The Ace','Dynamite','Ironside','The Flash','Viper','The Rock',
    'Blitz','Thunder','The Machine','Scorpion','Wildcard','The Wolf','Maverick','The Surgeon',
    'Skill Magill','The Dart','Hotshot','Cobra','The Natural','Laser','The Viking','Tornado',
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
    NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
  ];
  v_archetypes TEXT[] := ARRAY['Scorer','Grinder','Clutch','Scorer','Grinder','Clutch','Scorer','Grinder'];
  v_fn TEXT;
  v_ln TEXT;
  v_nn TEXT;
  v_full_name TEXT;
  v_used_names TEXT[] := ARRAY[]::TEXT[];
  v_attempts INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('already_initialized', true);
  END IF;

  FOR v_i IN 1..99 LOOP
    v_attempts := 0;
    LOOP
      v_fn := v_first_names[1 + floor(random() * array_length(v_first_names, 1))::int];
      v_ln := v_last_names[1 + floor(random() * array_length(v_last_names, 1))::int];
      v_full_name := v_fn || ' ' || v_ln;
      v_attempts := v_attempts + 1;
      EXIT WHEN NOT (v_full_name = ANY(v_used_names)) OR v_attempts > 200;
    END LOOP;
    v_used_names := array_append(v_used_names, v_full_name);

    v_nn := v_nicknames[1 + floor(random() * array_length(v_nicknames, 1))::int];
    IF v_nn IS NOT NULL THEN
      v_full_name := v_fn || ' ''' || v_nn || ''' ' || v_ln;
    END IF;

    IF v_i <= 3 THEN v_points := 450 + floor(random() * 100);
    ELSIF v_i <= 10 THEN v_points := 350 + floor(random() * 100);
    ELSIF v_i <= 25 THEN v_points := 250 + floor(random() * 100);
    ELSIF v_i <= 50 THEN v_points := 150 + floor(random() * 100);
    ELSIF v_i <= 75 THEN v_points := 80 + floor(random() * 70);
    ELSE v_points := 20 + floor(random() * 60);
    END IF;

    INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, ranking_position, expected_round)
    VALUES (p_career_id, v_full_name, FALSE, v_points, v_i,
      CASE WHEN v_i <= 10 THEN 'L16' WHEN v_i <= 25 THEN 'L32' WHEN v_i <= 60 THEN 'L64' ELSE NULL END);
  END LOOP;

  INSERT INTO career_pro_rankings (career_id, player_name, is_player, ranking_points, ranking_position)
  VALUES (p_career_id, 'You', TRUE, 15 + floor(random() * 20), 100);

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'players_created', 100);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_init_rankings(UUID) TO authenticated;
