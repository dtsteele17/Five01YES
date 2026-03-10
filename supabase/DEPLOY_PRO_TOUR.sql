-- ============================================================
-- PRO TOUR (Tier 5) — Tournament circuit + Global Rankings + Premier League
-- No league matches — pure tournament season
-- Top 100 rankings, show Top 21 + user position
-- Premier League for Top 10 (runs alongside)
-- Bottom 10 relegated to Regional Tour
-- ============================================================

-- ============================================
-- 0. Expand event type constraints for Pro Tour
-- ============================================
ALTER TABLE career_schedule_templates DROP CONSTRAINT IF EXISTS career_schedule_templates_event_type_check;
ALTER TABLE career_schedule_templates ADD CONSTRAINT career_schedule_templates_event_type_check
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament','season_end',
    'regional_tournament','regional_t3_qualification','regional_qual_match',
    'q_school_semi','q_school_final',
    'county_championship_group','county_championship_knockout',
    'pro_tour_players_championship','pro_tour_open','pro_tour_major',
    'pro_tour_major_qualification',
    'premier_league_match'
  ));

ALTER TABLE career_events DROP CONSTRAINT IF EXISTS career_events_event_type_check;
ALTER TABLE career_events ADD CONSTRAINT career_events_event_type_check
  CHECK (event_type IN (
    'league','open','qualifier','promotion','training','rest',
    'trial_tournament','premier_league_night','major','season_finals',
    'tournament_choice','relegation_tournament','season_end',
    'regional_tournament','regional_t3_qualification','regional_qual_match',
    'q_school_semi','q_school_final',
    'county_championship_group','county_championship_knockout',
    'pro_tour_players_championship','pro_tour_open','pro_tour_major',
    'pro_tour_major_qualification',
    'premier_league_match'
  ));

-- ============================================
-- 1. Global Rankings table
-- Top 100 AI players + user, with rating
-- ============================================
CREATE TABLE IF NOT EXISTS career_pro_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  opponent_id UUID REFERENCES career_opponents(id),
  is_player BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(10,2) NOT NULL DEFAULT 0,
  prev_rating NUMERIC(10,2) NOT NULL DEFAULT 0,
  season_rating NUMERIC(10,2) NOT NULL DEFAULT 0,  -- current season rating (for decay)
  ranking_position SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(career_id, opponent_id),
  UNIQUE(career_id, is_player) -- only one player row per career (where is_player=true)
);

-- Drop the unique constraint on is_player since it would block multiple FALSE rows
ALTER TABLE career_pro_rankings DROP CONSTRAINT IF EXISTS career_pro_rankings_career_id_is_player_key;

-- RLS
ALTER TABLE career_pro_rankings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own rankings" ON career_pro_rankings;
CREATE POLICY "Users can view own rankings" ON career_pro_rankings
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

-- ============================================
-- 2. Replace Tier 5 schedule templates
-- ============================================
DELETE FROM career_schedule_templates WHERE tier = 5;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
-- Players Championship 1
(5, 1, 'pro_tour_players_championship', 'Players Championship 1', 'pc1', 11, 128, FALSE,
  '{"tournament_number": 1, "rating_table": {"L128":1,"L64":3,"L32":6,"L16":10,"QF":15,"SF":20,"RU":30,"W":40}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":19}}'),
-- Premier League Night 1 (if in PL)
(5, 2, 'premier_league_match', 'Premier League — Night 1', 'pl1', 11, NULL, FALSE, '{"pl_night": 1}'),
-- Players Championship 2
(5, 3, 'pro_tour_players_championship', 'Players Championship 2', 'pc2', 11, 128, FALSE,
  '{"tournament_number": 2, "rating_table": {"L128":1,"L64":3,"L32":6,"L16":10,"QF":15,"SF":20,"RU":30,"W":40}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":19}}'),
-- Premier League Night 2
(5, 4, 'premier_league_match', 'Premier League — Night 2', 'pl2', 11, NULL, FALSE, '{"pl_night": 2}'),
-- Players Championship 3
(5, 5, 'pro_tour_players_championship', 'Players Championship 3', 'pc3', 11, 128, FALSE,
  '{"tournament_number": 3, "rating_table": {"L128":1,"L64":3,"L32":6,"L16":10,"QF":15,"SF":20,"RU":30,"W":40}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":19}}'),
