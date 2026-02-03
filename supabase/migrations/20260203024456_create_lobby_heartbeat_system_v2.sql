/*
  # Lobby Heartbeat and Cleanup System

  1. New Functions
    - `rpc_lobby_heartbeat(p_lobby_id uuid)` - Updates last_heartbeat_at for a lobby
    - `rpc_cleanup_stale_lobbies(p_grace_seconds int)` - Cleans up stale lobbies and forfeits linked matches

  2. Changes
    - Ensures quick_match_lobbies has last_heartbeat_at column
    - Adds logic to detect stale lobbies (no heartbeat for grace period)
    - Automatically forfeits matches linked to stale lobbies

  3. Security
    - rpc_lobby_heartbeat: authenticated users can only heartbeat their own lobbies
    - rpc_cleanup_stale_lobbies: anyone can call (idempotent cleanup)

  4. Notes
    - Grace period default is 45 seconds
    - Only affects lobbies/matches in 'in_progress' status
    - Forfeits are attributed to the player who stopped heartbeating
*/

-- Ensure last_heartbeat_at column exists on quick_match_lobbies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_match_lobbies' AND column_name = 'last_heartbeat_at'
  ) THEN
    ALTER TABLE quick_match_lobbies ADD COLUMN last_heartbeat_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS rpc_lobby_heartbeat(uuid);
DROP FUNCTION IF EXISTS rpc_cleanup_stale_lobbies(int);

-- RPC: Update heartbeat timestamp for a lobby
CREATE OR REPLACE FUNCTION rpc_lobby_heartbeat(p_lobby_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lobby_creator_id uuid;
  v_result json;
BEGIN
  -- Get lobby creator to verify ownership
  SELECT creator_id INTO v_lobby_creator_id
  FROM quick_match_lobbies
  WHERE id = p_lobby_id;

  IF v_lobby_creator_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Lobby not found'
    );
  END IF;

  -- Only allow the creator to heartbeat (they're the one in the match)
  IF v_lobby_creator_id != auth.uid() THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Not authorized'
    );
  END IF;

  -- Update heartbeat timestamp
  UPDATE quick_match_lobbies
  SET last_heartbeat_at = now()
  WHERE id = p_lobby_id
    AND creator_id = auth.uid();

  RETURN json_build_object(
    'success', true,
    'lobby_id', p_lobby_id,
    'heartbeat_at', now()
  );
END;
$$;

-- RPC: Cleanup stale lobbies and forfeit their matches
CREATE OR REPLACE FUNCTION rpc_cleanup_stale_lobbies(p_grace_seconds int DEFAULT 45)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stale_lobby record;
  v_cleaned_count int := 0;
  v_forfeited_count int := 0;
  v_match_room record;
BEGIN
  -- Find all stale lobbies (no heartbeat within grace period)
  FOR v_stale_lobby IN
    SELECT id, creator_id, match_room_id
    FROM quick_match_lobbies
    WHERE status = 'in_progress'
      AND last_heartbeat_at < (now() - (p_grace_seconds || ' seconds')::interval)
      AND ended_at IS NULL
  LOOP
    -- Mark lobby as finished
    UPDATE quick_match_lobbies
    SET 
      status = 'finished',
      ended_at = now()
    WHERE id = v_stale_lobby.id;

    v_cleaned_count := v_cleaned_count + 1;

    -- If there's a linked match room, forfeit it
    IF v_stale_lobby.match_room_id IS NOT NULL THEN
      -- Get match room details
      SELECT * INTO v_match_room
      FROM match_rooms
      WHERE id = v_stale_lobby.match_room_id
        AND status = 'in_progress';

      IF v_match_room.id IS NOT NULL THEN
        -- Determine winner (opponent of the player who stopped heartbeating)
        DECLARE
          v_winner_id uuid;
          v_forfeiter_id uuid;
        BEGIN
          v_forfeiter_id := v_stale_lobby.creator_id;
          
          IF v_match_room.player1_id = v_forfeiter_id THEN
            v_winner_id := v_match_room.player2_id;
          ELSE
            v_winner_id := v_match_room.player1_id;
          END IF;

          -- Update match room to forfeited
          UPDATE match_rooms
          SET
            status = 'forfeited',
            winner_id = v_winner_id,
            ended_at = now()
          WHERE id = v_match_room.id;

          -- Insert forfeit event
          INSERT INTO match_events (
            match_room_id,
            player_id,
            event_type,
            seq
          )
          SELECT
            v_match_room.id,
            v_forfeiter_id,
            'forfeit',
            COALESCE(MAX(seq), 0) + 1
          FROM match_events
          WHERE match_room_id = v_match_room.id;

          v_forfeited_count := v_forfeited_count + 1;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'cleaned_lobbies', v_cleaned_count,
    'forfeited_matches', v_forfeited_count,
    'grace_seconds', p_grace_seconds
  );
END;
$$;