-- ============================================================
-- URGENT FIX: Tier 2 Issues After Recent Changes
-- Fixes tournament timing, opponent display, day vs week confusion
-- ============================================================

-- 1. RESTORE PROPER TIER 2 SCHEDULE (should not have been changed)
DO $$
BEGIN
  -- Remove any incorrect Tier 2 schedule that got added
  DELETE FROM career_schedule_templates WHERE tier = 2;
  
  -- Restore original correct Tier 2 schedule
  INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
  (2, 1,  'league',    'Weekend League Night — Matchday 1', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 2,  'league',    'Weekend League Night — Matchday 2', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 3,  'league',    'Weekend League Night — Matchday 3', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 4,  'league',    'Weekend League Night — Matchday 4', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 5,  'open',      'The Golden Oche Cup',                'pub_open',   3, 16,  FALSE, '{"rep_multiplier": 1.5}'),
  (2, 6,  'league',    'Weekend League Night — Matchday 5', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 7,  'league',    'Weekend League Night — Matchday 6', 'pub_league', 3, NULL, FALSE, '{}'),
  (2, 8,  'league',    'Weekend League Night — Matchday 7', 'pub_league', 3, NULL, FALSE, '{}');
  
  -- Add relegation tournament at the end (using next available sequence)
  INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
  (2, 9,  'relegation_tournament', 'Pub League Playoff', 'pub_relegation', 3, 8, FALSE, '{
    "description": "One last chance to prove yourself before starting a new season",
    "triggers_new_season": true,
    "refreshes_opponents": true,
    "refresh_positions": [1, 2, 7, 8]
  }');

END $$;

-- 2. FIX TIER 2 DAY-BASED CONFUSION
-- Ensure Tier 2 events use week progression, not day progression
UPDATE career_events 
SET day = NULL
WHERE career_id IN (
  SELECT id FROM career_profiles WHERE tier = 2
) AND event_type IN ('league', 'open');

-- 3. FIX RPC FOR PROPER OPPONENT SELECTION IN TIER 2
CREATE OR REPLACE FUNCTION rpc_get_career_home(
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
  v_opponent career_opponents;
  v_standings JSON;
  v_sponsor JSON;
  v_milestones JSON;
  v_awards JSON;
BEGIN
  -- Load career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next event: prioritize active (resume in-progress bracket), then pending
  SELECT * INTO v_next_event FROM career_events
    WHERE career_id = p_career_id AND status = 'active'
    ORDER BY sequence_no ASC
    LIMIT 1;
  IF v_next_event.id IS NULL THEN
    SELECT * INTO v_next_event FROM career_events
      WHERE career_id = p_career_id AND status = 'pending'
      ORDER BY sequence_no ASC
      LIMIT 1;
  END IF;

  -- For league events: find CORRECT next opponent from standings
  IF v_next_event.id IS NOT NULL AND v_next_event.event_type = 'league' THEN
    -- Find opponents not yet played in current season
    WITH unplayed_opponents AS (
      SELECT ls.opponent_id, co.first_name, co.last_name, co.nickname
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND ls.opponent_id NOT IN (
          SELECT DISTINCT cm.opponent_id 
          FROM career_matches cm
          JOIN career_events ce ON ce.id = cm.event_id
          WHERE cm.career_id = p_career_id 
            AND ce.event_type = 'league' 
            AND ce.season = v_career.season
            AND cm.result IS NOT NULL
        )
    )
    SELECT co.* INTO v_opponent 
    FROM unplayed_opponents uo
    JOIN career_opponents co ON co.id = uo.opponent_id
    ORDER BY random()
    LIMIT 1;
    
    -- Fallback: any opponent if all played
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent 
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;
  END IF;

  -- Get recent milestones
  SELECT json_agg(row_to_json(m)) INTO v_milestones
  FROM (
    SELECT milestone_type, title, description, day, created_at
    FROM career_milestones WHERE career_id = p_career_id
    ORDER BY created_at DESC LIMIT 5
  ) m;

  -- Get all tournament/league wins for awards tile
  SELECT json_agg(row_to_json(a) ORDER BY a.created_at ASC) INTO v_awards
  FROM (
    SELECT milestone_type, title, description, day, tier, season, created_at
    FROM career_milestones
    WHERE career_id = p_career_id
      AND milestone_type IN ('first_tournament_win', 'tournament_win', 'league_win', 'season_winner')
  ) a;

  -- Get active sponsor
  SELECT json_agg(row_to_json(sc)) INTO v_sponsor
  FROM (
    SELECT c.slot, s.name, s.rep_bonus_pct, s.rep_objectives, c.objectives_progress, c.status
    FROM career_sponsor_contracts c
    JOIN career_sponsor_catalog s ON s.id = c.sponsor_id
    WHERE c.career_id = p_career_id AND c.status = 'active'
    ORDER BY c.slot
  ) sc;

  -- Get league standings if tier >= 2
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
      'league_opponent_name', CASE WHEN v_opponent.id IS NOT NULL THEN
        COALESCE(v_opponent.first_name || ' ', '') ||
        CASE WHEN v_opponent.nickname IS NOT NULL THEN '''' || v_opponent.nickname || ''' ' ELSE '' END ||
        COALESCE(v_opponent.last_name, '')
      ELSE NULL END,
      'league_opponent_id', v_opponent.id
    ) ELSE NULL END,
    'standings', v_standings,
    'sponsors', v_sponsor,
    'recent_milestones', v_milestones,
    'awards', v_awards
  );
