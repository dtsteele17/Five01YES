-- ============================================================
-- Ensure Proper Tier 2 Structure: 4 League + Tournament + 3 League
-- ============================================================

-- 1. Fix any tier 2 careers that don't have the proper structure
DO $$
DECLARE
    career_record RECORD;
    event_count INT;
    league_count INT;
    tournament_count INT;
    sequence_no INT;
BEGIN
    FOR career_record IN 
        SELECT id, tier, season, week FROM career_profiles 
        WHERE status = 'active' AND tier = 2
    LOOP
        -- Check current event structure
        SELECT COUNT(*) INTO event_count
        FROM career_events
        WHERE career_id = career_record.id AND season = career_record.season;
        
        SELECT COUNT(*) INTO league_count
        FROM career_events
        WHERE career_id = career_record.id AND season = career_record.season AND event_type = 'league';
        
        SELECT COUNT(*) INTO tournament_count
        FROM career_events
        WHERE career_id = career_record.id AND season = career_record.season AND event_type IN ('open', 'qualifier', 'major');
        
        -- If structure is wrong, rebuild it
        IF league_count != 7 OR tournament_count = 0 THEN
            RAISE NOTICE 'Fixing structure for career % (has % leagues, % tournaments)', career_record.id, league_count, tournament_count;
            
            -- Clear existing events for this season (keep matches/standings)
            DELETE FROM career_events 
            WHERE career_id = career_record.id AND season = career_record.season AND status = 'pending';
            
            -- Rebuild proper structure based on templates
            sequence_no := 1;
            
            -- Add 4 initial league events (weeks 1-4)
            FOR i IN 1..4 LOOP
                INSERT INTO career_events (
                    career_id, template_id, season, sequence_no, event_type, 
                    event_name, format_legs, bracket_size, status
                )
                SELECT 
                    career_record.id,
                    (SELECT id FROM career_schedule_templates WHERE tier = 2 AND event_type = 'league' LIMIT 1),
                    career_record.season,
                    sequence_no,
                    'league',
                    'Weekend League Night — Matchday ' || i,
                    3,
                    NULL,
                    CASE WHEN sequence_no <= career_record.week THEN 'completed' ELSE 'pending' END
                FROM career_schedule_templates
                WHERE tier = 2 AND event_type = 'league'
                LIMIT 1;
                
                sequence_no := sequence_no + 1;
            END LOOP;
            
            -- Add tournament (week 5)
            INSERT INTO career_events (
                career_id, template_id, season, sequence_no, event_type, 
                event_name, format_legs, bracket_size, status
            )
            SELECT 
                career_record.id,
                t.id,
                career_record.season,
                sequence_no,
                t.event_type,
                t.event_name,
                t.format_legs,
                t.bracket_size,
                CASE WHEN sequence_no <= career_record.week THEN 'completed' ELSE 'pending' END
            FROM career_schedule_templates t
            WHERE tier = 2 AND event_type IN ('open', 'qualifier')
            ORDER BY sequence_no
            LIMIT 1;
            
            sequence_no := sequence_no + 1;
            
            -- Add 3 final league events (weeks 6-8)
            FOR i IN 5..7 LOOP
                INSERT INTO career_events (
                    career_id, template_id, season, sequence_no, event_type, 
                    event_name, format_legs, bracket_size, status
                )
                SELECT 
                    career_record.id,
                    (SELECT id FROM career_schedule_templates WHERE tier = 2 AND event_type = 'league' LIMIT 1),
                    career_record.season,
                    sequence_no,
                    'league',
                    'Weekend League Night — Matchday ' || i,
                    3,
                    NULL,
                    CASE WHEN sequence_no <= career_record.week THEN 'completed' ELSE 'pending' END
                FROM career_schedule_templates
                WHERE tier = 2 AND event_type = 'league'
                LIMIT 1;
                
                sequence_no := sequence_no + 1;
            END LOOP;
            
            RAISE NOTICE 'Fixed structure: 7 league events + 1 tournament for career %', career_record.id;
        END IF;
    END LOOP;
END $$;

