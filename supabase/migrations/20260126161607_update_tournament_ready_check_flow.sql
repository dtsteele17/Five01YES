/*
  # Update Tournament Ready Check Flow

  1. Updates
    - Update `start_tournament_round_matches` to set matches to 'ready_check' instead of creating match rooms immediately
    - Set playable_at and ready_deadline timestamps
    - Match rooms will be created by `ready_up_tournament_match` when both players are ready

  2. Purpose
    - Implement the "Ready Up" flow for tournament matches
    - Allow 3-minute ready check period before match starts
    - Prevent no-shows and ensure both players are present
*/

-- Drop and recreate the function with ready check flow
DROP FUNCTION IF EXISTS start_tournament_round_matches(uuid, integer);

CREATE OR REPLACE FUNCTION start_tournament_round_matches(p_tournament_id uuid, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  t record;
  m record;
begin
  select * into t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'Tournament not found'; end if;

  -- mark in progress at round 1 start
  if p_round = 1 then
    update public.tournaments
    set status = 'in_progress'
    where id = p_tournament_id and status in ('open', 'scheduled', 'locked');
  end if;

  -- Set matches to ready_check status with deadlines
  -- Match rooms will be created when both players ready up via ready_up_tournament_match
  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament_id
      and round = p_round
      and status = 'pending'
      and player1_id is not null
      and player2_id is not null
  loop
    update public.tournament_matches
    set 
      status = 'ready_check',
      playable_at = now(),
      ready_deadline = now() + interval '3 minutes',
      updated_at = now()
    where id = m.id;
  end loop;
end;
$$;

GRANT EXECUTE ON FUNCTION start_tournament_round_matches(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION start_tournament_round_matches(uuid, integer) TO service_role;
