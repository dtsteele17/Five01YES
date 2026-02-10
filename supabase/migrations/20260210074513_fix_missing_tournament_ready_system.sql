/*
  # Fix Missing Tournament Ready System

  ## Summary
  Creates the missing tournament_match_ready table and v_tournament_match_ready_status view
  that are required for the tournament ready-up system to work.

  ## Changes
  1. New Tables
    - `tournament_match_ready` - Tracks which players have marked themselves as ready
      - `match_id` (uuid, references tournament_matches)
      - `user_id` (uuid, references auth.users)
      - `ready_at` (timestamptz)
      - Primary key: (match_id, user_id)

  2. New Views
    - `v_tournament_match_ready_status` - Provides complete match ready status information
      - Shows ready count, opponent details, tournament name
      - Used by the ready-up UI

  3. Security
    - Enable RLS on tournament_match_ready
    - Players can view ready status for their own matches
    - Players can mark themselves ready for matches they're in

  4. RPC Functions
    - `ready_up_tournament_match` - Marks player as ready and creates match room when both ready
*/

-- ============================================================================
-- PART 1: CREATE TOURNAMENT_MATCH_READY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournament_match_ready (
  match_id uuid REFERENCES tournament_matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ready_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id ON tournament_match_ready(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_user_id ON tournament_match_ready(user_id);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ready status for their matches" ON tournament_match_ready;
CREATE POLICY "Users can view ready status for their matches"
  ON tournament_match_ready
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
      AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can mark themselves ready" ON tournament_match_ready;
CREATE POLICY "Users can mark themselves ready"
  ON tournament_match_ready
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
      AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their ready status" ON tournament_match_ready;
CREATE POLICY "Users can update their ready status"
  ON tournament_match_ready
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PART 2: CREATE VIEW FOR READY STATUS
-- ============================================================================

DROP VIEW IF EXISTS v_tournament_match_ready_status CASCADE;

CREATE VIEW v_tournament_match_ready_status AS
SELECT 
  tm.id AS match_id,
  tm.tournament_id,
  tm.round_number AS round,
  tm.match_number AS match_index,
  tm.player1_id,
  tm.player2_id,
  tm.status,
  tm.match_id AS match_room_id,
  tm.scheduled_date AS ready_open_at,
  tm.scheduled_date + interval '30 minutes' AS ready_deadline,
  t.name AS tournament_name,
  (SELECT COUNT(*)::integer FROM tournament_match_ready r WHERE r.match_id = tm.id) AS ready_count,
  EXISTS(SELECT 1 FROM tournament_match_ready r2 WHERE r2.match_id = tm.id AND r2.user_id = auth.uid()) AS my_ready,
  CASE 
    WHEN auth.uid() = tm.player1_id THEN tm.player2_id
    WHEN auth.uid() = tm.player2_id THEN tm.player1_id
    ELSE NULL
  END AS opponent_id,
  CASE 
    WHEN auth.uid() = tm.player1_id THEN p2.username
    WHEN auth.uid() = tm.player2_id THEN p1.username
    ELSE NULL
  END AS opponent_username,
  CASE 
    WHEN auth.uid() = tm.player1_id THEN p2.avatar_url
    WHEN auth.uid() = tm.player2_id THEN p1.avatar_url
    ELSE NULL
  END AS opponent_avatar_url
FROM public.tournament_matches tm
JOIN public.tournaments t ON tm.tournament_id = t.id
LEFT JOIN public.profiles p1 ON tm.player1_id = p1.id
LEFT JOIN public.profiles p2 ON tm.player2_id = p2.id;

GRANT SELECT ON v_tournament_match_ready_status TO authenticated;

-- ============================================================================
-- PART 3: CREATE/UPDATE READY-UP RPC FUNCTION
-- ============================================================================

DROP FUNCTION IF EXISTS ready_up_tournament_match(uuid);

CREATE OR REPLACE FUNCTION ready_up_tournament_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_match RECORD;
  v_tournament RECORD;
  v_is_player boolean;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
  v_status text;
  v_starting_score integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Get tournament match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- Check if user is a player in this match
  v_is_player := (v_match.player1_id = v_user_id OR v_match.player2_id = v_user_id);

  IF NOT v_is_player THEN
    RETURN jsonb_build_object('error', 'You are not a player in this match');
  END IF;

  -- Record player readiness
  INSERT INTO public.tournament_match_ready (match_id, user_id, ready_at)
  VALUES (p_match_id, v_user_id, now())
  ON CONFLICT (match_id, user_id) 
  DO UPDATE SET ready_at = now();

  -- Count ready players
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE match_id = p_match_id;

  -- If both players ready, create match room
  IF v_ready_count >= 2 THEN
    -- Get tournament details
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      -- Determine best_of from tournament
      v_best_of := COALESCE(v_tournament.legs_per_match, 5);
      v_starting_score := COALESCE(v_tournament.starting_score, 501);

      -- Create match room
      INSERT INTO public.match_rooms (
        player1_id,
        player2_id,
        game_mode,
        match_format,
        match_type,
        source,
        status,
        current_leg,
        legs_to_win,
        player1_remaining,
        player2_remaining,
        current_turn,
        double_out,
        straight_in
      ) VALUES (
        v_match.player1_id,
        v_match.player2_id,
        v_starting_score::text,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        'tournament',
        'tournament',
        'active',
        1,
        CASE v_best_of
          WHEN 1 THEN 1
          WHEN 3 THEN 2
          WHEN 5 THEN 3
          WHEN 7 THEN 4
          ELSE 2
        END,
        v_starting_score,
        v_starting_score,
        v_match.player1_id,
        COALESCE(v_tournament.double_out, true),
        COALESCE(v_tournament.straight_in, true)
      )
      RETURNING id INTO v_match_room_id;

      -- Update tournament match with room_id
      UPDATE public.tournament_matches
      SET 
        match_id = v_match_room_id,
        status = 'live',
        updated_at = now()
      WHERE id = p_match_id;

      v_status := 'live';
    END IF;
  ELSE
    v_match_room_id := NULL;
    v_status := 'scheduled';
  END IF;

  -- Return ready count and status
  RETURN jsonb_build_object(
    'ready_count', v_ready_count,
    'status', v_status,
    'match_room_id', v_match_room_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ready_up_tournament_match(uuid) TO authenticated;

-- ============================================================================
-- PART 4: ENABLE REALTIME
-- ============================================================================

ALTER TABLE tournament_match_ready REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'tournament_match_ready'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tournament_match_ready;
  END IF;
END $$;
