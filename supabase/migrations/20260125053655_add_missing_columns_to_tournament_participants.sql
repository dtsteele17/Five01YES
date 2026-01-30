/*
  # Add Missing Columns to tournament_participants

  1. Purpose
    - Add role, status_type, ban_rounds_remaining, updated_at to tournament_participants
    - These columns are needed for full tournament management features
    - The code was written expecting tournament_entries but the table is tournament_participants

  2. Changes
    - Add role column (owner, admin, participant)
    - Add status_type column (registered, invited, checked-in, eliminated, banned)
    - Add ban_rounds_remaining integer
    - Add updated_at timestamp
    - Add RLS policies for tournament_participants

  3. Security
    - Enable RLS
    - Allow users to view all participants
    - Allow users to join/leave tournaments
    - Allow tournament owners to manage participants
*/

-- Add missing columns to tournament_participants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'role'
  ) THEN
    ALTER TABLE tournament_participants ADD COLUMN role text DEFAULT 'participant' 
      CHECK (role IN ('owner', 'admin', 'participant'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'status_type'
  ) THEN
    ALTER TABLE tournament_participants ADD COLUMN status_type text DEFAULT 'registered' 
      CHECK (status_type IN ('registered', 'invited', 'checked-in', 'eliminated', 'banned'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'ban_rounds_remaining'
  ) THEN
    ALTER TABLE tournament_participants ADD COLUMN ban_rounds_remaining integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE tournament_participants ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_participants' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE tournament_participants ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Tournament owners and admins can manage participants" ON tournament_participants;

-- SELECT: Anyone authenticated can view participants
CREATE POLICY "Users can view tournament participants"
  ON tournament_participants FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Users can join tournaments
CREATE POLICY "Users can join tournaments"
  ON tournament_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DELETE: Users can leave their own entries
CREATE POLICY "Users can leave tournaments"
  ON tournament_participants FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tournaments
      WHERE tournaments.id = tournament_participants.tournament_id
      AND tournaments.status IN ('open', 'scheduled')
    )
  );

-- UPDATE: Tournament owners and admins can update participants
CREATE POLICY "Tournament owners and admins can manage participants"
  ON tournament_participants FOR UPDATE
  TO authenticated
  USING (
    tournament_id IN (
      SELECT tournament_id FROM tournament_participants 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tournament_id IN (
      SELECT tournament_id FROM tournament_participants 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Update join_tournament RPC to use tournament_participants
DROP FUNCTION IF EXISTS join_tournament(uuid);

CREATE OR REPLACE FUNCTION join_tournament(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  cap int;
  current_count int;
  t_status text;
begin
  -- Get tournament details
  select max_participants, status into cap, t_status
  from public.tournaments
  where id = p_tournament_id;

  if not found then
    raise exception 'Tournament not found';
  end if;

  -- Allow joining if status is 'open' or 'scheduled'
  if t_status NOT IN ('open', 'scheduled') then
    raise exception 'Tournament not joinable (status=%)', t_status;
  end if;

  -- Count current participants
  select count(*) into current_count
  from public.tournament_participants
  where tournament_id = p_tournament_id;

  if current_count >= cap then
    raise exception 'Tournament is full';
  end if;

  -- Insert participant with proper fields
  insert into public.tournament_participants (tournament_id, user_id, role, status_type)
  values (p_tournament_id, auth.uid(), 'participant', 'registered')
  on conflict (tournament_id, user_id) do nothing;
end;
$$;

GRANT EXECUTE ON FUNCTION join_tournament(uuid) TO authenticated;
