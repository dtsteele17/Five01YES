-- ============================================================
-- COUNTY CHAMPIONSHIP — End-of-season structured tournament
-- Group stage (4-player round-robin BO5) → 32-player knockout (BO5, final BO7)
-- Only for Tier 3 (County Circuit)
-- ============================================================

-- ============================================
-- 1. Create County Championship (group stage)
-- Called instead of rpc_create_end_season_tournaments for Tier 3
-- ============================================
DROP FUNCTION IF EXISTS rpc_create_county_championship(UUID);
CREATE OR REPLACE FUNCTION rpc_create_county_championship(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_total_players SMALLINT;
  v_group_opponents UUID[];
  v_opp UUID;
  v_seq SMALLINT := 300;
  v_day SMALLINT;
  v_event_id UUID;
  v_i INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  IF v_career.tier != 3 THEN
    RETURN json_build_object('error', 'County Championship is only for Tier 3');
  END IF;

  -- Check if championship already created
  IF EXISTS (
    SELECT 1 FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season AND sequence_no >= 300
  ) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  -- Count total players and player rank
  SELECT COUNT(*)::SMALLINT INTO v_total_players FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier;

  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- Bottom 2 excluded
  IF v_player_rank > (v_total_players - 2) THEN
    RETURN json_build_object('excluded', true, 'reason', 'Bottom 2 — no end-of-season championship');
  END IF;

  -- Pick 3 random opponents from league (not bottom 2)
  SELECT ARRAY_AGG(opponent_id ORDER BY random()) INTO v_group_opponents
  FROM (
    SELECT cls.opponent_id FROM career_league_standings cls
    WHERE cls.career_id = p_career_id AND cls.season = v_career.season
      AND cls.tier = v_career.tier AND cls.is_player = FALSE
    ORDER BY cls.points DESC, (cls.legs_for - cls.legs_against) DESC
    LIMIT (v_total_players - 1 - 2)  -- exclude bottom 2 opponents
  ) top_opps
  LIMIT 3;

  v_day := v_career.day + 3;

  -- Create 3 group stage matches (player vs each opponent)
  FOR v_i IN 1..3 LOOP
    v_opp := v_group_opponents[v_i];
    INSERT INTO career_events (
      career_id, season, sequence_no, event_type, event_name,
      format_legs, day, status, bracket_size
    ) VALUES (
      p_career_id, v_career.season, v_seq + v_i,
      'county_championship_group',
      'County Championship — Group Match ' || v_i,
      5, v_day + (v_i - 1) * 2, 'pending', NULL
    ) RETURNING id INTO v_event_id;

    -- Store opponent info in career_matches so we know who to play
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, best_of, status
    ) VALUES (
      p_career_id, v_event_id, v_opp, 5, 'pending'
    );
  END LOOP;

  -- Store group data as milestone (JSON with opponents + simulated results)
  -- Simulate other group matches (3 opponents play each other = 3 matches)
  DECLARE
    v_sim_results JSON;
    v_opp1_w INT := 0; v_opp1_l INT := 0; v_opp1_lf INT := 0; v_opp1_la INT := 0;
    v_opp2_w INT := 0; v_opp2_l INT := 0; v_opp2_lf INT := 0; v_opp2_la INT := 0;
    v_opp3_w INT := 0; v_opp3_l INT := 0; v_opp3_lf INT := 0; v_opp3_la INT := 0;
    v_legs_to_win INT := 3; -- BO5
    v_winner_legs INT;
    v_loser_legs INT;
  BEGIN
    -- Match: opp1 vs opp2
    v_winner_legs := v_legs_to_win;
    v_loser_legs := floor(random() * v_legs_to_win)::INT;
    IF random() < 0.5 THEN
      v_opp1_w := v_opp1_w + 1; v_opp2_l := v_opp2_l + 1;
      v_opp1_lf := v_opp1_lf + v_winner_legs; v_opp1_la := v_opp1_la + v_loser_legs;
      v_opp2_lf := v_opp2_lf + v_loser_legs; v_opp2_la := v_opp2_la + v_winner_legs;
    ELSE
      v_opp2_w := v_opp2_w + 1; v_opp1_l := v_opp1_l + 1;
      v_opp2_lf := v_opp2_lf + v_winner_legs; v_opp2_la := v_opp2_la + v_loser_legs;
      v_opp1_lf := v_opp1_lf + v_loser_legs; v_opp1_la := v_opp1_la + v_winner_legs;
    END IF;

    -- Match: opp1 vs opp3
    v_winner_legs := v_legs_to_win;
    v_loser_legs := floor(random() * v_legs_to_win)::INT;
    IF random() < 0.5 THEN
      v_opp1_w := v_opp1_w + 1; v_opp3_l := v_opp3_l + 1;
      v_opp1_lf := v_opp1_lf + v_winner_legs; v_opp1_la := v_opp1_la + v_loser_legs;
      v_opp3_lf := v_opp3_lf + v_loser_legs; v_opp3_la := v_opp3_la + v_winner_legs;
    ELSE
      v_opp3_w := v_opp3_w + 1; v_opp1_l := v_opp1_l + 1;
      v_opp3_lf := v_opp3_lf + v_winner_legs; v_opp3_la := v_opp3_la + v_loser_legs;
      v_opp1_lf := v_opp1_lf + v_loser_legs; v_opp1_la := v_opp1_la + v_winner_legs;
    END IF;

    -- Match: opp2 vs opp3
    v_winner_legs := v_legs_to_win;
    v_loser_legs := floor(random() * v_legs_to_win)::INT;
    IF random() < 0.5 THEN
      v_opp2_w := v_opp2_w + 1; v_opp3_l := v_opp3_l + 1;
      v_opp2_lf := v_opp2_lf + v_winner_legs; v_opp2_la := v_opp2_la + v_loser_legs;
      v_opp3_lf := v_opp3_lf + v_loser_legs; v_opp3_la := v_opp3_la + v_winner_legs;
    ELSE
      v_opp3_w := v_opp3_w + 1; v_opp2_l := v_opp2_l + 1;
      v_opp3_lf := v_opp3_lf + v_winner_legs; v_opp3_la := v_opp3_la + v_loser_legs;
      v_opp2_lf := v_opp2_lf + v_loser_legs; v_opp2_la := v_opp2_la + v_winner_legs;
    END IF;

    v_sim_results := json_build_object(
      'group_opponents', json_build_array(
        v_group_opponents[1]::text, v_group_opponents[2]::text, v_group_opponents[3]::text
      ),
      'ai_results', json_build_object(
        v_group_opponents[1]::text, json_build_object('w', v_opp1_w, 'l', v_opp1_l, 'lf', v_opp1_lf, 'la', v_opp1_la),
        v_group_opponents[2]::text, json_build_object('w', v_opp2_w, 'l', v_opp2_l, 'lf', v_opp2_lf, 'la', v_opp2_la),
        v_group_opponents[3]::text, json_build_object('w', v_opp3_w, 'l', v_opp3_l, 'lf', v_opp3_lf, 'la', v_opp3_la)
      )
    );

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (p_career_id, 'county_championship_group', 'County Championship Group Stage',
      v_sim_results::text,
      v_career.tier, v_career.season, v_career.week, v_career.day);
  END;

  RETURN json_build_object('success', true, 'group_matches', 3);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_county_championship(UUID) TO authenticated;