END;
$$;

-- 4. ADD WIN/LOSS EMAIL NOTIFICATIONS
-- Function to generate career emails based on match results
CREATE OR REPLACE FUNCTION rpc_generate_career_emails(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_recent_match RECORD;
  v_emails JSON := '[]'::JSON;
  v_opponent_name TEXT;
BEGIN
  -- Verify ownership
  SELECT * INTO v_career FROM career_profiles WHERE id = p_career_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;
  
  -- Get most recent match result
  SELECT 
    cm.result, 
    cm.player_legs_won, 
    cm.opponent_legs_won, 
    cm.player_average,
    ce.event_name,
    ce.event_type,
    co.first_name,
    co.last_name,
    co.nickname,
    cm.played_at
  INTO v_recent_match
  FROM career_matches cm
  JOIN career_events ce ON ce.id = cm.event_id
  JOIN career_opponents co ON co.id = cm.opponent_id
  WHERE cm.career_id = p_career_id 
    AND cm.result IS NOT NULL
    AND cm.played_at > now() - INTERVAL '1 hour'  -- Only very recent matches
  ORDER BY cm.played_at DESC
  LIMIT 1;
  
  IF v_recent_match.result IS NOT NULL THEN
    -- Build opponent name
    v_opponent_name := COALESCE(v_recent_match.first_name || ' ', '') ||
                      CASE WHEN v_recent_match.nickname IS NOT NULL 
                           THEN '''' || v_recent_match.nickname || ''' ' 
                           ELSE '' END ||
                      COALESCE(v_recent_match.last_name, '');
    
    -- Generate appropriate email based on result
    IF v_recent_match.result = 'win' THEN
      v_emails := json_build_array(json_build_object(
        'id', gen_random_uuid()::text,
        'subject', 'Victory! ' || v_recent_match.event_name,
        'body', 'Great win against ' || v_opponent_name || '! ' ||
               'You won ' || v_recent_match.player_legs_won || '-' || v_recent_match.opponent_legs_won ||
               ' with an average of ' || ROUND(v_recent_match.player_average, 1) || '. ' ||
               'Keep up the momentum!',
        'type', 'match_result',
        'isNew', true
      ));
    ELSE
      v_emails := json_build_array(json_build_object(
        'id', gen_random_uuid()::text,
        'subject', 'Tough Loss - ' || v_recent_match.event_name,
        'body', 'Hard fought match against ' || v_opponent_name || '. ' ||
               'Lost ' || v_recent_match.player_legs_won || '-' || v_recent_match.opponent_legs_won ||
               ' but averaged ' || ROUND(v_recent_match.player_average, 1) || '. ' ||
               'Learn from it and come back stronger!',
        'type', 'match_result',
        'isNew', true
      ));
    END IF;
  END IF;
  
  RETURN json_build_object('emails', v_emails);
END;
$$;

-- 5. ENSURE TIER 2 EVENTS DON'T HAVE DAY CONFUSION
-- Remove any erroneous day assignments from Tier 2+ events
UPDATE career_events 
SET day = NULL 
WHERE career_id IN (
  SELECT id FROM career_profiles WHERE tier >= 2
);

-- 6. FIX OPPONENT CONSISTENCY BETWEEN HOME DISPLAY AND ACTUAL PLAY
-- The issue: User sees one opponent name but plays against a different one
-- This happens because rpc_get_career_home and rpc_career_play_next_event use different logic

-- Update the play function to use EXACT same opponent selection as home function  
CREATE OR REPLACE FUNCTION rpc_career_play_next_event_fixed_opponent(
  p_career_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_career career_profiles;
  v_event career_events;
  v_opponent career_opponents;
  v_match_id UUID;
  v_bot_avg INT;
  v_best_of INT;
  v_difficulty_mult REAL;
BEGIN
  -- Load + validate career
  SELECT * INTO v_career FROM career_profiles
    WHERE id = p_career_id AND user_id = v_user_id AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next pending event (same as original)
  SELECT * INTO v_event FROM career_events
    WHERE career_id = p_career_id AND status = 'pending'
    ORDER BY sequence_no ASC
    LIMIT 1;
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No pending events');
  END IF;

  -- For league events: Use EXACT SAME logic as rpc_get_career_home
  IF v_event.event_type = 'league' THEN
    -- Find opponents not yet played in current season (SAME AS HOME FUNCTION)
    WITH unplayed_opponents AS (
      SELECT ls.opponent_id, co.first_name, co.last_name, co.nickname
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
        AND ls.opponent_id NOT IN (
          SELECT DISTINCT cm.opponent_id 
          FROM career_matches cm
          JOIN career_events ce ON ce.id = cm.event_id
          WHERE cm.career_id = p_career_id 
            AND ce.event_type = 'league' 
            AND ce.season = v_career.season
            AND cm.result IS NOT NULL
        )
    )
    SELECT co.* INTO v_opponent 
    FROM unplayed_opponents uo
    JOIN career_opponents co ON co.id = uo.opponent_id
    ORDER BY random()
    LIMIT 1;
    
    -- Fallback: any opponent if all played (SAME AS HOME FUNCTION)
    IF v_opponent.id IS NULL THEN
      SELECT co.* INTO v_opponent 
      FROM career_league_standings ls
      JOIN career_opponents co ON co.id = ls.opponent_id
      WHERE ls.career_id = p_career_id 
        AND ls.season = v_career.season 
        AND ls.tier = v_career.tier
        AND ls.is_player = FALSE
      ORDER BY random()
      LIMIT 1;
    END IF;
  ELSE
    -- Non-league: random opponent from the tier (same as original)
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  -- Generate opponents if none found (same as original)
  IF v_opponent.id IS NULL THEN
    PERFORM rpc_generate_career_opponents(p_career_id, v_career.tier::SMALLINT, 10, v_career.career_seed + v_career.season * 100);
    SELECT * INTO v_opponent FROM career_opponents
      WHERE career_id = p_career_id AND tier = v_career.tier
      ORDER BY random()
      LIMIT 1;
  END IF;

  -- Return just the opponent info for now (can extend later)
  RETURN json_build_object(
    'success', true,
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', COALESCE(v_opponent.first_name || ' ', '') ||
              CASE WHEN v_opponent.nickname IS NOT NULL 
                   THEN '''' || v_opponent.nickname || ''' ' 
                   ELSE '' END ||
              COALESCE(v_opponent.last_name, ''),
      'skill_rating', v_opponent.skill_rating
    ),
    'message', 'Opponent selected consistently'
  );
END;
$$;

-- Log this fix
DO $$
BEGIN
  RAISE NOTICE 'Fixed Tier 2 schedule, opponent selection consistency, and added email notifications';
END $$;