-- ============================================================
-- Fix tournament choice: drop ALL overloads, create clean version
-- ============================================================

-- Drop all possible overloads
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'rpc_career_tournament_choice'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END;
$$;

-- Also drop the options function
DROP FUNCTION IF EXISTS rpc_get_tournament_choice_options(UUID);

-- Recreate tournament choice options (deterministic based on event ID)
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
  v_hash1 := abs(hashtext(p_event_id::text || '1'));
  v_hash2 := abs(hashtext(p_event_id::text || '2'));
  
  v_name1 := v_names[1 + (v_hash1 % array_length(v_names, 1))];
  v_name2 := v_names[1 + (v_hash2 % array_length(v_names, 1))];
  IF v_name1 = v_name2 THEN
    v_name2 := v_names[1 + ((v_hash2 + 1) % array_length(v_names, 1))];
  END IF;
  
  -- 16 or 32 players for County Circuit+
  v_size1 := CASE WHEN v_hash1 % 2 = 0 THEN 16 ELSE 32 END;
  v_size2 := CASE WHEN v_hash2 % 2 = 0 THEN 32 ELSE 16 END;
  
  RETURN json_build_object(
    'option1', json_build_object('name', v_name1, 'bracket_size', v_size1, 'format', 'Best of 3'),
    'option2', json_build_object('name', v_name2, 'bracket_size', v_size2, 'format', 'Best of 3')
  );
END;
$$;

-- Recreate tournament choice function (accepts integer, not smallint for JS compat)
CREATE OR REPLACE FUNCTION rpc_career_tournament_choice(
  p_career_id UUID,
  p_event_id UUID,
  p_tournament_choice INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_bracket_size INTEGER;
  v_tournament_name TEXT;
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
  
  -- Find the event — check both tournament_choice type AND status
  SELECT * INTO v_event FROM career_events 
  WHERE id = p_event_id AND career_id = p_career_id 
    AND (event_type = 'tournament_choice' OR status = 'tournament_choice')
    AND status NOT IN ('completed', 'skipped');
  IF NOT FOUND THEN 
    RETURN json_build_object('error', 'Tournament choice not found (event_id: ' || p_event_id || ')'); 
  END IF;

  IF p_tournament_choice = 0 THEN
    UPDATE career_events SET status = 'skipped' WHERE id = p_event_id;
    RETURN json_build_object('success', true, 'skipped', true, 'message', 'Carrying on with the league.');
  END IF;

  -- Generate tournament name and size deterministically from event ID + choice
  v_tournament_name := v_names[1 + ((abs(hashtext(v_event.id::text || p_tournament_choice::text)) % array_length(v_names, 1)) + array_length(v_names, 1)) % array_length(v_names, 1)];
  v_bracket_size := CASE WHEN abs(hashtext(v_event.id::text || p_tournament_choice::text)) % 2 = 0 THEN 16 ELSE 32 END;

  -- Convert the choice event into a real tournament
  UPDATE career_events SET 
    event_type = 'open',
    event_name = v_tournament_name,
    format_legs = CASE WHEN v_career.tier >= 3 THEN 5 ELSE 3 END,
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

GRANT EXECUTE ON FUNCTION rpc_career_tournament_choice(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_tournament_choice_options(UUID) TO authenticated;
