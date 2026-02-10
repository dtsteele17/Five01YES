/*
  # Create Dartbot Match System
  
  ## Overview
  This migration creates a complete dartbot match system that mirrors the quick match
  functionality, supporting both 301 and 501 game modes with configurable best-of legs.
  
  ## New Tables
  
  ### `dartbot_match_rooms`
  - Mirrors `match_rooms` structure for dartbot-specific matches
  - `id` (uuid, primary key) - Unique room identifier
  - `player_id` (uuid) - The human player
  - `dartbot_level` (integer) - Bot difficulty 1-5
  - `game_mode` (integer) - 301 or 501
  - `match_format` (text) - best-of-1, best-of-3, best-of-5, best-of-7, best-of-9
  - `double_out` (boolean) - Double out rule
  - `status` (text) - active, finished, forfeited
  - `current_leg` (integer) - Current leg number
  - `legs_to_win` (integer) - Legs needed to win match
  - `player_legs` (integer) - Legs won by player
  - `dartbot_legs` (integer) - Legs won by dartbot
  - `player_remaining` (integer) - Player's current score
  - `dartbot_remaining` (integer) - Dartbot's current score
  - `current_turn` (text) - 'player' or 'dartbot'
  - `winner_id` (uuid) - Winner (player_id or 'dartbot')
  - First 9 tracking for both players
  - Timestamps

  ### `dartbot_visits`
  - Mirrors `quick_match_visits` for detailed visit tracking
  - `id` (uuid, primary key)
  - `room_id` (uuid) - Reference to dartbot_match_rooms
  - `leg` (integer) - Leg number
  - `turn_no` (integer) - Turn sequence
  - `player_type` (text) - 'player' or 'dartbot'
  - `score` (integer) - Score achieved (0-180)
  - `is_bust` (boolean)
  - `is_checkout` (boolean)
  - `darts_thrown` (integer) - Usually 3, can be less on checkout
  - `darts_at_double` (integer) - For checkout percentage
  - `darts` (jsonb) - Array of individual dart details
  - `remaining_before` (integer)
  - `remaining_after` (integer)
  - `bust_reason` (text)

  ### `dartbot_match_rematches`
  - Mirrors `match_rematches` for rematch functionality

  ## Security
  - Enable RLS on all tables
  - Users can only access their own dartbot matches

  ## Stats Integration
  - On match completion, records to `match_history` with match_format = 'dartbot'
  - Updates `player_stats` via existing stats functions
*/

-- ============================================================
-- 1. DARTBOT MATCH ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS dartbot_match_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dartbot_level integer NOT NULL CHECK (dartbot_level >= 1 AND dartbot_level <= 5),
  game_mode integer NOT NULL CHECK (game_mode IN (301, 501)),
  match_format text NOT NULL CHECK (match_format IN ('best-of-1', 'best-of-3', 'best-of-5', 'best-of-7', 'best-of-9')),
  double_out boolean NOT NULL DEFAULT true,
  
  -- Match state
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'forfeited')),
  current_leg integer NOT NULL DEFAULT 1,
  legs_to_win integer NOT NULL DEFAULT 1,
  
  -- Leg scores
  player_legs integer NOT NULL DEFAULT 0,
  dartbot_legs integer NOT NULL DEFAULT 0,
  
  -- Current scores
  player_remaining integer NOT NULL DEFAULT 501,
  dartbot_remaining integer NOT NULL DEFAULT 501,
  
  -- Turn management
  current_turn text NOT NULL DEFAULT 'player' CHECK (current_turn IN ('player', 'dartbot')),
  winner_id uuid, -- null = dartbot won, player_id = player won
  
  -- First 9 tracking for player
  player_first9_score integer NOT NULL DEFAULT 0,
  player_first9_darts integer NOT NULL DEFAULT 0,
  
  -- First 9 tracking for dartbot
  dartbot_first9_score integer NOT NULL DEFAULT 0,
  dartbot_first9_darts integer NOT NULL DEFAULT 0,
  
  -- Match summary JSON for quick stats access
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dartbot_match_rooms_player_id ON dartbot_match_rooms(player_id);
CREATE INDEX IF NOT EXISTS idx_dartbot_match_rooms_status ON dartbot_match_rooms(status);
CREATE INDEX IF NOT EXISTS idx_dartbot_match_rooms_created_at ON dartbot_match_rooms(created_at DESC);

