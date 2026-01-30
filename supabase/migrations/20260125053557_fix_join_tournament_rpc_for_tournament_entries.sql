/*
  # Fix join_tournament RPC function

  1. Updates
    - Change status check to allow 'open' instead of 'scheduled'
    - Change table reference from tournament_participants to tournament_entries
    - Add proper role and status_type fields for tournament_entries

  2. Purpose
    - Allow users to join tournaments with status='open'
    - Use correct tournament_entries table structure
*/

-- Drop existing function
DROP FUNCTION IF EXISTS join_tournament(uuid);

-- Recreate with correct logic
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
  from public.tournament_entries
  where tournament_id = p_tournament_id;

  if current_count >= cap then
    raise exception 'Tournament is full';
  end if;

  -- Insert participant with proper fields
  insert into public.tournament_entries (tournament_id, user_id, role, status_type)
  values (p_tournament_id, auth.uid(), 'participant', 'registered')
  on conflict (tournament_id, user_id) do nothing;
end;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION join_tournament(uuid) TO authenticated;