-- ============================================
-- 2. Complete a County Championship group match
-- Records player result and checks group completion
-- ============================================
DROP FUNCTION IF EXISTS rpc_county_championship_group_complete(UUID, UUID, BOOLEAN, INT, INT);
CREATE OR REPLACE FUNCTION rpc_county_championship_group_complete(
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
  v_completed_count INT;
  v_total_group_matches INT := 3;
  v_group_data JSON;
  v_player_w INT := 0; v_player_l INT := 0;
  v_player_lf INT := 0; v_player_la INT := 0;
  v_group_complete BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Mark event as completed
  UPDATE career_events SET status = 'completed'
  WHERE id = p_event_id AND career_id = p_career_id;

  -- Update match
  UPDATE career_matches SET
    status = 'completed',
    player_legs_won = p_player_legs,
    opponent_legs_won = p_opponent_legs,
    result = CASE WHEN p_player_won THEN 'win' ELSE 'loss' END
  WHERE event_id = p_event_id AND career_id = p_career_id;

  -- Count completed group matches
  SELECT COUNT(*) INTO v_completed_count FROM career_events
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'county_championship_group' AND status = 'completed';

  v_group_complete := (v_completed_count >= v_total_group_matches);

  -- Calculate player totals from all group matches
  SELECT
    COUNT(*) FILTER (WHERE result = 'win'),
    COUNT(*) FILTER (WHERE result = 'loss'),
    COALESCE(SUM(player_legs_won), 0),
    COALESCE(SUM(opponent_legs_won), 0)
  INTO v_player_w, v_player_l, v_player_lf, v_player_la
  FROM career_matches
  WHERE career_id = p_career_id AND event_id IN (
    SELECT id FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'county_championship_group'
  );

  RETURN json_build_object(
    'success', true,
    'group_complete', v_group_complete,
    'player_record', json_build_object('w', v_player_w, 'l', v_player_l, 'lf', v_player_lf, 'la', v_player_la),
    'matches_played', v_completed_count,
    'matches_total', v_total_group_matches
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_county_championship_group_complete(UUID, UUID, BOOLEAN, INT, INT) TO authenticated;

-- ============================================
-- 3. Get County Championship group standings
-- Combines player results + simulated AI results
-- ============================================
DROP FUNCTION IF EXISTS rpc_get_county_championship_group(UUID);
CREATE OR REPLACE FUNCTION rpc_get_county_championship_group(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_milestone_data TEXT;
  v_ai_results JSON;
  v_group_opponents JSON;
  v_player_w INT; v_player_l INT; v_player_lf INT; v_player_la INT;
  v_standings JSON;
  v_opp_id TEXT;
  v_opp_data JSON;
  v_all_standings JSON[];
  v_opp_name TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Get stored group data from milestone
  SELECT description INTO v_milestone_data FROM career_milestones
  WHERE career_id = p_career_id AND season = v_career.season
    AND milestone_type = 'county_championship_group'
  LIMIT 1;

  IF v_milestone_data IS NULL THEN
    RETURN json_build_object('error', 'No championship data found');
  END IF;

  v_ai_results := (v_milestone_data::JSON)->'ai_results';
  v_group_opponents := (v_milestone_data::JSON)->'group_opponents';

  -- Get player results
  SELECT
    COUNT(*) FILTER (WHERE result = 'win'),
    COUNT(*) FILTER (WHERE result = 'loss'),
    COALESCE(SUM(player_legs_won), 0),
    COALESCE(SUM(opponent_legs_won), 0)
  INTO v_player_w, v_player_l, v_player_lf, v_player_la
  FROM career_matches
  WHERE career_id = p_career_id AND event_id IN (
    SELECT id FROM career_events
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type = 'county_championship_group'
      AND status = 'completed'
  );

  -- Build standings array: player + 3 opponents
  -- Each has: name, w, l, lf, la, pts (3 per win)
  v_all_standings := ARRAY[
    json_build_object(
      'name', 'You', 'is_player', true,
      'w', v_player_w, 'l', v_player_l,
      'lf', v_player_lf, 'la', v_player_la,
      'pts', v_player_w * 3
    )
  ];

  -- Add AI opponents
  FOR v_i IN 0..2 LOOP
    v_opp_id := v_group_opponents->>v_i;
    v_opp_data := v_ai_results->v_opp_id;

    SELECT co.name INTO v_opp_name FROM career_opponents co
    WHERE co.id = v_opp_id::UUID;

    v_all_standings := v_all_standings || json_build_object(
      'name', COALESCE(v_opp_name, 'Opponent ' || (v_i + 1)),
      'is_player', false, 'opponent_id', v_opp_id,
      'w', (v_opp_data->>'w')::int, 'l', (v_opp_data->>'l')::int,
      'lf', (v_opp_data->>'lf')::int, 'la', (v_opp_data->>'la')::int,
      'pts', (v_opp_data->>'w')::int * 3
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'standings', array_to_json(v_all_standings),
    'player_qualifies', NULL -- will be determined after all 3 group matches
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_get_county_championship_group(UUID) TO authenticated;

-- ============================================
-- 4. Advance to knockout stage after group completion
-- Creates a 32-player bracket event
-- ============================================
DROP FUNCTION IF EXISTS rpc_county_championship_to_knockout(UUID);
CREATE OR REPLACE FUNCTION rpc_county_championship_to_knockout(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank INT;
  v_group_standings JSON;
  v_group_result JSON;
  v_sorted JSON[];
  v_item JSON;
  v_i INT;
  v_event_id UUID;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  -- Get group standings
  v_group_result := rpc_get_county_championship_group(p_career_id);
  IF v_group_result->>'error' IS NOT NULL THEN
    RETURN v_group_result;
  END IF;

  -- Sort standings by pts DESC, leg diff DESC
  -- Simple: count player rank
  v_player_rank := 1;
  FOR v_item IN SELECT json_array_elements(v_group_result->'standings') LOOP
    IF NOT (v_item->>'is_player')::boolean THEN
      IF (v_item->>'pts')::int > (
        SELECT (s->>'pts')::int FROM json_array_elements(v_group_result->'standings') s
        WHERE (s->>'is_player')::boolean LIMIT 1
      ) THEN
        v_player_rank := v_player_rank + 1;
      ELSIF (v_item->>'pts')::int = (
        SELECT (s->>'pts')::int FROM json_array_elements(v_group_result->'standings') s
        WHERE (s->>'is_player')::boolean LIMIT 1
      ) AND ((v_item->>'lf')::int - (v_item->>'la')::int) > (
        SELECT (s->>'lf')::int - (s->>'la')::int FROM json_array_elements(v_group_result->'standings') s
        WHERE (s->>'is_player')::boolean LIMIT 1
      ) THEN
        v_player_rank := v_player_rank + 1;
      END IF;
    END IF;
  END LOOP;

  -- Top 2 qualify for knockout
  IF v_player_rank > 2 THEN
    RETURN json_build_object(
      'success', true, 'qualified', false,
      'player_rank', v_player_rank,
      'message', 'Eliminated in the group stage'
    );
  END IF;

  -- Create 32-player knockout event (BO5, final BO7)
  INSERT INTO career_events (
    career_id, season, sequence_no, event_type, event_name,
    format_legs, bracket_size, day, status
  ) VALUES (
    p_career_id, v_career.season, 310,
    'county_championship_knockout',
    'County Championship — Knockout Stage',
    5, 32, v_career.day + 3, 'pending'
  ) RETURNING id INTO v_event_id;

  RETURN json_build_object(
    'success', true, 'qualified', true,
    'player_rank', v_player_rank,
    'knockout_event_id', v_event_id,
    'message', 'Qualified for the 32-player knockout!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_county_championship_to_knockout(UUID) TO authenticated;
