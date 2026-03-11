UPDATE career_events SET template_id = NULL WHERE template_id IN (SELECT id FROM career_schedule_templates WHERE tier = 4);
DELETE FROM career_schedule_templates WHERE tier = 4;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(4, 1,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 2,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 3,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 4,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 5,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 6,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 7,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 8,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 9,  'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 10, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 11, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 12, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 13, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 14, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}'),
(4, 15, 'league', 'National Tour Match', 'regional_league', 7, NULL, FALSE, '{}');

DO $$
DECLARE
  r RECORD;
  v_current_count INTEGER;
  v_needed INTEGER;
BEGIN
  FOR r IN
    SELECT cp.id AS career_id, cp.season, cp.tier, cp.career_seed
    FROM career_profiles cp
    WHERE cp.tier = 4 AND cp.status = 'active'
  LOOP
    SELECT COUNT(*) INTO v_current_count
    FROM career_league_standings
    WHERE career_id = r.career_id AND season = r.season AND tier = 4 AND is_player = FALSE;

    v_needed := 15 - v_current_count;

    IF v_needed > 0 THEN
      PERFORM rpc_generate_career_opponents(r.career_id, 4::SMALLINT, v_needed, r.career_seed + r.season * 100 + 99);

      INSERT INTO career_league_standings (career_id, season, tier, opponent_id, is_player)
      SELECT r.career_id, r.season, 4, co.id, FALSE
      FROM career_opponents co
      WHERE co.career_id = r.career_id AND co.tier = 4
        AND co.id NOT IN (
          SELECT ls.opponent_id FROM career_league_standings ls
          WHERE ls.career_id = r.career_id AND ls.season = r.season AND ls.tier = 4 AND ls.opponent_id IS NOT NULL
        )
      ORDER BY co.created_at DESC
      LIMIT v_needed;
    END IF;
  END LOOP;
END $$;
