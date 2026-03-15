-- Add wins column to track nights won in Champions Series
ALTER TABLE career_champions_series ADD COLUMN IF NOT EXISTS wins INT DEFAULT 0;

-- Update simulation to track the winner (first place each night)
CREATE OR REPLACE FUNCTION rpc_champions_series_simulate_night(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_completed_nights INT;
  v_player_in_cs BOOLEAN;
  v_cs RECORD;
  v_points INT[] := ARRAY[5,3,2,1,0,0,0,0];
  v_idx INT := 1;
  v_winner_id UUID := NULL;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;
  IF v_career.tier < 5 THEN RETURN json_build_object('skip', true); END IF;

  IF NOT EXISTS (SELECT 1 FROM career_champions_series WHERE career_id = p_career_id AND season = v_career.season LIMIT 1) THEN
    RETURN json_build_object('skip', true, 'reason', 'No champions series this season');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season AND is_player = TRUE
  ) INTO v_player_in_cs;

  IF v_player_in_cs THEN
    RETURN json_build_object('skip', true, 'reason', 'Player is in CS - nights are playable');
  END IF;

  SELECT COUNT(*) INTO v_completed_nights
  FROM career_events WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'champions_series_night' AND status = 'completed';

  IF v_completed_nights >= 8 THEN
    RETURN json_build_object('skip', true, 'reason', 'All nights complete');
  END IF;

  -- Use random() for genuine randomization each night
  FOR v_cs IN
    SELECT id, player_name, is_player, points AS current_pts FROM career_champions_series
    WHERE career_id = p_career_id AND season = v_career.season
    ORDER BY (random() * 0.7 + (points::float / GREATEST(1, (SELECT MAX(points) FROM career_champions_series WHERE career_id = p_career_id AND season = v_career.season))) * 0.3) DESC
  LOOP
    IF v_idx <= array_length(v_points, 1) THEN
      UPDATE career_champions_series SET
        points = points + v_points[v_idx],
        legs_for = legs_for + 2 + floor(random() * 8)::int,
        legs_against = legs_against + 1 + floor(random() * 7)::int
      WHERE id = v_cs.id;
      -- First place = night winner
      IF v_idx = 1 THEN
        v_winner_id := v_cs.id;
        UPDATE career_champions_series SET wins = COALESCE(wins, 0) + 1 WHERE id = v_cs.id;
      END IF;
      v_idx := v_idx + 1;
    END IF;
  END LOOP;

  UPDATE career_events SET status = 'completed'
  WHERE career_id = p_career_id AND season = v_career.season
    AND event_type = 'champions_series_night' AND status = 'pending'
    AND sequence_no = 501 + v_completed_nights;

  RETURN json_build_object('success', true, 'night', v_completed_nights + 1);
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_champions_series_simulate_night(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