-- Enable RLS
ALTER TABLE dartbot_match_rooms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own dartbot matches" ON dartbot_match_rooms;
CREATE POLICY "Users can view their own dartbot matches"
  ON dartbot_match_rooms FOR SELECT
  TO authenticated
  USING (player_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own dartbot matches" ON dartbot_match_rooms;
CREATE POLICY "Users can create their own dartbot matches"
  ON dartbot_match_rooms FOR INSERT
  TO authenticated
  WITH CHECK (player_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own active dartbot matches" ON dartbot_match_rooms;
CREATE POLICY "Users can update their own active dartbot matches"
  ON dartbot_match_rooms FOR UPDATE
  TO authenticated
  USING (player_id = auth.uid() AND status = 'active')
  WITH CHECK (player_id = auth.uid());

-- ============================================================
-- 2. DARTBOT VISITS (DETAILED SCORING)
-- ============================================================

CREATE TABLE IF NOT EXISTS dartbot_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES dartbot_match_rooms(id) ON DELETE CASCADE,
  leg integer NOT NULL,
  turn_no integer NOT NULL,
  player_type text NOT NULL CHECK (player_type IN ('player', 'dartbot')),
  
  -- Score details
  score integer NOT NULL CHECK (score >= 0 AND score <= 180),
  remaining_before integer NOT NULL,
  remaining_after integer NOT NULL,
  
  -- Bust and checkout tracking
  is_bust boolean NOT NULL DEFAULT false,
  is_checkout boolean NOT NULL DEFAULT false,
  bust_reason text,
  
  -- Dart details
  darts_thrown integer NOT NULL DEFAULT 3 CHECK (darts_thrown >= 0 AND darts_thrown <= 3),
  darts_at_double integer NOT NULL DEFAULT 0 CHECK (darts_at_double >= 0 AND darts_at_double <= 3),
  darts jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of {segment, ring, value}
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dartbot_visits_room_id ON dartbot_visits(room_id);
CREATE INDEX IF NOT EXISTS idx_dartbot_visits_room_leg ON dartbot_visits(room_id, leg);
CREATE INDEX IF NOT EXISTS idx_dartbot_visits_player_type ON dartbot_visits(player_type);

-- Enable RLS
ALTER TABLE dartbot_visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view visits from their dartbot matches" ON dartbot_visits;
CREATE POLICY "Users can view visits from their dartbot matches"
  ON dartbot_visits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dartbot_match_rooms
      WHERE dartbot_match_rooms.id = dartbot_visits.room_id
      AND dartbot_match_rooms.player_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert visits to their dartbot matches" ON dartbot_visits;
CREATE POLICY "Users can insert visits to their dartbot matches"
  ON dartbot_visits FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dartbot_match_rooms
      WHERE dartbot_match_rooms.id = dartbot_visits.room_id
      AND dartbot_match_rooms.player_id = auth.uid()
      AND dartbot_match_rooms.status = 'active'
    )
  );

-- ============================================================
-- 3. DARTBOT MATCH REMATCHES
-- ============================================================

CREATE TABLE IF NOT EXISTS dartbot_match_rematches (
  old_room_id uuid PRIMARY KEY REFERENCES dartbot_match_rooms(id) ON DELETE CASCADE,
  player_ready boolean NOT NULL DEFAULT false,
  new_room_id uuid REFERENCES dartbot_match_rooms(id),
  start_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dartbot_rematches_new_room ON dartbot_match_rematches(new_room_id);

ALTER TABLE dartbot_match_rematches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their dartbot rematches" ON dartbot_match_rematches;
CREATE POLICY "Users can manage their dartbot rematches"
  ON dartbot_match_rematches FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dartbot_match_rooms
      WHERE dartbot_match_rooms.id = dartbot_match_rematches.old_room_id
      AND dartbot_match_rooms.player_id = auth.uid()
    )
  );