-- Premier League Night 3
(5, 6, 'premier_league_match', 'Premier League — Night 3', 'pl3', 11, NULL, FALSE, '{"pl_night": 3}'),
-- Pro Tour Open
(5, 7, 'pro_tour_open', 'Pro Tour Open', 'pto', 11, 128, FALSE,
  '{"tournament_number": 4, "rating_table": {"L128":2,"L64":4,"L32":8,"L16":12,"QF":18,"SF":25,"RU":35,"W":50}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":21}}'),
-- Premier League Night 4
(5, 8, 'premier_league_match', 'Premier League — Night 4', 'pl4', 11, NULL, FALSE, '{"pl_night": 4}'),
-- Players Championship 4
(5, 9, 'pro_tour_players_championship', 'Players Championship 4', 'pc4', 11, 128, FALSE,
  '{"tournament_number": 5, "rating_table": {"L128":1,"L64":3,"L32":6,"L16":10,"QF":15,"SF":20,"RU":30,"W":40}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":19}}'),
-- Premier League Night 5
(5, 10, 'premier_league_match', 'Premier League — Night 5', 'pl5', 11, NULL, FALSE, '{"pl_night": 5}'),
-- Players Championship 5
(5, 11, 'pro_tour_players_championship', 'Players Championship 5', 'pc5', 11, 128, FALSE,
  '{"tournament_number": 6, "rating_table": {"L128":1,"L64":3,"L32":6,"L16":10,"QF":15,"SF":20,"RU":30,"W":40}, "round_formats": {"L128":11,"L64":11,"L32":11,"L16":13,"QF":15,"SF":17,"F":19}}'),
-- Premier League Night 6
(5, 12, 'premier_league_match', 'Premier League — Night 6', 'pl6', 11, NULL, FALSE, '{"pl_night": 6}'),
-- Pro Tour Major Qualification
(5, 13, 'pro_tour_major_qualification', 'Pro Tour Major — Qualification', 'ptm_qual', 11, NULL, FALSE,
  '{"description": "Top 32 auto-qualify. Others must win qualifiers."}'),
-- Premier League Night 7
(5, 14, 'premier_league_match', 'Premier League — Night 7', 'pl7', 11, NULL, FALSE, '{"pl_night": 7}'),
-- Pro Tour Major
(5, 15, 'pro_tour_major', 'Pro Tour Major', 'ptm', 11, 128, FALSE,
  '{"tournament_number": 7, "is_major": true, "rating_table": {"L128":3,"L64":6,"L32":10,"L16":15,"QF":20,"SF":30,"RU":45,"W":60}, "round_formats": {"L128":11,"L64":13,"L32":15,"L16":17,"QF":19,"SF":21,"F":23}}'),
-- Premier League Night 8
(5, 16, 'premier_league_match', 'Premier League — Night 8', 'pl8', 11, NULL, FALSE, '{"pl_night": 8}'),
-- Premier League Night 9
(5, 17, 'premier_league_match', 'Premier League — Night 9', 'pl9', 11, NULL, FALSE, '{"pl_night": 9}');

