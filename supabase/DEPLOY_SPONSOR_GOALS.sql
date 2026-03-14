CREATE TABLE IF NOT EXISTS career_sponsor_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES career_sponsor_contracts(id) ON DELETE CASCADE,
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  goal_description TEXT NOT NULL,
  target_value INTEGER NOT NULL DEFAULT 1,
  current_value INTEGER NOT NULL DEFAULT 0,
  fans_reward INTEGER NOT NULL DEFAULT 10,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_goals_career ON career_sponsor_goals(career_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_goals_contract ON career_sponsor_goals(contract_id);

ALTER TABLE career_sponsor_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sponsor goals" ON career_sponsor_goals;
CREATE POLICY "Users can view own sponsor goals" ON career_sponsor_goals
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));


DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'career_sponsor_catalog' AND column_name = 'possible_goals') THEN
    ALTER TABLE career_sponsor_catalog ADD COLUMN possible_goals JSONB DEFAULT '[]'::jsonb;
  END IF;
END $fn$;

UPDATE career_sponsor_catalog SET possible_goals = '[
  {"type": "win_matches", "desc": "Win {n} matches", "target": 3, "reward": 15},
  {"type": "win_matches", "desc": "Win {n} matches", "target": 5, "reward": 25},
  {"type": "checkout_100", "desc": "Hit a 100+ checkout", "target": 1, "reward": 20},
  {"type": "tournament_final", "desc": "Reach a tournament final", "target": 1, "reward": 30},
  {"type": "tournament_win", "desc": "Win a tournament", "target": 1, "reward": 50},
  {"type": "win_streak", "desc": "Win {n} matches in a row", "target": 3, "reward": 25},
  {"type": "season_wins", "desc": "Win {n} matches this season", "target": 7, "reward": 35},
  {"type": "leg_difference", "desc": "Achieve +{n} leg difference", "target": 10, "reward": 20}
]'::jsonb
WHERE possible_goals IS NULL OR possible_goals = '[]'::jsonb;