-- ============================================================
-- 4. HELPER FUNCTION: Calculate legs to win
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_dartbot_legs_to_win(match_format text)
RETURNS integer AS $$
BEGIN
  CASE match_format
    WHEN 'best-of-1' THEN RETURN 1;
    WHEN 'best-of-3' THEN RETURN 2;
    WHEN 'best-of-5' THEN RETURN 3;
    WHEN 'best-of-7' THEN RETURN 4;
    WHEN 'best-of-9' THEN RETURN 5;
    ELSE RETURN 1;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 5. RPC: Create Dartbot Match
-- ============================================================

CREATE OR REPLACE FUNCTION create_dartbot_match(
  p_dartbot_level integer,
  p_game_mode integer,
  p_match_format text,
  p_double_out boolean DEFAULT true
)
RETURNS jsonb AS $$
DECLARE
  v_room_id uuid;
  v_legs_to_win integer;
BEGIN
  -- Calculate legs to win
  v_legs_to_win := calculate_dartbot_legs_to_win(p_match_format);
  
  -- Create the match room
  INSERT INTO dartbot_match_rooms (
    player_id,
    dartbot_level,
    game_mode,
    match_format,
    double_out,
    legs_to_win,
    player_remaining,
    dartbot_remaining,
    summary
  ) VALUES (
    auth.uid(),
    p_dartbot_level,
    p_game_mode,
    p_match_format,
    p_double_out,
    v_legs_to_win,
    p_game_mode,
    p_game_mode,
    jsonb_build_object(
      'player_legs', 0,
      'dartbot_legs', 0,
      'current_leg', 1,
      'dartbot_level', p_dartbot_level
    )
  )
  RETURNING id INTO v_room_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'player_id', auth.uid(),
    'dartbot_level', p_dartbot_level,
    'game_mode', p_game_mode,
    'match_format', p_match_format,
    'double_out', p_double_out,
    'legs_to_win', v_legs_to_win,
    'player_remaining', p_game_mode,
    'dartbot_remaining', p_game_mode,
    'current_turn', 'player'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RPC: Submit Dartbot Visit
-- ============================================================

