-- ============================================================
-- FIFA-STYLE CAREER MODE - COMPLETE WORKING SYSTEM
-- One migration with everything working properly
-- ============================================================

-- 1. Add FIFA columns to career_profiles
ALTER TABLE career_profiles 
ADD COLUMN IF NOT EXISTS consecutive_seasons_in_tier2 SMALLINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_sponsor_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sponsor_contract_started_season SMALLINT DEFAULT NULL;

-- 2. Ensure league standings has wins/losses columns
ALTER TABLE career_league_standings 
ADD COLUMN IF NOT EXISTS wins SMALLINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS losses SMALLINT DEFAULT 0;

UPDATE career_league_standings SET wins = 0 WHERE wins IS NULL;
UPDATE career_league_standings SET losses = 0 WHERE losses IS NULL;

-- 3. Create career_emails table
CREATE TABLE IF NOT EXISTS career_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  career_id UUID NOT NULL REFERENCES career_profiles(id) ON DELETE CASCADE,
  season SMALLINT NOT NULL,
  email_type TEXT NOT NULL CHECK (email_type IN (
    'promotion', 'relegation', 'scout_interest', 'sponsor_offer',
    'tournament_invite', 'season_summary', 'milestone'
  )),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS on career_emails
ALTER TABLE career_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_emails_user ON career_emails;
CREATE POLICY career_emails_user ON career_emails FOR ALL USING (
  career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid())
);

