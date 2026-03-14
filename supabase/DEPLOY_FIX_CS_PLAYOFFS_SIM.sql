DROP FUNCTION IF EXISTS rpc_champions_series_playoffs(UUID);
CREATE OR REPLACE FUNCTION rpc_champions_series_playoffs(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_top4 JSON;
  v_player_pos INT;
  v_players RECORD[];
  v_p1 RECORD;
  v_p2 RECORD;
  v_p3 RECORD;
  v_p4 RECORD;
  v_semi1_winner TEXT;
  v_semi2_winner TEXT;
  v_final_winner TEXT;
  v_hash INT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT json_agg(row_to_json(t)) INTO v_top4 FROM (
    SELECT player_name, is_player, points, legs_for, legs_against, pos FROM (
      SELECT player_name, is_player, points, legs_for, legs_against,
        ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS pos
      FROM career_champions_series
      WHERE career_id = p_career_id AND season = v_career.season
    ) ranked WHERE pos <= 4
  ) t;

  SELECT pos INTO v_player_pos FROM (
    SELECT is_player,
      ROW_NUMBER() OVER (ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC) AS pos
    FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season
  ) sub WHERE is_player = TRUE;

  IF v_player_pos IS NULL OR v_player_pos > 4 THEN
    UPDATE career_events SET status = 'completed'
    WHERE career_id = p_career_id AND season = v_career.season
      AND event_type IN ('champions_series_semi', 'champions_series_final')
      AND status IN ('pending', 'active');

    SELECT player_name INTO v_p1 FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = FALSE
    ORDER BY points DESC, (legs_for - legs_against) DESC LIMIT 1 OFFSET 0;
    SELECT player_name INTO v_p2 FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = FALSE
    ORDER BY points DESC, (legs_for - legs_against) DESC LIMIT 1 OFFSET 1;
    SELECT player_name INTO v_p3 FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = FALSE
    ORDER BY points DESC, (legs_for - legs_against) DESC LIMIT 1 OFFSET 2;
    SELECT player_name INTO v_p4 FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = FALSE
    ORDER BY points DESC, (legs_for - legs_against) DESC LIMIT 1 OFFSET 3;

    v_hash := abs(hashtext(p_career_id::text || v_career.season::text || 'semi1'));
    IF v_hash % 3 < 2 THEN v_semi1_winner := v_p1.player_name; ELSE v_semi1_winner := v_p4.player_name; END IF;

    v_hash := abs(hashtext(p_career_id::text || v_career.season::text || 'semi2'));
    IF v_hash % 3 < 2 THEN v_semi2_winner := v_p2.player_name; ELSE v_semi2_winner := v_p3.player_name; END IF;

    v_hash := abs(hashtext(p_career_id::text || v_career.season::text || 'final'));
    IF v_hash % 2 = 0 THEN v_final_winner := v_semi1_winner; ELSE v_final_winner := v_semi2_winner; END IF;

    INSERT INTO career_milestones (career_id, milestone_type, title, description, tier, season, day)
    VALUES (p_career_id, 'cs_result',
      'Champions Series Winner: ' || v_final_winner,
      v_final_winner || ' won the Champions Series! Semi 1: ' || v_semi1_winner || ' beat ' ||
        CASE WHEN v_semi1_winner = v_p1.player_name THEN v_p4.player_name ELSE v_p1.player_name END ||
        '. Semi 2: ' || v_semi2_winner || ' beat ' ||
        CASE WHEN v_semi2_winner = v_p2.player_name THEN v_p3.player_name ELSE v_p2.player_name END,
      5, v_career.season, v_career.day);

    RETURN json_build_object('qualified', false, 'player_position', v_player_pos,
      'simulated', true,
      'winner_name', v_final_winner,
      'semi1', json_build_object('p1', v_p1.player_name, 'p2', v_p4.player_name, 'winner', v_semi1_winner),
      'semi2', json_build_object('p1', v_p2.player_name, 'p2', v_p3.player_name, 'winner', v_semi2_winner),
      'final', json_build_object('p1', v_semi1_winner, 'p2', v_semi2_winner, 'winner', v_final_winner),
      'message', 'Champions Series simulated - ' || v_final_winner || ' wins!');
  END IF;

  RETURN json_build_object('qualified', true, 'player_position', v_player_pos, 'top4', v_top4,
    'semi_matchup', CASE v_player_pos
      WHEN 1 THEN '1st vs 4th'
      WHEN 2 THEN '2nd vs 3rd'
      WHEN 3 THEN '3rd vs 2nd'
      WHEN 4 THEN '4th vs 1st'
    END);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_playoffs(UUID) TO authenticated;
