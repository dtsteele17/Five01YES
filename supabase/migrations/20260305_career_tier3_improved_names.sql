-- ============================================================
-- Career Tier 3 - Improved Naming System  
-- Updates opponent generation with diverse, realistic names
-- ============================================================

-- RPC: Generate diverse tier 3 opponents with realistic names
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
      -- Diverse County-level first names
      (VALUES 
        ('Aaron'),('Abdul'),('Adrian'),('Alan'),('Albert'),('Alex'),('Andrew'),('Anthony'),('Arthur'),('Barry'),
        ('Ben'),('Billy'),('Bob'),('Brandon'),('Brian'),('Bruce'),('Carl'),('Charlie'),('Chris'),('Colin'),
        ('Craig'),('Dale'),('Dan'),('Danny'),('Dave'),('Dean'),('Derek'),('Eddie'),('Frank'),('Gary'),
        ('George'),('Glen'),('Gordon'),('Grant'),('Greg'),('Harry'),('Ian'),('Jack'),('James'),('Jason'),
        ('Jeff'),('Jerry'),('Jim'),('Joe'),('John'),('Keith'),('Ken'),('Kevin'),('Lee'),('Luke'),
        ('Malcolm'),('Mark'),('Martin'),('Matt'),('Michael'),('Mick'),('Nathan'),('Neil'),('Nick'),('Nigel'),
        ('Paul'),('Pete'),('Phil'),('Ray'),('Richard'),('Rob'),('Roger'),('Ryan'),('Sam'),('Scott'),
        ('Sean'),('Simon'),('Steve'),('Stuart'),('Terry'),('Tim'),('Tom'),('Tony'),('Wayne'),('Will'),
        ('Liam'),('Connor'),('Jamie'),('Lewis'),('Kyle'),('Jake'),('Josh'),('Ethan'),('Adam'),('Callum'),
        ('Oliver'),('Mason'),('Tyler'),('Dylan'),('Jordan'),('Logan'),('Rhys'),('Owen'),('Harvey'),('Noah')
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
        ('Wood'),('Wright'),('Young'),('MacDonald'),('McKenzie'),('O''Brien'),('O''Connor'),('Singh'),('Shah'),('Ahmed'),
        ('Ali'),('Khan'),('Patel'),('Sharma'),('Williams'),('Brown'),('Davis'),('Miller'),('Anderson'),('Taylor')
      ) AS last_names(name),
      
      -- County-level nicknames (more prestigious than pub level)
      (VALUES 
        ('The Hammer'),('Bullseye'),('The Machine'),('Lightning'),('The Rock'),('Precision'),('The Sniper'),('Triple Crown'),
        ('The County King'),('Tungsten'),('The Professor'),('Double Top'),('The Cannon'),('Clutch'),('The Arrow'),
        ('Checkout Charlie'),('The Finisher'),('Maximum'),('The Tungsten Terror'),('Steady Eddie'),('The Calculator'),
        ('Triple Twenty'),('The Dartboard Demon'),('County Champion'),('The Surgeon'),('Boom Boom'),('The Iceman'),
        ('Fast Eddie'),('The Wizard'),('County Crusher'),('The Ace'),('Darting Dan'),('The Missile'),('Sharp Shooter'),
        ('The Destroyer'),('Laser'),('The Technician'),('Big Gun'),('The Sheriff'),('Venom'),('The Predator'),('Thunderbolt'),
        ('The Gladiator'),('Diamond'),('The Enforcer'),('Storm'),('The Phantom'),('Razor'),('The Viper'),('Cyclone'),
        ('The Matador'),('Tornado'),('The Warrior'),('Blaze'),('The Guardian'),('Fury'),('The Champion'),('Lightning Strike')
      ) AS nicknames(name),
      
      -- County towns and cities (proper English geography)
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
        ('Worthing'),('York'),('Blackburn'),('Cheshire'),('Kent'),('Lancashire'),('Yorkshire'),('Cornwall'),('Essex')
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
  ) ON CONFLICT DO NOTHING;
  
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
  WHERE career_id = p_career_id 
    AND tier = 3
  ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'total_opponents', v_existing_opponents + v_opponents_needed,
    'new_opponents_created', v_opponents_needed,
    'league_size', 10,
    'message', 'Tier 3 league generated with 10 players total'
  );
END;
$$;