-- 2. Create function to verify tournament schedule timing
CREATE OR REPLACE FUNCTION rpc_verify_tournament_schedule(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_next_event career_events;
  v_event_sequence JSON[] := '{}';
  event_record RECORD;
  v_should_show_tournament BOOLEAN := FALSE;
  v_league_matches_played INT := 0;
BEGIN
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get all events in sequence
  FOR event_record IN
    SELECT sequence_no, event_type, event_name, status, 
           (SELECT COUNT(*) FROM career_matches cm WHERE cm.event_id = ce.id AND cm.result IS NOT NULL) as matches_played
    FROM career_events ce
    WHERE career_id = p_career_id
    ORDER BY sequence_no
  LOOP
    v_event_sequence := v_event_sequence || json_build_object(
      'sequence', event_record.sequence_no,
      'type', event_record.event_type,
      'name', event_record.event_name,
      'status', event_record.status,
      'matches_played', event_record.matches_played
    );
  END LOOP;

  -- Count completed league matches
  SELECT COUNT(*) INTO v_league_matches_played
  FROM career_matches cm
  JOIN career_events ce ON ce.id = cm.event_id
  WHERE cm.career_id = p_career_id 
    AND ce.event_type = 'league' 
    AND cm.result IS NOT NULL;

  -- Tournament should appear after 4 league matches
  v_should_show_tournament := v_league_matches_played >= 4;

  -- Get next pending event
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'pending'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;

  RETURN json_build_object(
    'career_week', v_career.week,
    'league_matches_played', v_league_matches_played,
    'should_show_tournament', v_should_show_tournament,
    'next_event', json_build_object(
      'type', v_next_event.event_type,
      'name', v_next_event.event_name,
      'sequence', v_next_event.sequence_no
    ),
    'full_sequence', array_to_json(v_event_sequence)
  );
END;
$$;

-- 3. Add tournament choice logic to career home RPC 
CREATE OR REPLACE FUNCTION rpc_get_career_home_with_tournament_logic(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_next_event career_events;
  v_next_match career_matches;
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsor JSON;
  v_milestones JSON;
  v_awards JSON;
  v_league_matches_played INT := 0;
  v_should_offer_tournament BOOLEAN := FALSE;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Count completed league matches in current season
  SELECT COUNT(*) INTO v_league_matches_played
  FROM career_matches cm
  JOIN career_events ce ON ce.id = cm.event_id
  WHERE cm.career_id = p_career_id 
    AND ce.event_type = 'league' 
    AND ce.season = v_career.season
    AND cm.result IS NOT NULL;

  -- Tournament choice should appear after 4 league matches
  v_should_offer_tournament := v_league_matches_played >= 4 AND v_career.tier >= 2;

  -- Get next event: prioritize active, then pending
  SELECT ce.* INTO v_next_event 
  FROM career_events ce
  WHERE ce.career_id = p_career_id 
    AND ce.status = 'active'
  ORDER BY ce.sequence_no ASC
  LIMIT 1;
  
  IF v_next_event.id IS NULL THEN
    SELECT ce.* INTO v_next_event 
    FROM career_events ce
    WHERE ce.career_id = p_career_id 
      AND ce.status = 'pending'
    ORDER BY ce.sequence_no ASC
    LIMIT 1;
  END IF;

  -- For league events, get the actual match and opponent
  IF v_next_event.id IS NOT NULL THEN
    SELECT cm.* INTO v_next_match
    FROM career_matches cm
    WHERE cm.event_id = v_next_event.id 
      AND cm.result = 'pending'
    LIMIT 1;
    
    IF v_next_match.id IS NOT NULL THEN
      SELECT co.* INTO v_opponent
      FROM career_opponents co
      WHERE co.id = v_next_match.opponent_id;
    END IF;
  END IF;

  -- Get other data (milestones, sponsors, standings) - same as before
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones 
    WHERE career_id = p_career_id
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
    ORDER BY created_at DESC 
    LIMIT 5
  ) m;

  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
      AND NOT (title ILIKE '%Local Circuit Cup%' AND v_career.tier >= 2)
  ) a;

  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  IF v_career.tier >= 2 THEN
    SELECT json_agg(row_to_json(st) ORDER BY st.points DESC, st.legs_diff DESC) INTO v_standings
    FROM (
      SELECT
        ls.is_player,
        CASE WHEN ls.is_player THEN 'You' ELSE (SELECT o.first_name || ' ' || o.last_name FROM career_opponents o WHERE o.id = ls.opponent_id) END AS name,
        ls.played, ls.won, ls.lost, ls.legs_for, ls.legs_against,
        (ls.legs_for - ls.legs_against) AS legs_diff,
        ls.points, ls.average
      FROM career_league_standings ls
      WHERE ls.career_id = p_career_id AND ls.season = v_career.season AND ls.tier = v_career.tier
    ) st;
  END IF;

  RETURN json_build_object(
    'career', json_build_object(
      'id', v_career.id,
      'tier', v_career.tier,
      'season', v_career.season,
      'week', v_career.week,
      'day', v_career.day,
      'rep', v_career.rep,
      'form', v_career.form,
      'difficulty', v_career.difficulty,
      'premier_league_active', v_career.premier_league_active
    ),
    'next_event', CASE WHEN v_next_event.id IS NOT NULL THEN json_build_object(
      'id', v_next_event.id,
      'event_type', v_next_event.event_type,
      'event_name', v_next_event.event_name,
      'format_legs', v_next_event.format_legs,
      'bracket_size', v_next_event.bracket_size,
      'sequence_no', v_next_event.sequence_no,
      'day', v_next_event.day,
      'tier', v_career.tier,
      'match_id', v_next_match.id,
      'league_opponent_name', CASE WHEN v_opponent.id IS NOT NULL THEN
        COALESCE(v_opponent.first_name || ' ', '') ||
        CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
        COALESCE(v_opponent.last_name, '')
      ELSE NULL END,
      'league_opponent_id', v_opponent.id,
      'should_offer_tournament', v_should_offer_tournament AND v_next_event.event_type IN ('open', 'qualifier', 'major')
    ) ELSE NULL END,
    'league_progress', json_build_object(
      'matches_played', v_league_matches_played,
      'should_show_tournament', v_should_offer_tournament
    ),
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Ensured proper Tier 2 structure: 4 league + tournament + 3 league matches';
END $$;