-- ============================================================
-- Add league champion milestone + email when player finishes 1st
-- Add promotion milestone when player gets promoted
-- Patched into rpc_career_advance_to_next_season
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_career_advance_to_next_season(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_player_rank SMALLINT;
  v_new_season SMALLINT;
  v_new_tier SMALLINT;
  v_new_day SMALLINT;
  v_ranked_opponents UUID[];
  v_keep_opponents UUID[];
  v_top2_opponents UUID[];
  v_total_opponents SMALLINT;
  v_is_promotion BOOLEAN := FALSE;
  v_tier_name TEXT;
  v_old_tier_name TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Tier names
  v_old_tier_name := CASE v_career.tier
    WHEN 1 THEN 'Local Circuit' WHEN 2 THEN 'Pub Leagues' WHEN 3 THEN 'County Circuit'
    WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_career.tier
  END;

  -- Calculate player rank
  SELECT COUNT(*)::SMALLINT + 1 INTO v_player_rank FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier
    AND is_player = FALSE
    AND (points > (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
      OR (points = (SELECT points FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)
        AND (legs_for - legs_against) > (SELECT legs_for - legs_against FROM career_league_standings WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = TRUE)));

  -- ========== LEAGUE CHAMPION MILESTONE ==========
  IF v_player_rank = 1 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (
      p_career_id, 'league_win',
      v_old_tier_name || ' Champion',
      'Won the ' || v_old_tier_name || ' Season ' || v_career.season || ' with a 1st place finish!',
      v_career.tier, v_career.season, v_career.week, v_career.day
    );
  ELSIF v_player_rank = 2 THEN
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (
      p_career_id, 'season_winner',
      v_old_tier_name || ' Runner-Up',
      'Finished 2nd in the ' || v_old_tier_name || ' Season ' || v_career.season || '. Promoted!',
      v_career.tier, v_career.season, v_career.week, v_career.day
    );
  END IF;

  v_new_season := v_career.season + 1;
  v_new_day := v_career.day + 5;

  -- Rank opponents
  SELECT ARRAY_AGG(opponent_id ORDER BY points DESC, (legs_for - legs_against) DESC)
  INTO v_ranked_opponents
  FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND tier = v_career.tier AND is_player = FALSE;

  IF v_player_rank <= 2 THEN
    -- ========== PROMOTED ==========
    v_is_promotion := TRUE;
    v_new_tier := LEAST(v_career.tier + 1, 5);

    v_tier_name := CASE v_new_tier
      WHEN 3 THEN 'County Circuit' WHEN 4 THEN 'Regional Tour' WHEN 5 THEN 'World Tour' ELSE 'Tier ' || v_new_tier
    END;

    -- Promotion milestone
    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, week, day)
    VALUES (
      p_career_id, 'promotion',
      'Promoted to ' || v_tier_name,
      'Earned promotion from ' || v_old_tier_name || ' to ' || v_tier_name || '!',
      v_new_tier, v_new_season, 1, v_new_day
    );

    UPDATE career_profiles SET
      tier = v_new_tier, season = v_new_season, week = 1, day = v_new_day, updated_at = now()
    WHERE id = p_career_id;

    -- Generate opponents for new tier
    IF v_new_tier = 3 THEN
      PERFORM rpc_career_generate_tier3_league(p_career_id);
    ELSE
      PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT,
        CASE v_new_tier WHEN 4 THEN 11 WHEN 5 THEN 13 ELSE 9 END,
        v_career.career_seed + v_new_season * 100);
    END IF;

    -- Create new season events
    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    RETURN json_build_object(
      'success', true,
      'promoted', true,
      'new_tier', v_new_tier,
      'new_season', v_new_season,
      'player_rank', v_player_rank,
      'tier_name', v_tier_name
    );

  ELSE
    -- ========== STAY IN SAME TIER ==========
    v_new_tier := v_career.tier;
    v_top2_opponents := v_ranked_opponents[1:2];
    v_keep_opponents := v_ranked_opponents[3:array_length(v_ranked_opponents, 1)];

    UPDATE career_profiles SET 
      season = v_new_season, week = 1, day = v_new_day, updated_at = now()
    WHERE id = p_career_id;

    -- Player standings for new season
    INSERT INTO career_league_standings (career_id, season, tier, is_player)
    VALUES (p_career_id, v_new_season, v_new_tier, TRUE);

    -- Keep non-top-2 opponents
    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, unnest(v_keep_opponents), FALSE;

    -- Generate 2 new opponents
    PERFORM rpc_generate_career_opponents(p_career_id, v_new_tier::SMALLINT, 2, v_career.career_seed + v_new_season * 100);

    INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
    SELECT p_career_id, v_new_season, v_new_tier, id, FALSE
    FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_new_tier
      AND id NOT IN (SELECT unnest(v_keep_opponents))
      AND id NOT IN (SELECT unnest(v_top2_opponents))
      AND id NOT IN (SELECT unnest(v_ranked_opponents))
    ORDER BY created_at DESC
    LIMIT 2;

    -- Seed new season events
    INSERT INTO career_events (career_id, template_id, season, sequence_no, event_type, event_name, format_legs, bracket_size, day)
    SELECT p_career_id, t.id, v_new_season, t.sequence_no, t.event_type, t.event_name, t.format_legs, t.bracket_size,
      v_new_day + t.sequence_no * 6
    FROM career_schedule_templates t WHERE t.tier = v_new_tier ORDER BY t.sequence_no;

    RETURN json_build_object(
      'success', true,
      'promoted', false,
      'new_tier', v_new_tier,
      'new_season', v_new_season,
      'player_rank', v_player_rank,
      'tier_name', v_old_tier_name
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_career_advance_to_next_season(UUID) TO authenticated;
