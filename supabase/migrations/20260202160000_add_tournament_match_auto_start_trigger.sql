/*
  # Add Trigger to Auto-Start Tournament Match When Both Players Ready
  
  ## Problem
  When both players are ready (2 rows in tournament_match_ready), the match should
  automatically start, but currently this only happens if the RPC function runs.
  If rows are inserted manually or the RPC is bypassed, the match doesn't start.
  
  ## Solution
  Create a trigger function that fires AFTER INSERT on tournament_match_ready.
  When a new ready row is inserted, check if ready_count is now 2, and if so,
  automatically create the online_matches row and update tournament_matches.
  
  This ensures the match starts regardless of how the ready rows are created.
*/

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_start_tournament_match ON tournament_match_ready;
DROP FUNCTION IF EXISTS auto_start_tournament_match_on_ready();

-- Create trigger function
CREATE FUNCTION auto_start_tournament_match_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match record;
  v_tournament record;
  v_ready_count integer;
  v_match_room_id uuid;
  v_best_of integer;
BEGIN
  -- Get the match
  SELECT * INTO v_match
  FROM public.tournament_matches
  WHERE id = NEW.match_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only proceed if match is in ready phase and doesn't have a room yet
  IF v_match.status NOT IN ('pending', 'ready_check', 'ready') THEN
    RETURN NEW;
  END IF;

  IF v_match.match_room_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Count how many players are ready
  SELECT COUNT(*)::integer INTO v_ready_count
  FROM public.tournament_match_ready
  WHERE match_id = NEW.match_id;

  -- If both players are ready, create match room and start match
  IF v_ready_count >= 2 THEN
    -- Get tournament config
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = v_match.tournament_id;

    IF FOUND THEN
      v_best_of := COALESCE(v_tournament.best_of_legs, v_tournament.best_of, 3);

      -- Create online match
      INSERT INTO public.online_matches (
        player1_id,
        player2_id,
        game_type,
        format,
        double_out,
        status,
        leg_number,
        p1_remaining,
        p2_remaining,
        current_player_id
      ) VALUES (
        v_match.player1_id,
        v_match.player2_id,
        v_tournament.game_mode,
        CASE v_best_of
          WHEN 1 THEN 'best-of-1'
          WHEN 3 THEN 'best-of-3'
          WHEN 5 THEN 'best-of-5'
          WHEN 7 THEN 'best-of-7'
          ELSE 'best-of-3'
        END,
        true,
        'in_progress',
        1,
        v_tournament.game_mode,
        v_tournament.game_mode,
        v_match.player1_id
      )
      RETURNING id INTO v_match_room_id;

      -- Update tournament match with room ID and mark as in_game
      UPDATE public.tournament_matches
      SET 
        match_room_id = v_match_room_id,
        status = 'in_game',
        started_at = now(),
        updated_at = now()
      WHERE id = NEW.match_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_auto_start_tournament_match
AFTER INSERT ON tournament_match_ready
FOR EACH ROW
EXECUTE FUNCTION auto_start_tournament_match_on_ready();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auto_start_tournament_match_on_ready() TO authenticated;