-- ============================================
-- 3. Initialize Pro Tour rankings (100 AI players)
-- Called when player first enters Tier 5
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_init_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_init_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_i INT;
  v_name TEXT;
  v_rating NUMERIC;
  v_opp_id UUID;
  v_first_names TEXT[] := ARRAY[
    'Michael','James','Peter','Gary','Phil','Adrian','Gerwyn','Nathan','Joe','Dave',
    'Rob','Chris','Luke','Damon','Kim','Brendan','Daryl','Danny','Mensur','Gabriel',
    'Dimitri','Fallon','Ross','Stephen','Keane','Martin','Dirk','Raymond','Simon','Andrew',
    'Ryan','Josh','Callan','Jonny','Devon','Ricardo','Jose','Florian','Keegan','Boris',
    'Mervyn','Ted','John','Mark','Alan','Scott','Ritchie','Ian','Jamie','Wayne',
    'Colin','Terry','Andy','Steve','Dean','Kevin','Barry','Darren','Nigel','Paul',
    'Stuart','Vincent','Max','Jeff','Liam','Connor','Ethan','Jake','Tyler','Ben',
    'Matt','Tom','Will','Sam','Dan','Alex','Harry','Oscar','Leo','Alfie',
    'George','Charlie','Noah','Arthur','Logan','Finley','Archie','Theo','Mason','Jack',
    'Ricky','Graham','Stan','Reg','Noel','Glen','Clive','Vince','Trevor','Roy'
  ];
  v_surnames TEXT[] := ARRAY[
    'van Gerwen','Anderson','Wright','Price','Smith','Lewis','Aspinall','Cross','Clayton','Chisnall',
    'Wade','Humphries','Searle','Heta','de Graaf','Dolan','Gurney','Noppert','Clemens','Cullen',
    'van den Bergh','Sherrock','Rock','Bunting','Barry','Schindler','van Duijvenbode','Whitlock','Ratajski','Gilding',
    'van Veen','Pietreczko','Lukeman','Dobey','Petersen','Rodriguez','de Sousa','Hempel','Brown','Soutar',
    'King','Hankey','Lowe','Bristow','Taylor','Wilson','Painter','Jenkins','Part','Barneveld',
    'Thornton','Adams','Mitchell','Warren','Waites','Ashton','Nicholson','Beaton','Mardle','Hamilton',
    'Webster','Fitton','Fordham','Evetts','Hughes','Owen','Green','Cooper','Evans','Harris',
    'Clark','Robinson','Turner','Baker','Wood','Hall','Walker','Allen','Young','Phillips',
    'Thompson','White','Jackson','Martin','Davies','Roberts','Campbell','Edwards','Miller','Watts',
    'Fraser','Reid','Stewart','Murray','Bennett','Shaw','Kelly','Stone','Fox','Webb'
  ];
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Check if rankings already exist
  IF EXISTS (SELECT 1 FROM career_pro_rankings WHERE career_id = p_career_id LIMIT 1) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  -- Insert player
  INSERT INTO career_pro_rankings (career_id, player_name, is_player, rating, season_rating, ranking_position)
  VALUES (p_career_id, 'You', TRUE, 0, 0, 100);

  -- Generate 99 AI ranked players with descending ratings
  FOR v_i IN 1..99 LOOP
    v_name := v_first_names[1 + (v_i * 7 + v_career.career_seed) % array_length(v_first_names, 1)] || ' '
           || v_surnames[1 + (v_i * 13 + v_career.career_seed) % array_length(v_surnames, 1)];
    -- Top players have higher ratings (roughly 500 down to 10)
    v_rating := GREATEST(10, 500 - (v_i * 5) + (random() * 20 - 10));

    INSERT INTO career_pro_rankings (career_id, player_name, is_player, rating, prev_rating, season_rating, ranking_position)
    VALUES (p_career_id, v_name, FALSE, v_rating, v_rating, 0, v_i);
  END LOOP;

  RETURN json_build_object('success', true, 'players_created', 100);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_init_rankings(UUID) TO authenticated;

