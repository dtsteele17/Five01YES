/*
  # Fix start_tournament_round_matches RPC

  1. Updates
    - Fix game_mode reference (tournaments use starting_score, not game_mode)
    - Fix legs reference (should be legs_to_win in match_rooms)
    - Ensure proper field mapping between tournaments and match_rooms

  2. Purpose
    - Allow tournament matches to properly create match rooms
    - Use correct column names for both tables
*/

-- Drop and recreate the function with correct field mapping
DROP FUNCTION IF EXISTS start_tournament_round_matches(uuid, integer);

CREATE OR REPLACE FUNCTION start_tournament_round_matches(p_tournament_id uuid, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  t record;
  m record;
  room_id uuid;
begin
  select * into t from public.tournaments where id = p_tournament_id;
  if not found then raise exception 'Tournament not found'; end if;

  -- mark in progress at round 1 start
  if p_round = 1 then
    update public.tournaments
    set status = 'in_progress'
    where id = p_tournament_id and status in ('open', 'scheduled', 'locked');
  end if;

  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament_id
      and round = p_round
      and status = 'pending'
      and player1_id is not null
      and player2_id is not null
  loop
    -- create a match room using tournament settings
    -- match_rooms expects: player1_id, player2_id, status, game_mode (int), legs_to_win
    insert into public.match_rooms (player1_id, player2_id, status, game_mode, legs_to_win)
    values (m.player1_id, m.player2_id, 'active', t.starting_score, t.legs_per_match)
    returning id into room_id;

    update public.tournament_matches
    set match_room_id = room_id,
        status = 'ready'
    where id = m.id;
  end loop;
end;
$$;

GRANT EXECUTE ON FUNCTION start_tournament_round_matches(uuid, integer) TO authenticated;
