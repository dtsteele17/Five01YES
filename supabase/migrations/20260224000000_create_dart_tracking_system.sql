-- ============================================================================
-- DART TRACKING SYSTEM
-- ============================================================================
-- Tracks each individual dart thrown in a visit with full history
-- Allows players to see exactly what they hit in each round
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE DARTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS darts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to the visit/turn
  room_id UUID NOT NULL REFERENCES match_rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL DEFAULT 1,
  visit_number INTEGER NOT NULL, -- Which visit (turn) in the leg
  dart_number INTEGER NOT NULL, -- 1, 2, or 3 (which dart in the visit)
  
  -- Dart details
  segment TEXT NOT NULL, -- 'S', 'D', 'T', 'SB', 'DB', 'MISS'
  number INTEGER, -- The number hit (1-20, 25 for bull)
  label TEXT NOT NULL, -- Display label like 'S20', 'T19', 'MISS'
  points INTEGER NOT NULL DEFAULT 0, -- Points scored
  
  -- What was the target/score after this dart
  score_before INTEGER NOT NULL, -- Score before throwing this dart
  score_after INTEGER NOT NULL, -- Score after this dart
  is_bust BOOLEAN DEFAULT false, -- Did this dart cause a bust
  is_checkout BOOLEAN DEFAULT false, -- Was this a winning dart
  
  -- For tracking history/progression
  remaining_score INTEGER NOT NULL, -- What the player has left after this dart
  
  -- Metadata
  thrown_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_darts_room_id ON darts(room_id);
CREATE INDEX IF NOT EXISTS idx_darts_player_id ON darts(player_id);
CREATE INDEX IF NOT EXISTS idx_darts_room_player ON darts(room_id, player_id);
CREATE INDEX IF NOT EXISTS idx_darts_visit ON darts(room_id, player_id, leg_number, visit_number);
CREATE INDEX IF NOT EXISTS idx_darts_thrown_at ON darts(thrown_at);

-- Enable RLS
ALTER TABLE darts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Darts viewable by match participants" ON darts;
CREATE POLICY "Darts viewable by match participants"
  ON darts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM match_rooms mr
      WHERE mr.id = darts.room_id
        AND (mr.player1_id = auth.uid() OR mr.player2_id = auth.uid())
    )
    OR auth.uid() = darts.player_id
  );

DROP POLICY IF EXISTS "Players can insert own darts" ON darts;
CREATE POLICY "Players can insert own darts"
  ON darts FOR INSERT
  WITH CHECK (auth.uid() = player_id);

-- ============================================================================
-- PART 2: VIEW FOR DART HISTORY WITH PLAYER INFO
-- ============================================================================

CREATE OR REPLACE VIEW v_dart_history AS
SELECT 
  d.*,
  p.username as player_username,
  p.avatar_url as player_avatar,
  mr.game_mode,
  mr.match_format,
  mr.status as match_status
FROM darts d
JOIN profiles p ON d.player_id = p.user_id
JOIN match_rooms mr ON d.room_id = mr.id;

GRANT SELECT ON v_dart_history TO authenticated;

-- ============================================================================
-- PART 3: FUNCTION TO RECORD A DART
-- ============================================================================