DROP FUNCTION IF EXISTS rpc_create_sponsor_goals(UUID, UUID);
CREATE OR REPLACE FUNCTION rpc_create_sponsor_goals(
  p_career_id UUID,
  p_contract_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_sponsor career_sponsor_catalog;
  v_contract career_sponsor_contracts;
  v_goals JSONB;
  v_goal JSONB;
  v_picked JSONB[] := ARRAY[]::JSONB[];
  v_i INTEGER;
  v_total INTEGER;
  v_target INTEGER;
  v_desc TEXT;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_contract FROM career_sponsor_contracts WHERE id = p_contract_id AND career_id = p_career_id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Contract not found'); END IF;

  IF EXISTS (SELECT 1 FROM career_sponsor_goals WHERE contract_id = p_contract_id) THEN
    RETURN json_build_object('already_exists', true);
  END IF;

  SELECT * INTO v_sponsor FROM career_sponsor_catalog WHERE id = v_contract.sponsor_id;
  v_goals := COALESCE(v_sponsor.possible_goals, '[]'::jsonb);
  v_total := jsonb_array_length(v_goals);

  IF v_total = 0 THEN
    RETURN json_build_object('error', 'No goals available');
  END IF;

  -- Pick 2 unique goals (no duplicates of same type+target)
  DECLARE
    v_used_types TEXT[] := ARRAY[]::TEXT[];
    v_attempts INT := 0;
    v_key TEXT;
    v_created INT := 0;
  BEGIN
    WHILE v_created < LEAST(2, v_total) AND v_attempts < 20 LOOP
      v_attempts := v_attempts + 1;
      v_goal := v_goals->(floor(random() * v_total)::integer);
      v_key := (v_goal->>'type') || '_' || (v_goal->>'target');
      
      IF NOT (v_key = ANY(v_used_types)) THEN
        v_used_types := array_append(v_used_types, v_key);
        v_target := (v_goal->>'target')::integer;
        v_desc := replace(v_goal->>'desc', '{n}', v_target::text);

        INSERT INTO career_sponsor_goals (contract_id, career_id, goal_type, goal_description, target_value, fans_reward)
        VALUES (p_contract_id, p_career_id, v_goal->>'type', v_desc, v_target, (v_goal->>'reward')::integer);
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END;

  RETURN json_build_object('success', true, 'goals_created', LEAST(2, v_total));
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_create_sponsor_goals(UUID, UUID) TO authenticated;


DROP FUNCTION IF EXISTS rpc_check_sponsor_goals(UUID);
CREATE OR REPLACE FUNCTION rpc_check_sponsor_goals(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_career career_profiles;
  v_goal RECORD;
  v_current INTEGER;
  v_completed_goals JSON[] := ARRAY[]::JSON[];
  v_player_standings RECORD;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN json_build_object('error', 'Career not found'); END IF;

  SELECT * INTO v_player_standings FROM career_league_standings
  WHERE career_id = p_career_id AND season = v_career.season AND is_player = TRUE;

  FOR v_goal IN
    SELECT * FROM career_sponsor_goals
    WHERE career_id = p_career_id AND completed = FALSE
  LOOP
    v_current := 0;

    CASE v_goal.goal_type
      WHEN 'win_matches' THEN
        SELECT COUNT(*) INTO v_current FROM career_matches
        WHERE career_id = p_career_id AND result = 'win'
          AND event_id IN (SELECT id FROM career_events WHERE career_id = p_career_id AND season = v_career.season);

      WHEN 'season_wins' THEN
        SELECT COUNT(*) INTO v_current FROM career_matches
        WHERE career_id = p_career_id AND result = 'win'
          AND event_id IN (SELECT id FROM career_events WHERE career_id = p_career_id AND season = v_career.season);

      WHEN 'checkout_100' THEN
        SELECT COUNT(*) INTO v_current FROM career_matches
        WHERE career_id = p_career_id AND result = 'win'
          AND event_id IN (SELECT id FROM career_events WHERE career_id = p_career_id AND season = v_career.season)
          AND (metadata->>'highest_checkout')::integer >= 100;

      WHEN 'tournament_final' THEN
        SELECT COUNT(*) INTO v_current FROM career_events
        WHERE career_id = p_career_id AND season = v_career.season
          AND event_type = 'open' AND status = 'completed';

      WHEN 'tournament_win' THEN
        SELECT COUNT(*) INTO v_current FROM career_milestones
        WHERE career_id = p_career_id AND season = v_career.season
          AND milestone_type = 'tournament_win';

      WHEN 'win_streak' THEN
        WITH recent AS (
          SELECT result, ROW_NUMBER() OVER (ORDER BY cm.id DESC) AS rn
          FROM career_matches cm
          JOIN career_events ce ON ce.id = cm.event_id
          WHERE cm.career_id = p_career_id AND ce.season = v_career.season
          ORDER BY cm.id DESC
        ),
        streak AS (
          SELECT COUNT(*) AS cnt FROM recent WHERE rn <= (
            SELECT COALESCE(MIN(rn) - 1, (SELECT COUNT(*) FROM recent))
            FROM recent WHERE result != 'win'
          )
        )
        SELECT cnt INTO v_current FROM streak;

      WHEN 'leg_difference' THEN
        v_current := COALESCE(v_player_standings.legs_for - v_player_standings.legs_against, 0);

      ELSE
        v_current := 0;
    END CASE;

    UPDATE career_sponsor_goals SET current_value = v_current WHERE id = v_goal.id;

    IF v_current >= v_goal.target_value AND NOT v_goal.completed THEN
      UPDATE career_sponsor_goals SET completed = TRUE, completed_at = now() WHERE id = v_goal.id;
      UPDATE career_profiles SET rep = rep + v_goal.fans_reward WHERE id = p_career_id;
      v_completed_goals := v_completed_goals || json_build_object(
        'goal_id', v_goal.id,
        'description', v_goal.goal_description,
        'reward', v_goal.fans_reward
      )::json;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'newly_completed', array_to_json(v_completed_goals)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION rpc_check_sponsor_goals(UUID) TO authenticated;