CREATE OR REPLACE FUNCTION submit_dartbot_visit(
  p_room_id uuid,
  p_player_type text, -- 'player' or 'dartbot'
  p_score integer,
  p_remaining_after integer,
  p_is_bust boolean DEFAULT false,
  p_is_checkout boolean DEFAULT false,
  p_darts_thrown integer DEFAULT 3,
  p_darts_at_double integer DEFAULT 0,
  p_darts jsonb DEFAULT '[]'::jsonb,
  p_bust_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_room dartbot_match_rooms%ROWTYPE;
  v_turn_no integer;
  v_remaining_before integer;
  v_leg_won boolean := false;
  v_match_won boolean := false;
  v_winner_id uuid := NULL;
  v_response jsonb;
BEGIN
  -- Get current room state
  SELECT * INTO v_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id AND player_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_room.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not active');
  END IF;
  
  -- Verify it's the correct player's turn
  IF v_room.current_turn != p_player_type THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your turn');
  END IF;
  
  -- Determine remaining_before based on player type
  IF p_player_type = 'player' THEN
    v_remaining_before := v_room.player_remaining;
  ELSE
    v_remaining_before := v_room.dartbot_remaining;
  END IF;
  
  -- Get next turn number for this leg
  SELECT COALESCE(MAX(turn_no), 0) + 1 INTO v_turn_no
  FROM dartbot_visits
  WHERE room_id = p_room_id AND leg = v_room.current_leg;
  
  -- Record the visit
  INSERT INTO dartbot_visits (
    room_id,
    leg,
    turn_no,
    player_type,
    score,
    remaining_before,
    remaining_after,
    is_bust,
    is_checkout,
    darts_thrown,
    darts_at_double,
    darts,
    bust_reason
  ) VALUES (
    p_room_id,
    v_room.current_leg,
    v_turn_no,
    p_player_type,
    p_score,
    v_remaining_before,
    p_remaining_after,
    p_is_bust,
    p_is_checkout,
    p_darts_thrown,
    p_darts_at_double,
    p_darts,
    p_bust_reason
  );
  
  -- Update room state
  IF p_is_bust THEN
    -- Score remains the same on bust
    IF p_player_type = 'player' THEN
      UPDATE dartbot_match_rooms 
      SET current_turn = 'dartbot',
          updated_at = now()
      WHERE id = p_room_id;
    ELSE
      UPDATE dartbot_match_rooms 
      SET current_turn = 'player',
          updated_at = now()
      WHERE id = p_room_id;
    END IF;
  ELSIF p_is_checkout THEN
    -- Leg won
    v_leg_won := true;
    
    IF p_player_type = 'player' THEN
      -- Player won the leg
      UPDATE dartbot_match_rooms 
      SET player_legs = player_legs + 1,
          player_remaining = 0,
          current_turn = 'player', -- Winner starts next leg
          updated_at = now()
      WHERE id = p_room_id
      RETURNING * INTO v_room;
      
      -- Check if match is won
      IF v_room.player_legs + 1 >= v_room.legs_to_win THEN
        v_match_won := true;
        v_winner_id := auth.uid();
      END IF;
    ELSE
      -- Dartbot won the leg
      UPDATE dartbot_match_rooms 
      SET dartbot_legs = dartbot_legs + 1,
          dartbot_remaining = 0,
          current_turn = 'dartbot', -- Winner starts next leg
          updated_at = now()
      WHERE id = p_room_id
      RETURNING * INTO v_room;
      
      -- Check if match is won
      IF v_room.dartbot_legs + 1 >= v_room.legs_to_win THEN
        v_match_won := true;
        v_winner_id := NULL; -- NULL means dartbot won
      END IF;
    END IF;
    
    -- Start new leg if match not won
    IF NOT v_match_won THEN
      UPDATE dartbot_match_rooms 
      SET current_leg = current_leg + 1,
          player_remaining = game_mode,
          dartbot_remaining = game_mode,
          player_first9_score = 0,
          player_first9_darts = 0,
          dartbot_first9_score = 0,
          dartbot_first9_darts = 0
      WHERE id = p_room_id;
    END IF;
  ELSE
    -- Normal score update
    IF p_player_type = 'player' THEN
      -- Update first 9 tracking if applicable
      IF v_room.player_first9_darts < 9 THEN
        UPDATE dartbot_match_rooms 
        SET player_remaining = p_remaining_after,
            player_first9_score = player_first9_score + p_score,
            player_first9_darts = LEAST(player_first9_darts + 3, 9),
            current_turn = 'dartbot',
            updated_at = now()
        WHERE id = p_room_id;
      ELSE
        UPDATE dartbot_match_rooms 
        SET player_remaining = p_remaining_after,
            current_turn = 'dartbot',
            updated_at = now()
        WHERE id = p_room_id;
      END IF;
    ELSE
      -- Dartbot turn
      IF v_room.dartbot_first9_darts < 9 THEN
        UPDATE dartbot_match_rooms 
        SET dartbot_remaining = p_remaining_after,
            dartbot_first9_score = dartbot_first9_score + p_score,
            dartbot_first9_darts = LEAST(dartbot_first9_darts + 3, 9),
            current_turn = 'player',
            updated_at = now()
        WHERE id = p_room_id;
      ELSE
        UPDATE dartbot_match_rooms 
        SET dartbot_remaining = p_remaining_after,
            current_turn = 'player',
            updated_at = now()
        WHERE id = p_room_id;
      END IF;
    END IF;
  END IF;
  
  -- Build response
  SELECT * INTO v_room FROM dartbot_match_rooms WHERE id = p_room_id;
  
  v_response := jsonb_build_object(
    'success', true,
    'visit_recorded', true,
    'leg_won', v_leg_won,
    'match_won', v_match_won,
    'winner_id', v_winner_id,
    'room_state', jsonb_build_object(
      'id', v_room.id,
      'status', v_room.status,
      'current_leg', v_room.current_leg,
      'player_legs', v_room.player_legs,
      'dartbot_legs', v_room.dartbot_legs,
      'player_remaining', v_room.player_remaining,
      'dartbot_remaining', v_room.dartbot_remaining,
      'current_turn', v_room.current_turn,
      'game_mode', v_room.game_mode,
      'legs_to_win', v_room.legs_to_win
    )
  );
  
  -- If match won, finalize it
  IF v_match_won THEN
    PERFORM finalize_dartbot_match(p_room_id, v_winner_id);
    v_response := v_response || jsonb_build_object('match_finalized', true);
  END IF;
  
  RETURN v_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RPC: Finalize Dartbot Match (Internal/Stats Recording)
-- ============================================================

CREATE OR REPLACE FUNCTION finalize_dartbot_match(
  p_room_id uuid,
  p_winner_id uuid
)
RETURNS void AS $$
DECLARE
  v_room dartbot_match_rooms%ROWTYPE;
  v_player_stats record;
  v_dartbot_visits record;
  v_player_first9_avg numeric;
  v_dartbot_first9_avg numeric;
BEGIN
  -- Get room data
  SELECT * INTO v_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND OR v_room.status != 'active' THEN
    RETURN;
  END IF;
  
  -- Calculate player first 9 average
  IF v_room.player_first9_darts > 0 THEN
    v_player_first9_avg := ROUND((v_room.player_first9_score::numeric / v_room.player_first9_darts) * 3, 2);
  ELSE
    v_player_first9_avg := 0;
  END IF;
  
  -- Calculate dartbot first 9 average
  IF v_room.dartbot_first9_darts > 0 THEN
    v_dartbot_first9_avg := ROUND((v_room.dartbot_first9_score::numeric / v_room.dartbot_first9_darts) * 3, 2);
  ELSE
    v_dartbot_first9_avg := 0;
  END IF;
  
  -- Aggregate player stats from visits
  SELECT 
    COUNT(*) as total_visits,
    COALESCE(SUM(score), 0) as total_score,
    COALESCE(SUM(darts_thrown), 0) as total_darts,
    COALESCE(SUM(CASE WHEN is_bust THEN 0 ELSE score END), 0) as valid_score,
    COALESCE(SUM(CASE WHEN is_bust THEN 0 ELSE darts_thrown END), 0) as valid_darts,
    COALESCE(MAX(CASE WHEN is_bust THEN 0 ELSE score END), 0) as highest_score,
    COALESCE(SUM(CASE WHEN is_checkout THEN score ELSE 0 END), 0) as highest_checkout,
    COALESCE(SUM(CASE WHEN score >= 100 THEN 1 ELSE 0 END), 0) as count_100_plus,
    COALESCE(SUM(CASE WHEN score >= 140 THEN 1 ELSE 0 END), 0) as count_140_plus,
    COALESCE(SUM(CASE WHEN score = 180 THEN 1 ELSE 0 END), 0) as count_180,
    COALESCE(SUM(CASE WHEN is_checkout THEN 1 ELSE 0 END), 0) as checkouts_made,
    COALESCE(SUM(CASE WHEN remaining_before <= 170 AND remaining_before > 0 THEN 1 ELSE 0 END), 0) as checkout_attempts
  INTO v_player_stats
  FROM dartbot_visits
  WHERE room_id = p_room_id 
    AND player_type = 'player'
    AND is_bust = false;
  
  -- Update room to finished
  UPDATE dartbot_match_rooms 
  SET status = 'finished',
      winner_id = p_winner_id,
      completed_at = now(),
      summary = jsonb_build_object(
        'player_legs', v_room.player_legs,
        'dartbot_legs', v_room.dartbot_legs,
        'winner', CASE WHEN p_winner_id = v_room.player_id THEN 'player' ELSE 'dartbot' END,
        'player_first9_avg', v_player_first9_avg,
        'dartbot_first9_avg', v_dartbot_first9_avg,
        'player_highest_score', v_player_stats.highest_score,
        'player_180s', v_player_stats.count_180,
        'total_darts', v_player_stats.total_darts,
        'game_mode', v_room.game_mode,
        'dartbot_level', v_room.dartbot_level
      )
  WHERE id = p_room_id;
  
  -- Record to match_history for stats filtering
  INSERT INTO match_history (
    room_id,
    user_id,
    opponent_id,
    game_mode,
    match_format,
    result,
    legs_won,
    legs_lost,
    three_dart_avg,
    first9_avg,
    highest_checkout,
    checkout_percentage,
    darts_thrown,
    total_score,
    total_checkouts,
    checkout_attempts,
    visits_100_plus,
    visits_140_plus,
    visits_180,
    played_at
  ) VALUES (
    p_room_id,
    v_room.player_id,
    NULL, -- No opponent_id for dartbot (it's a bot)
    v_room.game_mode,
    'dartbot', -- This is the key filter value
    CASE WHEN p_winner_id = v_room.player_id THEN 'win' ELSE 'loss' END,
    v_room.player_legs,
    v_room.dartbot_legs,
    CASE 
      WHEN v_player_stats.valid_darts > 0 
      THEN ROUND((v_player_stats.valid_score::numeric / v_player_stats.valid_darts) * 3, 2)
      ELSE 0 
    END,
    v_player_first9_avg,
    v_player_stats.highest_checkout,
    CASE 
      WHEN v_player_stats.checkout_attempts > 0 
      THEN ROUND((v_player_stats.checkouts_made::numeric / v_player_stats.checkout_attempts) * 100, 2)
      ELSE 0 
    END,
    v_player_stats.total_darts,
    v_player_stats.total_score,
    v_player_stats.checkouts_made,
    v_player_stats.checkout_attempts,
    v_player_stats.count_100_plus,
    v_player_stats.count_140_plus,
    v_player_stats.count_180,
    now()
  );
  
  -- Update player_stats aggregate table
  PERFORM update_player_stats_from_dartbot(
    v_room.player_id,
    v_room.game_mode,
    CASE WHEN p_winner_id = v_room.player_id THEN 'win' ELSE 'loss' END,
    v_player_stats.total_darts,
    v_player_stats.valid_score,
    v_player_stats.count_100_plus,
    v_player_stats.count_140_plus,
    v_player_stats.count_180,
    v_player_stats.checkouts_made,
    v_player_stats.checkout_attempts,
    v_player_stats.highest_checkout
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. RPC: Update Player Stats from Dartbot Match
-- ============================================================

CREATE OR REPLACE FUNCTION update_player_stats_from_dartbot(
  p_user_id uuid,
  p_game_mode integer,
  p_result text,
  p_darts_thrown integer,
  p_total_score integer,
  p_count_100_plus integer,
  p_count_140_plus integer,
  p_count_180 integer,
  p_checkouts_made integer,
  p_checkout_attempts integer,
  p_highest_checkout integer
)
RETURNS void AS $$
DECLARE
  v_current player_stats%ROWTYPE;
  v_new_avg numeric;
  v_new_first9_avg numeric;
BEGIN
  -- Get or create player stats
  SELECT * INTO v_current
  FROM player_stats
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    INSERT INTO player_stats (user_id) VALUES (p_user_id);
    SELECT * INTO v_current FROM player_stats WHERE user_id = p_user_id;
  END IF;
  
  -- Calculate new 3-dart average (cumulative)
  IF (v_current.total_darts_thrown + p_darts_thrown) > 0 THEN
    v_new_avg := ROUND(
      ((v_current.total_score + p_total_score)::numeric / 
       (v_current.total_darts_thrown + p_darts_thrown)) * 3, 
      2
    );
  ELSE
    v_new_avg := 0;
  END IF;
  
  -- Update player_stats
  UPDATE player_stats
  SET 
    total_matches = total_matches + 1,
    wins = CASE WHEN p_result = 'win' THEN wins + 1 ELSE wins END,
    losses = CASE WHEN p_result = 'loss' THEN losses + 1 ELSE losses END,
    matches_301 = CASE WHEN p_game_mode = 301 THEN matches_301 + 1 ELSE matches_301 END,
    matches_501 = CASE WHEN p_game_mode = 501 THEN matches_501 + 1 ELSE matches_501 END,
    total_darts_thrown = total_darts_thrown + p_darts_thrown,
    total_score = total_score + p_total_score,
    overall_3dart_avg = v_new_avg,
    highest_checkout = GREATEST(highest_checkout, p_highest_checkout),
    total_checkouts = total_checkouts + p_checkouts_made,
    checkout_attempts = checkout_attempts + p_checkout_attempts,
    checkout_percentage = CASE 
      WHEN (checkout_attempts + p_checkout_attempts) > 0 
      THEN ROUND(((total_checkouts + p_checkouts_made)::numeric / 
                  (checkout_attempts + p_checkout_attempts)) * 100, 2)
      ELSE 0 
    END,
    visits_100_plus = visits_100_plus + p_count_100_plus,
    visits_140_plus = visits_140_plus + p_count_140_plus,
    visits_180 = visits_180 + p_count_180,
    updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. RPC: Forfeit Dartbot Match
-- ============================================================

CREATE OR REPLACE FUNCTION forfeit_dartbot_match(p_room_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_room dartbot_match_rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id AND player_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  IF v_room.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match is not active');
  END IF;
  
  -- Record forfeit and finalize (dartbot wins)
  UPDATE dartbot_match_rooms 
  SET status = 'forfeited',
      winner_id = NULL, -- NULL means dartbot won
      completed_at = now()
  WHERE id = p_room_id;
  
  -- Record stats (loss by forfeit)
  PERFORM finalize_dartbot_match(p_room_id, NULL);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match forfeited',
    'winner', 'dartbot'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. RPC: Get Dartbot Match State
-- ============================================================

CREATE OR REPLACE FUNCTION get_dartbot_match(p_room_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_room dartbot_match_rooms%ROWTYPE;
  v_visits jsonb;
BEGIN
  SELECT * INTO v_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id AND player_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Get visit history
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', dv.id,
      'leg', dv.leg,
      'turn_no', dv.turn_no,
      'player_type', dv.player_type,
      'score', dv.score,
      'remaining_after', dv.remaining_after,
      'is_bust', dv.is_bust,
      'is_checkout', dv.is_checkout,
      'darts', dv.darts,
      'created_at', dv.created_at
    ) ORDER BY dv.leg, dv.turn_no
  ) INTO v_visits
  FROM dartbot_visits dv
  WHERE dv.room_id = p_room_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'match', jsonb_build_object(
      'id', v_room.id,
      'player_id', v_room.player_id,
      'dartbot_level', v_room.dartbot_level,
      'game_mode', v_room.game_mode,
      'match_format', v_room.match_format,
      'double_out', v_room.double_out,
      'status', v_room.status,
      'current_leg', v_room.current_leg,
      'legs_to_win', v_room.legs_to_win,
      'player_legs', v_room.player_legs,
      'dartbot_legs', v_room.dartbot_legs,
      'player_remaining', v_room.player_remaining,
      'dartbot_remaining', v_room.dartbot_remaining,
      'current_turn', v_room.current_turn,
      'winner_id', v_room.winner_id,
      'player_first9_score', v_room.player_first9_score,
      'player_first9_darts', v_room.player_first9_darts,
      'dartbot_first9_score', v_room.dartbot_first9_score,
      'dartbot_first9_darts', v_room.dartbot_first9_darts,
      'summary', v_room.summary,
      'created_at', v_room.created_at,
      'completed_at', v_room.completed_at
    ),
    'visits', COALESCE(v_visits, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. RPC: Request Dartbot Rematch
-- ============================================================

CREATE OR REPLACE FUNCTION request_dartbot_rematch(p_room_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_old_room dartbot_match_rooms%ROWTYPE;
  v_new_room_id uuid;
BEGIN
  SELECT * INTO v_old_room
  FROM dartbot_match_rooms
  WHERE id = p_room_id AND player_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Match not found');
  END IF;
  
  -- Create new match with same settings
  INSERT INTO dartbot_match_rooms (
    player_id,
    dartbot_level,
    game_mode,
    match_format,
    double_out,
    legs_to_win,
    player_remaining,
    dartbot_remaining,
    summary
  ) VALUES (
    auth.uid(),
    v_old_room.dartbot_level,
    v_old_room.game_mode,
    v_old_room.match_format,
    v_old_room.double_out,
    v_old_room.legs_to_win,
    v_old_room.game_mode,
    v_old_room.game_mode,
    jsonb_build_object(
      'player_legs', 0,
      'dartbot_legs', 0,
      'current_leg', 1,
      'dartbot_level', v_old_room.dartbot_level,
      'rematch_from', p_room_id
    )
  )
  RETURNING id INTO v_new_room_id;
  
  -- Record rematch relationship
  INSERT INTO dartbot_match_rematches (old_room_id, player_ready, new_room_id, start_at)
  VALUES (p_room_id, true, v_new_room_id, now())
  ON CONFLICT (old_room_id) 
  DO UPDATE SET 
    new_room_id = v_new_room_id,
    player_ready = true,
    start_at = now(),
    updated_at = now();
  
  RETURN jsonb_build_object(
    'success', true,
    'new_room_id', v_new_room_id,
    'settings', jsonb_build_object(
      'dartbot_level', v_old_room.dartbot_level,
      'game_mode', v_old_room.game_mode,
      'match_format', v_old_room.match_format,
      'double_out', v_old_room.double_out
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. RPC: Get Player's Dartbot Match History
-- ============================================================

CREATE OR REPLACE FUNCTION get_dartbot_match_history(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
  v_matches jsonb;
  v_total integer;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM dartbot_match_rooms
  WHERE player_id = auth.uid() AND status IN ('finished', 'forfeited');
  
  -- Get matches
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', dmr.id,
      'dartbot_level', dmr.dartbot_level,
      'game_mode', dmr.game_mode,
      'match_format', dmr.match_format,
      'status', dmr.status,
      'player_legs', dmr.player_legs,
      'dartbot_legs', dmr.dartbot_legs,
      'winner', CASE 
        WHEN dmr.winner_id = dmr.player_id THEN 'player'
        ELSE 'dartbot'
      END,
      'summary', dmr.summary,
      'created_at', dmr.created_at,
      'completed_at', dmr.completed_at
    ) ORDER BY dmr.created_at DESC
  ) INTO v_matches
  FROM dartbot_match_rooms dmr
  WHERE dmr.player_id = auth.uid() 
    AND dmr.status IN ('finished', 'forfeited')
  ORDER BY dmr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
  
  RETURN jsonb_build_object(
    'success', true,
    'matches', COALESCE(v_matches, '[]'::jsonb),
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. Enable Realtime for Dartbot Tables
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE dartbot_match_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE dartbot_visits;

-- ============================================================
-- 14. Grant Execute Permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION create_dartbot_match(integer, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_dartbot_visit(uuid, text, integer, integer, boolean, boolean, integer, integer, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION forfeit_dartbot_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dartbot_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION request_dartbot_rematch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dartbot_match_history(integer, integer) TO authenticated;
