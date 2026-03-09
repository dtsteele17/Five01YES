-- ============================================================
-- Fix tournament choice system for County Circuit (Tier 3+)
-- After every 3 league games: popup with 2 random tournaments + skip
-- ============================================================

-- Simplified tournament choice RPC that generates random options
CREATE OR REPLACE FUNCTION rpc_career_tournament_choice(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_choice SMALLINT  -- 1 or 2 for tournament, 0 to skip
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_bracket_size SMALLINT;
  v_tournament_name TEXT;
  v_tournament_id UUID;
  v_names TEXT[] := ARRAY[
    'The County Shield', 'The Regional Open', 'The Championship Trophy',
    'The Silver Arrows Cup', 'The Iron Bull Classic', 'The Diamond Darts Open',
    'The Phoenix Trophy', 'The Midnight Stakes', 'The Crown & Anchor Cup',
    'The Platinum Oche', 'The Thunderbolt Open', 'The Golden Arrow Trophy',
    'The Dragon''s Lair Cup', 'The Celtic Classic', 'The Northern Masters',
    'The Southern Showdown', 'The Midlands Open', 'The Cross Keys Trophy',
    'The Red Lion Invitational', 'The Black Horse Classic'
  ];
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  
  SELECT * INTO v_event FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id AND event_type = 'tournament_choice';
  IF NOT FOUND THEN RETURN json_build_object('error', 'Tournament choice not found'); END IF;

  IF p_tournament_choice = 0 THEN
    -- Skip tournament
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object('success', true, 'skipped', true, 'message', 'Carrying on with the league.');
  END IF;

  -- Generate random tournament based on choice seed
  v_bracket_size := CASE WHEN (p_tournament_choice + floor(random() * 10)::int) % 2 = 0 THEN 16 ELSE 32 END;
  v_tournament_name := v_names[1 + ((hashtext(v_event.id::text || p_tournament_choice::text) % array_length(v_names, 1)) + array_length(v_names, 1)) % array_length(v_names, 1)];

  -- Convert the choice event into a real tournament
  UPDATE career_events SET 
    event_type = 'open',
    event_name = v_tournament_name,
    format_legs = 3,  -- BO3 (BO5 final handled in match launch)
    bracket_size = v_bracket_size,
    status = 'pending'
  WHERE id = p_event_id;

  RETURN json_build_object(
    'success', true,
    'tournament_name', v_tournament_name,
    'bracket_size', v_bracket_size,
    'message', 'Entered ' || v_tournament_name || '! Good luck!'
  );
END;
$$;

-- Also create a function to get the 2 tournament options for display
CREATE OR REPLACE FUNCTION rpc_get_tournament_choice_options(p_event_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_names TEXT[] := ARRAY[
    'The County Shield', 'The Regional Open', 'The Championship Trophy',
    'The Silver Arrows Cup', 'The Iron Bull Classic', 'The Diamond Darts Open',
    'The Phoenix Trophy', 'The Midnight Stakes', 'The Crown & Anchor Cup',
    'The Platinum Oche', 'The Thunderbolt Open', 'The Golden Arrow Trophy',
    'The Dragon''s Lair Cup', 'The Celtic Classic', 'The Northern Masters',
    'The Southern Showdown', 'The Midlands Open', 'The Cross Keys Trophy',
    'The Red Lion Invitational', 'The Black Horse Classic'
  ];
  v_name1 TEXT;
  v_name2 TEXT;
  v_size1 SMALLINT;
  v_size2 SMALLINT;
  v_hash1 INT;
  v_hash2 INT;
BEGIN
  -- Deterministic but random-looking based on event ID
  v_hash1 := abs(hashtext(p_event_id::text || '1'));
  v_hash2 := abs(hashtext(p_event_id::text || '2'));
  
  v_name1 := v_names[1 + (v_hash1 % array_length(v_names, 1))];
  v_name2 := v_names[1 + (v_hash2 % array_length(v_names, 1))];
  
  -- Ensure different names
  IF v_name1 = v_name2 THEN
    v_name2 := v_names[1 + ((v_hash2 + 1) % array_length(v_names, 1))];
  END IF;
  
  -- Random sizes (16 or 32 for County Circuit+)
  v_size1 := CASE WHEN v_hash1 % 2 = 0 THEN 16 ELSE 32 END;
  v_size2 := CASE WHEN v_hash2 % 2 = 0 THEN 32 ELSE 16 END;
  
  RETURN json_build_object(
    'option1', json_build_object('name', v_name1, 'bracket_size', v_size1, 'format', 'Best of 3'),
    'option2', json_build_object('name', v_name2, 'bracket_size', v_size2, 'format', 'Best of 3')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_tournament_choice(UUID, UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_tournament_choice_options(UUID) TO authenticated;