DROP FUNCTION IF EXISTS record_dart(UUID, UUID, INTEGER, INTEGER, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION record_dart(
  p_room_id UUID,
  p_player_id UUID,
  p_leg_number INTEGER,
  p_dart_number INTEGER, -- 1, 2, or 3
  p_segment TEXT, -- 'S', 'D', 'T', 'SB', 'DB', 'MISS'
  p_number INTEGER -- The number (1-20, 25 for bull, NULL for miss)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room RECORD;
  v_label TEXT;
  v_points INTEGER;
  v_score_before INTEGER;
  v_score_after INTEGER;
  v_remaining INTEGER;
  v_is_bust BOOLEAN := false;
  v_is_checkout BOOLEAN := false;
  v_visit_number INTEGER;
  v_player_remaining INTEGER;
BEGIN
  -- Get room details
  SELECT * INTO v_room
  FROM match_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Room not found');
  END IF;

  -- Determine player's current remaining score
  IF p_player_id = v_room.player1_id THEN
    v_player_remaining := v_room.player1_remaining;
  ELSIF p_player_id = v_room.player2_id THEN
    v_player_remaining := v_room.player2_remaining;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Player not in this match');
  END IF;

  -- Calculate points
  v_points := CASE 
    WHEN p_segment = 'MISS' THEN 0
    WHEN p_segment = 'S' THEN p_number
    WHEN p_segment = 'D' THEN p_number * 2
    WHEN p_segment = 'T' THEN p_number * 3
    WHEN p_segment = 'SB' THEN 25
    WHEN p_segment = 'DB' THEN 50
    ELSE 0
  END;

  -- Create label
  v_label := CASE 
    WHEN p_segment = 'MISS' THEN 'MISS'
    WHEN p_segment = 'SB' THEN 'SB'
    WHEN p_segment = 'DB' THEN 'DB'
    ELSE p_segment || p_number
  END;

  -- Calculate scores
  v_score_before := v_player_remaining;
  v_score_after := v_score_before - v_points;
  v_remaining := v_score_after;

  -- Check for bust
  IF v_score_after < 0 OR v_score_after = 1 THEN
    v_is_bust := true;
    v_remaining := v_score_before; -- Score stays the same on bust
    v_score_after := v_score_before;
  END IF;

  -- Check for checkout (must finish on double)
  IF v_score_after = 0 AND p_segment = 'D' THEN
    v_is_checkout := true;
  END IF;

  -- Get current visit number (count existing darts for this player in this leg)
  SELECT COALESCE(MAX(visit_number), 0) + 1 INTO v_visit_number
  FROM darts
  WHERE room_id = p_room_id
    AND player_id = p_player_id
    AND leg_number = p_leg_number
    AND dart_number = 3; -- New visit starts after dart 3

  -- If this is dart 1, keep current visit number, otherwise use existing
  IF p_dart_number > 1 THEN
    SELECT COALESCE(MAX(visit_number), 1) INTO v_visit_number
    FROM darts
    WHERE room_id = p_room_id
      AND player_id = p_player_id
      AND leg_number = p_leg_number;
  END IF;

  -- Insert the dart
  INSERT INTO darts (
    room_id,
    player_id,
    leg_number,
    visit_number,
    dart_number,
    segment,
    number,
    label,
    points,
    score_before,
    score_after,
    is_bust,
    is_checkout,
    remaining_score
  ) VALUES (
    p_room_id,
    p_player_id,
    p_leg_number,
    v_visit_number,
    p_dart_number,
    p_segment,
    p_number,
    v_label,
    v_points,
    v_score_before,
    v_score_after,
    v_is_bust,
    v_is_checkout,
    v_remaining
  );

  RETURN jsonb_build_object(
    'success', true,
    'dart_id', (SELECT id FROM darts WHERE room_id = p_room_id AND player_id = p_player_id ORDER BY thrown_at DESC LIMIT 1),
    'label', v_label,
    'points', v_points,
    'remaining', v_remaining,
    'is_bust', v_is_bust,
    'is_checkout', v_is_checkout
  );
END;
$$;

GRANT EXECUTE ON FUNCTION record_dart(UUID, UUID, INTEGER, INTEGER, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- PART 4: FUNCTION TO GET DART HISTORY FOR A MATCH
-- ============================================================================

DROP FUNCTION IF EXISTS get_dart_history(UUID);

CREATE OR REPLACE FUNCTION get_dart_history(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'player_id', d.player_id,
      'player_username', p.username,
      'leg_number', d.leg_number,
      'visit_number', d.visit_number,
      'dart_number', d.dart_number,
      'segment', d.segment,
      'number', d.number,
      'label', d.label,
      'points', d.points,
      'score_before', d.score_before,
      'score_after', d.score_after,
      'remaining_score', d.remaining_score,
      'is_bust', d.is_bust,
      'is_checkout', d.is_checkout,
      'thrown_at', d.thrown_at
    ) ORDER BY d.leg_number, d.visit_number, d.dart_number
  ) INTO v_result
  FROM darts d
  JOIN profiles p ON d.player_id = p.user_id
  WHERE d.room_id = p_room_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_dart_history(UUID) TO authenticated;

-- ============================================================================
-- PART 5: FUNCTION TO GET PLAYER STATS FROM DARTS
-- ============================================================================

DROP FUNCTION IF EXISTS get_player_dart_stats(UUID, UUID);

CREATE OR REPLACE FUNCTION get_player_dart_stats(
  p_room_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_darts INTEGER;
  v_total_points INTEGER;
  v_avg_per_dart DECIMAL;
  v_highest_dart INTEGER;
  v_count_180s INTEGER;
  v_count_140s INTEGER;
  v_count_100s INTEGER;
  v_count_60s INTEGER;
  v_checkout_percentage DECIMAL;
  v_result JSONB;
BEGIN
  -- Basic stats
  SELECT 
    COUNT(*),
    COALESCE(SUM(points), 0),
    COALESCE(MAX(points), 0)
  INTO v_total_darts, v_total_points, v_highest_dart
  FROM darts
  WHERE room_id = p_room_id
    AND player_id = p_player_id;

  -- Average per dart
  IF v_total_darts > 0 THEN
    v_avg_per_dart := ROUND(v_total_points::DECIMAL / v_total_darts, 2);
  ELSE
    v_avg_per_dart := 0;
  END IF;

  -- Count big scores (per visit, not per dart - count when sum of 3 darts >= threshold)
  SELECT COUNT(*) INTO v_count_180s
  FROM (
    SELECT visit_number, SUM(points) as visit_total
    FROM darts
    WHERE room_id = p_room_id AND player_id = p_player_id
    GROUP BY leg_number, visit_number
    HAVING SUM(points) >= 180
  ) high_scores;

  SELECT COUNT(*) INTO v_count_140s
  FROM (
    SELECT visit_number, SUM(points) as visit_total
    FROM darts
    WHERE room_id = p_room_id AND player_id = p_player_id
    GROUP BY leg_number, visit_number
    HAVING SUM(points) >= 140 AND SUM(points) < 180
  ) high_scores;

  SELECT COUNT(*) INTO v_count_100s
  FROM (
    SELECT visit_number, SUM(points) as visit_total
    FROM darts
    WHERE room_id = p_room_id AND player_id = p_player_id
    GROUP BY leg_number, visit_number
    HAVING SUM(points) >= 100 AND SUM(points) < 140
  ) high_scores;

  SELECT COUNT(*) INTO v_count_60s
  FROM (
    SELECT visit_number, SUM(points) as visit_total
    FROM darts
    WHERE room_id = p_room_id AND player_id = p_player_id
    GROUP BY leg_number, visit_number
    HAVING SUM(points) >= 60 AND SUM(points) < 100
  ) high_scores;

  RETURN jsonb_build_object(
    'total_darts', v_total_darts,
    'total_points', v_total_points,
    'average_per_dart', v_avg_per_dart,
    'highest_dart', v_highest_dart,
    'count_180s', v_count_180s,
    'count_140s', v_count_140s,
    'count_100s', v_count_100s,
    'count_60s', v_count_60s
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_player_dart_stats(UUID, UUID) TO authenticated;

-- ============================================================================
-- PART 6: ENABLE REALTIME FOR DARTS
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE darts;

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT 'Dart tracking system created!' as status;