-- 4. FIFA-STYLE FUNCTION: Career continue (COMPLETE WORKING VERSION)
CREATE OR REPLACE FUNCTION rpc_career_continue_fifa_style(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_room_id UUID;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get next pending league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event available');
  END IF;

  -- Get or create match for this event
  SELECT * INTO v_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;

  -- If no match exists, create one with a random opponent
  IF v_match.id IS NULL THEN
    -- Find an opponent for league match
    SELECT * INTO v_opponent FROM career_opponents
    WHERE career_id = p_career_id AND tier = v_career.tier
    ORDER BY random()
    LIMIT 1;
    
    IF v_opponent.id IS NULL THEN
      RETURN json_build_object('error', 'No opponents found');
    END IF;

    -- Create the match
    INSERT INTO career_matches (
      career_id, event_id, opponent_id, format_legs, result
    ) VALUES (
      p_career_id, v_event.id, v_opponent.id, 
      CASE WHEN v_career.tier = 3 THEN 5 ELSE 3 END,
      'pending'
    ) RETURNING * INTO v_match;
  ELSE
    -- Get existing opponent
    SELECT * INTO v_opponent FROM career_opponents WHERE id = v_match.opponent_id;
  END IF;

  -- Create or get room ID (proper UUID)
  IF v_match.match_room_id IS NOT NULL THEN
    v_room_id := v_match.match_room_id;
  ELSE
    v_room_id := gen_random_uuid();
    UPDATE career_matches SET match_room_id = v_room_id WHERE id = v_match.id;
  END IF;

  -- Mark event as active
  UPDATE career_events SET status = 'active' WHERE id = v_event.id;

  RETURN json_build_object(
    'success', true,
    'match_id', v_match.id,
    'room_id', v_room_id::TEXT,
    'event', json_build_object(
      'id', v_event.id,
      'name', v_event.event_name || ' (League Match)',
      'format_legs', CASE WHEN v_career.tier = 3 THEN 5 ELSE 3 END,
      'tier', v_career.tier,
      'season', v_career.season
    ),
    'opponent', json_build_object(
      'id', v_opponent.id,
      'name', v_opponent.first_name || ' ' || v_opponent.last_name,
      'skill_rating', v_opponent.skill_rating
    ),
    'bot_config', json_build_object(
      'difficulty', CASE 
        WHEN v_opponent.skill_rating <= 40 THEN 'beginner'
        WHEN v_opponent.skill_rating <= 55 THEN 'casual'
        WHEN v_opponent.skill_rating <= 70 THEN 'intermediate'
        ELSE 'advanced'
      END,
      'average', LEAST(90, GREATEST(30, v_opponent.skill_rating::integer))
    ),
    'career_context', json_build_object(
      'tier_name', CASE 
        WHEN v_career.tier = 2 THEN 'Pub League'
        WHEN v_career.tier = 3 THEN 'County League'
        ELSE 'League'
      END,
      'match_type', 'league'
    )
  );
END;
$$;

-- 5. FIFA-STYLE FUNCTION: Get week fixtures (COMPLETE WORKING VERSION)
CREATE OR REPLACE FUNCTION rpc_fifa_get_week_fixtures(p_career_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_career career_profiles;
  v_event career_events;
  v_match career_matches;
  v_opponent career_opponents;
  v_fixtures JSON[] := '{}';
  v_opponents career_opponents[];
  v_i INTEGER;
BEGIN
  -- Get career
  SELECT * INTO v_career FROM career_profiles 
  WHERE id = p_career_id AND user_id = auth.uid() AND status = 'active';
  IF v_career.id IS NULL THEN
    RETURN json_build_object('error', 'Career not found');
  END IF;

  -- Get current league event
  SELECT * INTO v_event FROM career_events 
  WHERE career_id = p_career_id 
    AND season = v_career.season
    AND event_type = 'league'
    AND status IN ('pending', 'active', 'completed')
  ORDER BY sequence_no ASC 
  LIMIT 1;
  
  IF v_event.id IS NULL THEN
    RETURN json_build_object('error', 'No league event found');
  END IF;

  -- Get or create player match
  SELECT * INTO v_match FROM career_matches 
  WHERE career_id = p_career_id AND event_id = v_event.id;
  
  IF v_match.id IS NOT NULL THEN
    SELECT * INTO v_opponent FROM career_opponents WHERE id = v_match.opponent_id;
    
    -- Add player fixture
    v_fixtures := v_fixtures || json_build_object(
      'id', 'player_match',
      'home_team', 'You',
      'away_team', v_opponent.first_name || ' ' || v_opponent.last_name,
      'home_score', CASE WHEN v_match.result != 'pending' THEN v_match.player_legs_won END,
      'away_score', CASE WHEN v_match.result != 'pending' THEN v_match.opponent_legs_won END,
      'status', CASE WHEN v_match.result = 'pending' THEN 'pending' ELSE 'completed' END,
      'is_player_match', true,
      'event_id', v_event.id,
      'match_id', v_match.id
    );
  END IF;

  -- Add some other fixtures for display
  SELECT ARRAY(
    SELECT co FROM career_opponents co 
    WHERE co.career_id = p_career_id AND co.tier = v_career.tier
    AND (v_opponent.id IS NULL OR co.id != v_opponent.id)
    ORDER BY random() LIMIT 6
  ) INTO v_opponents;
  
  FOR v_i IN 1..LEAST(3, array_length(v_opponents, 1)/2) LOOP
    IF (v_i * 2) <= array_length(v_opponents, 1) THEN
      v_fixtures := v_fixtures || json_build_object(
        'id', 'sim_match_' || v_i,
        'home_team', v_opponents[v_i * 2 - 1].first_name || ' ' || v_opponents[v_i * 2 - 1].last_name,
        'away_team', v_opponents[v_i * 2].first_name || ' ' || v_opponents[v_i * 2].last_name,
        'home_score', CASE WHEN v_match.result != 'pending' THEN 2 + (random())::integer ELSE NULL END,
        'away_score', CASE WHEN v_match.result != 'pending' THEN (random() * 2)::integer ELSE NULL END,
        'status', CASE WHEN v_match.result != 'pending' THEN 'completed' ELSE 'pending' END,
        'is_player_match', false
      );
    END IF;
  END LOOP;

  RETURN json_build_object(
    'week', v_career.week,
    'tier', v_career.tier,
    'season', v_career.season,
    'event_name', v_event.event_name || ' — Week ' || v_career.week,
    'fixtures', v_fixtures
  );
END;
$$;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE '🏆 FIFA-Style Career Complete Working System deployed!';
  RAISE NOTICE '✅ All functions created with proper types';
  RAISE NOTICE '✅ UUID room IDs handled correctly';
  RAISE NOTICE '✅ Career continue should now work perfectly';
END $$;