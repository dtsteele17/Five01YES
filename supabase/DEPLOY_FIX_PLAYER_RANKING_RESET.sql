UPDATE career_pro_rankings
SET ranking_points = 15 + floor(random() * 20)
WHERE is_player = TRUE
AND career_id IN (SELECT id FROM career_profiles WHERE tier = 5);

WITH ranked AS (
  SELECT r.id, r.career_id, ROW_NUMBER() OVER (PARTITION BY r.career_id ORDER BY r.ranking_points DESC, r.player_name) AS rn
  FROM career_pro_rankings r
  WHERE r.career_id IN (SELECT id FROM career_profiles WHERE tier = 5)
)
UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
FROM ranked WHERE r.id = ranked.id;

DROP FUNCTION IF EXISTS rpc_pro_tour_reset_player_ranking(UUID);
CREATE OR REPLACE FUNCTION rpc_pro_tour_reset_player_ranking(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_new_points NUMERIC;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  v_new_points := 15 + floor(random() * 20);

  UPDATE career_pro_rankings
  SET ranking_points = v_new_points
  WHERE career_id = p_career_id AND is_player = TRUE;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ranking_points DESC, player_name) AS rn
    FROM career_pro_rankings WHERE career_id = p_career_id
  )
  UPDATE career_pro_rankings r SET ranking_position = ranked.rn::smallint
  FROM ranked WHERE r.id = ranked.id;

  RETURN json_build_object('success', true, 'new_points', v_new_points,
    'new_rank', (SELECT ranking_position FROM career_pro_rankings WHERE career_id = p_career_id AND is_player = TRUE));
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_pro_tour_reset_player_ranking(UUID) TO authenticated;

UPDATE career_pro_rankings SET prev_points = ranking_points WHERE prev_points IS NULL OR prev_points = 0;
