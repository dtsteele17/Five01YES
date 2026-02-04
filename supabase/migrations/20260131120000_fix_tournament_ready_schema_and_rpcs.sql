/*
  # Fix Tournament Ready-Up Schema and RPCs

  ## Why
  Local tournaments can get stuck because the DB schema and RPCs needed by the
  ready-up flow are missing/incomplete. This migration aligns the schema and
  adds the lightweight RPCs used by the UI polling.

  ## Changes
  - Add missing columns to tournament_matches for ready-up flow
  - Create tournament_match_ready table with basic RLS
  - Add process_due_tournaments and process_ready_deadlines RPCs
*/

-- ------------------------------------------------------------
-- 1) tournament_matches columns used by ready-up flow
-- ------------------------------------------------------------
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS round integer,
  ADD COLUMN IF NOT EXISTS match_index integer,
  ADD COLUMN IF NOT EXISTS match_room_id uuid,
  ADD COLUMN IF NOT EXISTS ready_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS playable_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- Backfill where legacy columns exist
UPDATE tournament_matches
SET round = round_number
WHERE round IS NULL AND round_number IS NOT NULL;

UPDATE tournament_matches
SET match_index = match_number
WHERE match_index IS NULL AND match_number IS NOT NULL;

-- Ensure status constraint supports ready-up flow
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_status_check;
ALTER TABLE tournament_matches ADD CONSTRAINT tournament_matches_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'scheduled'::text,
        'pending'::text,
        'ready_check'::text,
        'ready'::text,
        'in_progress'::text,
        'live'::text,
        'completed'::text,
        'bye'::text
      ]
    )
  );

-- ------------------------------------------------------------
-- 2) tournament_match_ready table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_match_ready (
  match_id uuid REFERENCES tournament_matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ready_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_match_ready_match_id
  ON tournament_match_ready(match_id);

ALTER TABLE tournament_match_ready ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ready status for their matches" ON tournament_match_ready;
CREATE POLICY "Users can view ready status for their matches"
  ON tournament_match_ready FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
        AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can ready up for their matches" ON tournament_match_ready;
CREATE POLICY "Users can ready up for their matches"
  ON tournament_match_ready FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
        AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their ready status" ON tournament_match_ready;
CREATE POLICY "Users can update their ready status"
  ON tournament_match_ready FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
        AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM tournament_matches tm
      WHERE tm.id = tournament_match_ready.match_id
        AND (tm.player1_id = auth.uid() OR tm.player2_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 3) RPCs used by frontend polling
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS process_due_tournaments();
CREATE FUNCTION process_due_tournaments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brackets_generated integer := 0;
  v_tournaments_started integer := 0;
  r record;
BEGIN
  -- Generate brackets for tournaments starting in the next 5 minutes
  FOR r IN
    SELECT id
    FROM public.tournaments
    WHERE status = 'scheduled'
      AND bracket_generated_at IS NULL
      AND start_at <= now() + interval '5 minutes'
  LOOP
    PERFORM generate_tournament_bracket(r.id);
    v_brackets_generated := v_brackets_generated + 1;
  END LOOP;

  -- Start tournaments whose start time has arrived
  FOR r IN
    SELECT id
    FROM public.tournaments
    WHERE status = 'scheduled'
      AND started_at IS NULL
      AND start_at <= now()
  LOOP
    PERFORM start_tournament_round_one(r.id);
    v_tournaments_started := v_tournaments_started + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'brackets_generated', v_brackets_generated,
    'tournaments_started', v_tournaments_started
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_due_tournaments() TO authenticated;

DROP FUNCTION IF EXISTS process_ready_deadlines();
CREATE FUNCTION process_ready_deadlines()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ready_marked integer := 0;
BEGIN
  -- Move matches into 'ready' state so the UI can show the ready-up modal
  UPDATE public.tournament_matches
  SET
    status = 'ready',
    ready_open_at = COALESCE(ready_open_at, now()),
    updated_at = now()
  WHERE status = 'ready_check'
    AND ready_deadline IS NOT NULL
    AND ready_deadline > now();

  GET DIAGNOSTICS v_ready_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'ready_marked', v_ready_marked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_ready_deadlines() TO authenticated;

