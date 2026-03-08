-- ============================================================
-- ONLINE LEAGUES SYSTEM
-- Full multiplayer league infrastructure
-- ============================================================

-- 1. Extend leagues table
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open' CHECK (status IN ('open','closed','active','completed'));
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS close_date TIMESTAMPTZ;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS max_participants INT DEFAULT 16;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- 2. Extend league_members table
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','kicked','left'));
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS kicked_by UUID REFERENCES auth.users(id);
ALTER TABLE league_members ADD COLUMN IF NOT EXISTS kick_reason TEXT;

-- 3. League fixtures
CREATE TABLE IF NOT EXISTS league_fixtures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  home_user_id UUID NOT NULL REFERENCES auth.users(id),
  away_user_id UUID NOT NULL REFERENCES auth.users(id),
  matchday INT NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','cancelled','forfeit')),
  home_legs_won SMALLINT DEFAULT 0,
  away_legs_won SMALLINT DEFAULT 0,
  match_room_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_fixtures_league ON league_fixtures(league_id);
CREATE INDEX IF NOT EXISTS idx_league_fixtures_users ON league_fixtures(home_user_id, away_user_id);
CREATE INDEX IF NOT EXISTS idx_league_fixtures_schedule ON league_fixtures(scheduled_date, scheduled_time);

-- 4. League standings
CREATE TABLE IF NOT EXISTS league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  played SMALLINT DEFAULT 0,
  won SMALLINT DEFAULT 0,
  lost SMALLINT DEFAULT 0,
  legs_for SMALLINT DEFAULT 0,
  legs_against SMALLINT DEFAULT 0,
  points SMALLINT DEFAULT 0,
  average REAL DEFAULT 0,
  form TEXT DEFAULT '',
  UNIQUE(league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_standings_league ON league_standings(league_id);

-- 5. League warnings
CREATE TABLE IF NOT EXISTS league_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE league_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_warnings ENABLE ROW LEVEL SECURITY;

-- Fixtures: members can read, system writes
CREATE POLICY "league_fixtures_select" ON league_fixtures FOR SELECT
  USING (EXISTS (SELECT 1 FROM league_members WHERE league_id = league_fixtures.league_id AND user_id = auth.uid() AND status = 'active'));

CREATE POLICY "league_fixtures_all" ON league_fixtures FOR ALL
  USING (true) WITH CHECK (true);

-- Standings: anyone can read open/active leagues, system writes
CREATE POLICY "league_standings_select" ON league_standings FOR SELECT USING (true);
CREATE POLICY "league_standings_all" ON league_standings FOR ALL USING (true) WITH CHECK (true);

-- Warnings: member can see own, admin can see all
CREATE POLICY "league_warnings_select" ON league_warnings FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM leagues WHERE id = league_warnings.league_id AND owner_id = auth.uid()));
CREATE POLICY "league_warnings_all" ON league_warnings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: Browse open leagues
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_browse_leagues()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(l))
    FROM (
      SELECT 
        lg.id, lg.name, lg.description, lg.access, lg.status,
        lg.start_date, lg.close_date, lg.max_participants,
        lg.legs_per_game, lg.match_days, lg.match_time, lg.games_per_day,
        lg.playoffs, lg.game_mode, lg.match_format,
        (SELECT username FROM profiles WHERE id = lg.owner_id) AS owner_name,
        (SELECT COUNT(*) FROM league_members WHERE league_id = lg.id AND status = 'active') AS member_count,
        EXISTS(SELECT 1 FROM league_members WHERE league_id = lg.id AND user_id = v_user_id AND status = 'active') AS is_member
      FROM leagues lg
      WHERE lg.status IN ('open', 'active')
      ORDER BY lg.created_at DESC
    ) l
  );
END;
$$;

