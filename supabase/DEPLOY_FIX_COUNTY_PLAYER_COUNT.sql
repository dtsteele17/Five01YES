DO $$
DECLARE
  r RECORD;
  v_current_count INTEGER;
  v_needed INTEGER;
BEGIN
  FOR r IN
    SELECT cp.id AS career_id, cp.season, cp.tier, cp.career_seed
    FROM career_profiles cp
    WHERE cp.tier = 3 AND cp.status = 'active'
  LOOP
    SELECT COUNT(*) INTO v_current_count
    FROM career_league_standings
    WHERE career_id = r.career_id AND season = r.season AND tier = 3 AND is_player = FALSE;

    v_needed := 9 - v_current_count;

    IF v_needed > 0 THEN
      PERFORM rpc_generate_career_opponents(r.career_id, 3::SMALLINT, v_needed, r.career_seed + r.season * 100 + 99);

      INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
      SELECT r.career_id, r.season, 3, co.id, FALSE
      FROM career_opponents co
      WHERE co.career_id = r.career_id AND co.tier = 3
        AND co.id NOT IN (
          SELECT ls.opponent_id FROM career_league_standings ls
          WHERE ls.career_id = r.career_id AND ls.season = r.season AND ls.tier = 3 AND ls.opponent_id IS NOT NULL
        )
      ORDER BY co.created_at DESC
      LIMIT v_needed;
    END IF;
  END LOOP;
END $$;