-- ============================================
-- 4. Get rankings (Top 21 + user position)
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_get_rankings(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_get_rankings(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_top21 JSON;
  v_player_row JSON;
  v_player_rank INT;
BEGIN
  -- Recalculate positions
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rating DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn
  FROM ranked WHERE r.id = ranked.id;

  -- Get Top 21
  SELECT json_agg(row_to_json(t)) INTO v_top21 FROM (
    SELECT player_name, is_player, rating::numeric(10,2), prev_rating::numeric(10,2), ranking_position,
      rating - prev_rating AS rating_change
    FROM career_pro_rankings
    WHERE career_id = p_career_id
    ORDER BY ranking_position
    LIMIT 21
  ) t;

  -- Get player position
  SELECT json_build_object(
    'player_name', player_name, 'rating', rating::numeric(10,2),
    'prev_rating', prev_rating::numeric(10,2), 'ranking_position', ranking_position,
    'rating_change', (rating - prev_rating)::numeric(10,2)
  ) INTO v_player_row
  FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  RETURN json_build_object(
    'top21', v_top21,
    'player', v_player_row,
    'player_rank', v_player_rank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_get_rankings(UUID) TO authenticated;

-- ============================================
-- 5. Award tournament rating + simulate AI results
-- Called after each Pro Tour tournament
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_award_rating(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION rpc_pro_tour_award_rating(
  p_career_id UUID,
  p_event_id UUID,
  p_placement TEXT  -- 'L128','L64','L32','L16','QF','SF','RU','W'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_metadata JSON;
  v_rating_table JSON;
  v_player_rating NUMERIC;
  v_ai RECORD;
  v_ai_placement TEXT;
  v_ai_placements TEXT[] := ARRAY[
    'L128','L128','L128','L128','L128','L128','L128','L128','L128','L128',
    'L128','L128','L128','L128','L128','L128','L128','L128','L128','L128',
    'L64','L64','L64','L64','L64','L64','L64','L64','L64','L64',
    'L32','L32','L32','L32','L32','L32','L32',
    'L16','L16','L16','L16',
    'QF','QF','QF',
    'SF','SF',
    'RU'
  ];
  v_ai_rating NUMERIC;
  v_decay_factor NUMERIC := 0.92;  -- 8% decay per tournament for rolling window effect
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_event FROM career_events WHERE id = p_event_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Event not found'); END IF;

  -- Get rating table from template metadata
  SELECT (metadata::json)->'rating_table' INTO v_rating_table FROM career_schedule_templates
    WHERE tier = 5 AND event_subtype = v_event.event_subtype LIMIT 1;

  IF v_rating_table IS NULL THEN
    RETURN json_build_object('error', 'No rating table found for event');
  END IF;

  -- Apply decay to all players (rolling window simulation)
  UPDATE career_pro_rankings SET
    prev_rating = rating,
    rating = rating * v_decay_factor
  WHERE career_id = p_career_id;

  -- Award player rating
  v_player_rating := COALESCE((v_rating_table->>p_placement)::numeric, 0);
  UPDATE career_pro_rankings SET
    rating = rating + v_player_rating,
    season_rating = season_rating + v_player_rating
  WHERE career_id = p_career_id AND is_player = TRUE;

  -- Simulate AI tournament results
  -- Higher ranked AIs get better placements on average
  FOR v_ai IN
    SELECT id, ranking_position FROM career_pro_rankings
    WHERE career_id = p_career_id AND is_player = FALSE
    ORDER BY ranking_position
  LOOP
    -- Higher ranked players have better distribution (weighted index)
    DECLARE
      v_max_idx INT := array_length(v_ai_placements, 1);
      v_bias_idx INT;
    BEGIN
      -- Top ranked players skew towards better placements
      IF v_ai.ranking_position <= 10 THEN
        v_bias_idx := GREATEST(1, (v_max_idx * 0.3 + random() * v_max_idx * 0.7)::int);
      ELSIF v_ai.ranking_position <= 30 THEN
        v_bias_idx := GREATEST(1, (v_max_idx * 0.1 + random() * v_max_idx * 0.9)::int);
      ELSE
        v_bias_idx := GREATEST(1, (random() * v_max_idx)::int);
      END IF;
      v_ai_placement := v_ai_placements[v_bias_idx];
    END;

    v_ai_rating := COALESCE((v_rating_table->>v_ai_placement)::numeric, 0);
    UPDATE career_pro_rankings SET
      rating = rating + v_ai_rating,
      season_rating = season_rating + v_ai_rating
    WHERE id = v_ai.id;
  END LOOP;

  -- Recalculate positions
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rating DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn
  FROM ranked WHERE r.id = ranked.id;

  -- Milestone
  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
  VALUES (p_career_id,
    CASE WHEN p_placement = 'W' THEN 'tournament_win' ELSE 'tournament_result' END,
    v_event.event_name || ' — ' || p_placement,
    'Earned ' || v_player_rating || ' ranking rating',
    v_career.tier, v_career.season, v_career.week, v_career.day);

  RETURN json_build_object(
    'success', true,
    'rating_gained', v_player_rating,
    'placement', p_placement,
    'event_name', v_event.event_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_award_rating(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- 6. Premier League setup
-- Creates 9 round-robin matches for Top 10 (or skips PL events if not in Top 10)
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_setup_premier_league(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_setup_premier_league(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_pl_opponents UUID[];
  v_opp RECORD;
  v_night INT := 1;
  v_opp_idx INT := 1;
  v_event RECORD;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  -- If player is NOT in top 10, skip all PL events
  IF v_player_rank > 10 THEN
    UPDATE career_events SET status = 'skipped'
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'premier_league_match';

    RETURN json_build_object('success', true, 'in_premier_league', false, 'player_rank', v_player_rank);
  END IF;

  -- Get top 9 AI opponents (excluding player) for PL
  SELECT ARRAY_AGG(id ORDER BY ranking_position) INTO v_pl_opponents
  FROM (
    SELECT id, ranking_position FROM career_pro_rankings
    WHERE career_id = p_career_id AND is_player = FALSE
    ORDER BY ranking_position
    LIMIT 9
  ) top9;

  -- Assign opponents to each PL night (9 nights, 9 opponents)
  FOR v_event IN
    SELECT id, sequence_no FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'premier_league_match'
    ORDER BY sequence_no
  LOOP
    IF v_opp_idx <= array_length(v_pl_opponents, 1) THEN
      -- Create match record with PL opponent
      INSERT INTO career_matches (career_id, event_id, opponent_id, best_of, status)
      VALUES (p_career_id, v_event.id, v_pl_opponents[v_opp_idx], 11, 'pending');
      v_opp_idx := v_opp_idx + 1;
    END IF;
  END LOOP;

  -- Milestone
  INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
  VALUES (p_career_id, 'premier_league_invite', 'Premier League Invitation!',
    'Ranked ' || v_player_rank || ' in the world — invited to the Premier League!',
    v_career.tier, v_career.season, v_career.week, v_career.day);

  RETURN json_build_object('success', true, 'in_premier_league', true, 'player_rank', v_player_rank);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_setup_premier_league(UUID) TO authenticated;

-- ============================================
-- 7. Premier League match complete
-- Records result, simulates other PL matches
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_pl_match_complete(UUID, UUID, BOOLEAN, INT, INT);
CREATE OR REPLACE FUNCTION rpc_pro_tour_pl_match_complete(
  p_career_id UUID,
  p_event_id UUID,
  p_player_won BOOLEAN,
  p_player_legs INT,
  p_opponent_legs INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_completed INT;
  v_total INT := 9;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Mark event + match
  UPDATE career_events SET status = 'completed' WHERE id = p_event_id AND career_id = p_career_id;
  UPDATE career_matches SET
    status = 'completed',
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    result = CASE WHEN p_player_won THEN 'win' ELSE 'loss' END
  WHERE event_id = p_event_id AND career_id = p_career_id;

  -- Count completed PL matches
  SELECT COUNT(*) INTO v_completed FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'premier_league_match' AND status = 'completed';

  -- PL gives rating points too (2 per win)
  IF p_player_won THEN
    UPDATE career_pro_rankings SET
      rating = rating + 2,
      season_rating = season_rating + 2
    WHERE career_id = p_career_id AND is_player = TRUE;
  END IF;

  RETURN json_build_object(
    'success', true,
    'pl_matches_completed', v_completed,
    'pl_matches_total', v_total,
    'pl_complete', v_completed >= v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_pl_match_complete(UUID, UUID, BOOLEAN, INT, INT) TO authenticated;

-- ============================================
-- 8. Pro Tour Major qualification
-- Top 32 auto-qualify, others play qualifier
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_major_qualification(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_major_qualification(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_qual_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  -- Mark qualification event as completed
  UPDATE career_events SET status = 'completed'
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'pro_tour_major_qualification';

  IF v_player_rank <= 32 THEN
    -- Auto-qualify
    UPDATE career_events SET status = 'pending'
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'pro_tour_major';

    RETURN json_build_object(
      'success', true, 'auto_qualified', true, 'player_rank', v_player_rank,
      'message', 'Ranked ' || v_player_rank || ' — automatic qualification for the Pro Tour Major!'
    );
  ELSE
    -- Must win qualifier (BO11)
    INSERT INTO career_events (
      career_id, season, sequence_no, event_type, event_name,
      format_legs, day, status
    ) VALUES (
      p_career_id, v_career.season, 150,
      'regional_qual_match', 'Pro Tour Major Qualifier',
      11, v_career.day + 2, 'pending'
    ) RETURNING id INTO v_qual_event_id;

    RETURN json_build_object(
      'success', true, 'auto_qualified', false, 'player_rank', v_player_rank,
      'qual_event_id', v_qual_event_id,
      'message', 'Ranked ' || v_player_rank || ' — must win a qualifier to enter the Pro Tour Major'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_major_qualification(UUID) TO authenticated;

-- ============================================
-- 9. Pro Tour season end
-- Recalculate rankings, determine relegation
-- Bottom 10 relegated
-- ============================================
DROP FUNCTION IF EXISTS rpc_pro_tour_season_end(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_season_end(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_is_relegated BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Final ranking recalculation
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY rating DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn
  FROM ranked WHERE r.id = ranked.id;

  SELECT ranking_position INTO v_player_rank FROM career_pro_rankings
  WHERE career_id = p_career_id AND is_player = TRUE;

  -- Reset season_rating for next season
  UPDATE career_pro_rankings SET season_rating = 0 WHERE career_id = p_career_id;

  v_is_relegated := (v_player_rank > 90);  -- Bottom 10 of 100

  IF v_is_relegated THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'relegation', 'Pro Tour Card Lost',
      'Ranked ' || v_player_rank || ' — lost Pro Tour card. Relegated to Regional Tour.',
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END IF;

  -- PL trophy for winner
  DECLARE
    v_pl_wins INT := 0;
    v_pl_best BOOLEAN := FALSE;
  BEGIN
    SELECT COUNT(*) INTO v_pl_wins FROM career_matches cm
    JOIN career_events ce ON cm.event_id = ce.id
    WHERE cm.career_id = p_career_id AND ce.season = v_career.season
      AND ce.event_type = 'premier_league_match' AND cm.result = 'win';

    -- Simple: most PL wins = PL champion (we'd need full standings but approximate)
    IF v_pl_wins >= 7 THEN
      INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
      VALUES (p_career_id, 'tournament_win', 'Premier League Champion!',
        'Dominated the Premier League with ' || v_pl_wins || ' wins out of 9.',
        v_career.tier, v_career.season, v_career.week, v_career.day);
    END IF;
  END;

  RETURN json_build_object(
    'success', true,
    'player_rank', v_player_rank,
    'relegated', v_is_relegated,
    'message', CASE WHEN v_is_relegated
      THEN 'Ranked ' || v_player_rank || ' — relegated to Regional Tour'
      ELSE 'Season complete — ranked ' || v_player_rank || ' in the world'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_season_end(UUID) TO authenticated;

-- ============================================
-- 10. Update advance_to_next_season for Pro Tour
-- Pro Tour uses ranking-based relegation (bottom 10), not league standings
-- ============================================
-- The main rpc_career_advance_to_next_season already handles tier 5 via the
-- standard promotion/relegation paths. For Pro Tour, relegation is checked
-- via rpc_pro_tour_season_end which sets a milestone.
-- The frontend will:
-- 1. Call rpc_pro_tour_season_end after last tournament
-- 2. If relegated: call advance_to_next_season (which drops to tier 4)
-- 3. If not: create new season events for tier 5

-- Helper: Create next Pro Tour season (no promotion possible from tier 5)
DROP FUNCTION IF EXISTS rpc_pro_tour_new_season(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_new_season(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_new_season SMALLINT;
  v_new_day SMALLINT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  v_new_season := v_career.season + 1;
  v_new_day := v_career.day + 5;

  UPDATE career_profiles SET
    season = v_new_season, week = 1, day = v_new_day, updated_at = now()
  WHERE id = p_career_id;

  -- Create events from templates
  INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
  SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
    v_new_day + t.sequence_no * 8
  FROM career_schedule_templates t WHERE t.tier = 5 ORDER BY t.sequence_no;

  -- Setup Premier League
  PERFORM rpc_pro_tour_setup_premier_league(p_career_id);

  RETURN json_build_object('success', true, 'new_season', v_new_season);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_new_season(UUID) TO authenticated;