-- RPC: Improved Tier 2 opponent generation for relegation system
CREATE OR REPLACE FUNCTION rpc_career_generate_tier2_opponents(
  p_career_id UUID,
  p_count INTEGER DEFAULT 4
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_i INTEGER;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  FOR v_i IN 1..p_count LOOP
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
      CASE WHEN random() < 0.25 THEN nicknames.name ELSE NULL END,
      towns.name,
      2,  -- tier 2
      archetypes.name,
      30 + (random() * 20)::int,  -- skill 30-50 for tier 2
      (random() * 1000000)::int
    FROM 
      -- Pub-level first names (more casual/working class feel)
      (VALUES 
        ('Alfie'),('Andy'),('Barry'),('Bazza'),('Ben'),('Billy'),('Bob'),('Bobby'),('Charlie'),('Chucky'),
        ('Colin'),('Craig'),('Dale'),('Dan'),('Danny'),('Dave'),('Davey'),('Dean'),('Derek'),('Eddie'),
        ('Frank'),('Frankie'),('Gary'),('Gaz'),('George'),('Glen'),('Gordon'),('Harry'),('Ian'),('Jack'),
        ('Jamie'),('Jason'),('Jez'),('Jim'),('Jimmy'),('Joe'),('Joey'),('John'),('Johnnie'),('Keith'),
        ('Ken'),('Kenny'),('Kevin'),('Kev'),('Lee'),('Lenny'),('Mick'),('Mickey'),('Mike'),('Mikey'),
        ('Neil'),('Nick'),('Nige'),('Nigel'),('Paul'),('Paulie'),('Pete'),('Phil'),('Ray'),('Reg'),
        ('Rich'),('Rick'),('Rob'),('Robbie'),('Roger'),('Ron'),('Ronnie'),('Sam'),('Scott'),('Scotty'),
        ('Sean'),('Si'),('Simon'),('Steve'),('Stevie'),('Stu'),('Stuart'),('Terry'),('Tel'),('Tim'),
        ('Timmy'),('Tony'),('Trevor'),('Trev'),('Wayne'),('Tez'),('Daz'),('Liam'),('Connor'),('Kyle')
      ) AS first_names(name),
      
      -- Common British surnames
      (VALUES 
        ('Adams'),('Allen'),('Andrews'),('Bailey'),('Baker'),('Barnes'),('Bell'),('Bennett'),('Brown'),('Butler'),
        ('Carter'),('Chapman'),('Clark'),('Clarke'),('Collins'),('Cook'),('Cooper'),('Cox'),('Davies'),('Davis'),
        ('Edwards'),('Evans'),('Fisher'),('Fletcher'),('Foster'),('Gibson'),('Green'),('Griffiths'),('Hall'),('Harris'),
        ('Harrison'),('Hill'),('Holmes'),('Hughes'),('Jackson'),('James'),('Johnson'),('Jones'),('Kelly'),('King'),
        ('Knight'),('Lewis'),('Marshall'),('Martin'),('Mason'),('Miller'),('Mitchell'),('Moore'),('Morgan'),('Morris'),
        ('Murphy'),('Parker'),('Phillips'),('Powell'),('Price'),('Richards'),('Richardson'),('Roberts'),('Robinson'),
        ('Rogers'),('Scott'),('Shaw'),('Simpson'),('Smith'),('Stevens'),('Stewart'),('Taylor'),('Thomas'),('Thompson'),
        ('Turner'),('Walker'),('Ward'),('Watson'),('White'),('Williams'),('Wilson'),('Wood'),('Wright'),('Young')
      ) AS last_names(name),
      
      -- Pub-level nicknames (more basic but authentic)
      (VALUES 
        ('Big Dave'),('Bullseye'),('The Hammer'),('Lightning'),('The Rock'),('Ace'),('Steady'),('The Finisher'),
        ('Sharp Shooter'),('Dead Eye'),('The Machine'),('Thunder'),('The Tank'),('Boom Boom'),('Fast Eddie'),
        ('The Bull'),('Treble Top'),('Double Trouble'),('The Arrow'),('Rocket'),('The Dart Knight'),
        ('Checkout Charlie'),('Maximum Mike'),('Triple Twenty'),('The Pub Champion'),('Dartboard Dave'),
        ('The Legend'),('Top Gun'),('Deadly'),('The Fox'),('Smooth'),('The General'),('Fireball'),('The Boss')
      ) AS nicknames(name),
      
      -- Smaller towns and local areas (pub circuit level)
      (VALUES 
        ('Barnsley'),('Blackpool'),('Bolton'),('Burnley'),('Bury'),('Chesterfield'),('Doncaster'),('Grimsby'),
        ('Halifax'),('Huddersfield'),('Hull'),('Luton'),('Middlesbrough'),('Oldham'),('Rochdale'),('Rotherham'),
        ('Salford'),('Stockport'),('Stoke'),('Sunderland'),('Wigan'),('Wolverhampton'),('Aston'),('Bermondsey'),
        ('Bethnal Green'),('Brixton'),('Camden'),('Croydon'),('Dagenham'),('East Ham'),('Enfield'),('Hackney'),
        ('Hammersmith'),('Islington'),('Lewisham'),('Newham'),('Peckham'),('Romford'),('Tottenham'),('Walthamstow'),
        ('West Ham'),('Whitechapel'),('Woolwich'),('Acton'),('Barking'),('Bexley'),('Bromley'),('Ealing'),
        ('Greenwich'),('Harrow'),('Hillingdon'),('Hounslow'),('Kingston'),('Merton'),('Redbridge'),('Richmond'),
        ('Sutton'),('Wandsworth'),('Catford'),('Elephant and Castle'),('Kings Cross'),('Mile End'),('Old Kent Road')
      ) AS towns(name),
      
      (VALUES ('scorer'),('finisher'),('grinder'),('streaky'),('clutch'),('allrounder')) AS archetypes(name)
    ORDER BY random()
    LIMIT 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'opponents_created', p_count,
    'message', 'Tier 2 opponents generated successfully'
  );
END;
$$;