-- ============================================================
-- RPC: Join a league
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_join_league(p_league_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_league leagues;
  v_member_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = p_league_id;
  IF v_league.id IS NULL THEN
    RETURN json_build_object('error', 'League not found');
  END IF;

  IF v_league.status != 'open' THEN
    RETURN json_build_object('error', 'League registration is closed');
  END IF;

  IF v_league.access = 'invite' THEN
    RETURN json_build_object('error', 'This league is invite-only');
  END IF;

  -- Check if already a member
  IF EXISTS(SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user_id AND status = 'active') THEN
    RETURN json_build_object('error', 'Already a member');
  END IF;

  -- Check max participants
  SELECT COUNT(*) INTO v_member_count FROM league_members WHERE league_id = p_league_id AND status = 'active';
  IF v_member_count >= v_league.max_participants THEN
    RETURN json_build_object('error', 'League is full');
  END IF;

  -- Check close date
  IF v_league.close_date IS NOT NULL AND now() > v_league.close_date THEN
    RETURN json_build_object('error', 'Registration deadline has passed');
  END IF;

  -- Re-join if previously left
  INSERT INTO league_members (league_id, user_id, role, status, joined_at)
  VALUES (p_league_id, v_user_id, 'member', 'active', now())
  ON CONFLICT (league_id, user_id) DO UPDATE SET status = 'active', joined_at = now();

  RETURN json_build_object('success', true, 'message', 'Joined league!');
END;
$$;

-- ============================================================
-- RPC: Leave a league
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_leave_league(p_league_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_member league_members;
BEGIN
  SELECT * INTO v_member FROM league_members WHERE league_id = p_league_id AND user_id = v_user_id;
  IF v_member IS NULL THEN
    RETURN json_build_object('error', 'Not a member');
  END IF;

  IF v_member.role = 'owner' THEN
    RETURN json_build_object('error', 'Owner cannot leave. Transfer ownership or delete the league.');
  END IF;

  UPDATE league_members SET status = 'left' WHERE league_id = p_league_id AND user_id = v_user_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- RPC: Get league details
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_get_league_details(p_league_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league JSON;
  v_standings JSON;
  v_fixtures JSON;
  v_members JSON;
  v_is_member BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  -- League info
  SELECT json_build_object(
    'id', lg.id, 'name', lg.name, 'description', lg.description,
    'status', lg.status, 'access', lg.access, 'owner_id', lg.owner_id,
    'start_date', lg.start_date, 'close_date', lg.close_date,
    'max_participants', lg.max_participants, 'legs_per_game', lg.legs_per_game,
    'match_days', lg.match_days, 'match_time', lg.match_time,
    'games_per_day', lg.games_per_day, 'playoffs', lg.playoffs,
    'game_mode', lg.game_mode, 'match_format', lg.match_format,
    'camera_required', lg.camera_required, 'double_out', lg.double_out,
    'owner_name', (SELECT username FROM profiles WHERE id = lg.owner_id)
  ) INTO v_league FROM leagues lg WHERE lg.id = p_league_id;

  IF v_league IS NULL THEN
    RETURN json_build_object('error', 'League not found');
  END IF;

  v_is_member := EXISTS(SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid() AND status = 'active');
  v_is_owner := EXISTS(SELECT 1 FROM leagues WHERE id = p_league_id AND owner_id = auth.uid());

  -- Standings
  SELECT json_agg(row_to_json(s) ORDER BY s.points DESC, s.leg_diff DESC) INTO v_standings
  FROM (
    SELECT ls.user_id, 
      (SELECT username FROM profiles WHERE id = ls.user_id) AS username,
      ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
      (ls.legs_for - ls.legs_against) AS leg_diff,
      ls.points, ls.average, ls.form
    FROM league_standings ls
    WHERE ls.league_id = p_league_id
  ) s;

  -- Fixtures (next 20 + last 20)
  SELECT json_agg(row_to_json(f)) INTO v_fixtures
  FROM (
    (SELECT lf.id, lf.matchday, lf.scheduled_date, lf.scheduled_time, lf.status,
      lf.home_legs_won, lf.away_legs_won,
      lf.home_user_id, lf.away_user_id,
      (SELECT username FROM profiles WHERE id = lf.home_user_id) AS home_username,
      (SELECT username FROM profiles WHERE id = lf.away_user_id) AS away_username
    FROM league_fixtures lf
    WHERE lf.league_id = p_league_id AND lf.status IN ('scheduled','live')
    ORDER BY lf.scheduled_date ASC, lf.scheduled_time ASC
    LIMIT 20)
    UNION ALL
    (SELECT lf.id, lf.matchday, lf.scheduled_date, lf.scheduled_time, lf.status,
      lf.home_legs_won, lf.away_legs_won,
      lf.home_user_id, lf.away_user_id,
      (SELECT username FROM profiles WHERE id = lf.home_user_id) AS home_username,
      (SELECT username FROM profiles WHERE id = lf.away_user_id) AS away_username
    FROM league_fixtures lf
    WHERE lf.league_id = p_league_id AND lf.status IN ('completed','forfeit')
    ORDER BY lf.completed_at DESC
    LIMIT 20)
  ) f;

  -- Members
  SELECT json_agg(row_to_json(m)) INTO v_members
  FROM (
    SELECT lm.user_id, lm.role, lm.joined_at, lm.status,
      (SELECT username FROM profiles WHERE id = lm.user_id) AS username
    FROM league_members lm
    WHERE lm.league_id = p_league_id
    ORDER BY lm.role = 'owner' DESC, lm.joined_at ASC
  ) m;

  RETURN json_build_object(
    'league', v_league,
    'standings', v_standings,
    'fixtures', v_fixtures,
    'members', v_members,
    'is_member', v_is_member,
    'is_owner', v_is_owner,
    'member_count', (SELECT COUNT(*) FROM league_members WHERE league_id = p_league_id AND status = 'active')
  );
END;
$$;

-- ============================================================
-- RPC: Close registration + generate fixtures
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_close_league(p_league_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_league leagues;
  v_members UUID[];
  v_member_count INT;
  v_matchday INT := 1;
  v_fixture_date DATE;
  v_match_days INT[];
  v_day_idx INT;
  v_games_scheduled INT;
  v_i INT;
  v_j INT;
BEGIN
  SELECT * INTO v_league FROM leagues WHERE id = p_league_id AND owner_id = v_user_id;
  IF v_league.id IS NULL THEN
    RETURN json_build_object('error', 'Not authorized or league not found');
  END IF;

  IF v_league.status != 'open' THEN
    RETURN json_build_object('error', 'League is not in open status');
  END IF;

  -- Get active members
  SELECT ARRAY_AGG(user_id) INTO v_members
  FROM league_members WHERE league_id = p_league_id AND status = 'active';
  v_member_count := array_length(v_members, 1);

  IF v_member_count < 2 THEN
    RETURN json_build_object('error', 'Need at least 2 players to start');
  END IF;

  -- Close registration
  UPDATE leagues SET status = 'closed' WHERE id = p_league_id;

  -- Create standings for all members
  INSERT INTO league_standings (league_id, user_id)
  SELECT p_league_id, unnest(v_members)
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Convert match_days text[] to day-of-week numbers (1=Mon, 7=Sun)
  SELECT ARRAY_AGG(
    CASE d
      WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3
      WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7
      WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
      WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7
    END
  ) INTO v_match_days
  FROM unnest(v_league.match_days) AS d;

  IF v_match_days IS NULL OR array_length(v_match_days, 1) = 0 THEN
    v_match_days := ARRAY[3]; -- Default to Wednesday
  END IF;

  -- Generate round-robin fixtures
  -- Each player plays every other player once
  v_fixture_date := v_league.start_date;
  v_games_scheduled := 0;
  v_matchday := 1;

  -- Find first valid match day on or after start_date
  WHILE EXTRACT(ISODOW FROM v_fixture_date)::INT != ALL(v_match_days) LOOP
    v_fixture_date := v_fixture_date + 1;
    IF v_fixture_date > v_league.start_date + 365 THEN EXIT; END IF;
  END LOOP;

  FOR v_i IN 1..v_member_count LOOP
    FOR v_j IN (v_i + 1)..v_member_count LOOP
      -- Insert fixture
      INSERT INTO league_fixtures (
        league_id, home_user_id, away_user_id, matchday,
        scheduled_date, scheduled_time
      ) VALUES (
        p_league_id, v_members[v_i], v_members[v_j], v_matchday,
        v_fixture_date, v_league.match_time
      );

      v_games_scheduled := v_games_scheduled + 1;

      -- Check if we've hit games_per_day limit
      IF v_games_scheduled >= COALESCE(v_league.games_per_day, 3) THEN
        v_games_scheduled := 0;
        v_matchday := v_matchday + 1;
        
        -- Advance to next valid match day
        v_fixture_date := v_fixture_date + 1;
        WHILE EXTRACT(ISODOW FROM v_fixture_date)::INT != ALL(v_match_days) LOOP
          v_fixture_date := v_fixture_date + 1;
          IF v_fixture_date > v_league.start_date + 365 THEN EXIT; END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'fixtures_created', (SELECT COUNT(*) FROM league_fixtures WHERE league_id = p_league_id),
    'first_match_date', (SELECT MIN(scheduled_date) FROM league_fixtures WHERE league_id = p_league_id)
  );
END;
$$;

-- ============================================================
-- RPC: Complete a league match
-- ============================================================
CREATE OR REPLACE FUNCTION rpc_complete_league_match(
  p_fixture_id UUID,
  p_home_legs SMALLINT,
  p_away_legs SMALLINT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fixture league_fixtures;
  v_league leagues;
  v_home_won BOOLEAN;
BEGIN
  SELECT * INTO v_fixture FROM league_fixtures WHERE id = p_fixture_id;
  IF v_fixture.id IS NULL THEN
    RETURN json_build_object('error', 'Fixture not found');
  END IF;

  IF v_fixture.status = 'completed' THEN
    RETURN json_build_object('error', 'Match already completed');
  END IF;

  SELECT * INTO v_league FROM leagues WHERE id = v_fixture.league_id;
  v_home_won := p_home_legs > p_away_legs;

  -- Update fixture
  UPDATE league_fixtures SET
    status = 'completed',
    home_legs_won = p_home_legs,
    away_legs_won = p_away_legs,
    completed_at = now()
  WHERE id = p_fixture_id;

  -- Update home player standings
  UPDATE league_standings SET
    played = played + 1,
    won = won + CASE WHEN v_home_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN v_home_won THEN 0 ELSE 1 END,
    legs_for = legs_for + p_home_legs,
    legs_against = legs_against + p_away_legs,
    points = points + CASE WHEN v_home_won THEN 2 ELSE 0 END,
    form = LEFT(CASE WHEN v_home_won THEN 'W' ELSE 'L' END || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = v_fixture.home_user_id;

  -- Update away player standings
  UPDATE league_standings SET
    played = played + 1,
    won = won + CASE WHEN v_home_won THEN 0 ELSE 1 END,
    lost = lost + CASE WHEN v_home_won THEN 1 ELSE 0 END,
    legs_for = legs_for + p_away_legs,
    legs_against = legs_against + p_home_legs,
    points = points + CASE WHEN v_home_won THEN 0 ELSE 2 END,
    form = LEFT(CASE WHEN v_home_won THEN 'L' ELSE 'W' END || form, 5)
  WHERE league_id = v_fixture.league_id AND user_id = v_fixture.away_user_id;

  -- Check if all fixtures completed
  IF NOT EXISTS(SELECT 1 FROM league_fixtures WHERE league_id = v_fixture.league_id AND status = 'scheduled') THEN
    UPDATE leagues SET status = 'completed' WHERE id = v_fixture.league_id;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- ADMIN RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_admin_kick_player(p_league_id UUID, p_user_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM leagues WHERE id = p_league_id AND owner_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN json_build_object('error', 'Cannot kick yourself');
  END IF;
  UPDATE league_members SET status = 'kicked', kicked_by = auth.uid(), kick_reason = p_reason
  WHERE league_id = p_league_id AND user_id = p_user_id;
  RETURN json_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION rpc_admin_warn_player(p_league_id UUID, p_user_id UUID, p_reason TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM leagues WHERE id = p_league_id AND owner_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  INSERT INTO league_warnings (league_id, user_id, admin_id, reason)
  VALUES (p_league_id, p_user_id, auth.uid(), p_reason);
  RETURN json_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION rpc_admin_reschedule_fixture(p_fixture_id UUID, p_new_date DATE, p_new_time TIME)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_fixture league_fixtures;
BEGIN
  SELECT * INTO v_fixture FROM league_fixtures WHERE id = p_fixture_id;
  IF NOT EXISTS(SELECT 1 FROM leagues WHERE id = v_fixture.league_id AND owner_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  UPDATE league_fixtures SET scheduled_date = p_new_date, scheduled_time = p_new_time WHERE id = p_fixture_id;
  RETURN json_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION rpc_admin_update_league(p_league_id UUID, p_name TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM leagues WHERE id = p_league_id AND owner_id = auth.uid()) THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;
  UPDATE leagues SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description)
  WHERE id = p_league_id;
  RETURN json_build_object('success', true);
END; $$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION rpc_browse_leagues() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_join_league(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_leave_league(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_league_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_close_league(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_complete_league_match(UUID, SMALLINT, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_kick_player(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_warn_player(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_reschedule_fixture(UUID, DATE, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_admin_update_league(UUID, TEXT, TEXT) TO authenticated;
