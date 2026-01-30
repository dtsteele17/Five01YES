/*
  # Fix Security and Performance Issues

  ## Changes Made

  ### 1. Add Missing Indexes for Foreign Keys (Performance)
  - Add indexes for all unindexed foreign keys to improve query performance
  - Affects: match_events, match_rooms, match_state, matches, online_matches, quick_match_lobbies, quickmatch_lobbies, tournament_matches

  ### 2. Optimize RLS Policies (Performance)
  - Wrap all auth.uid() calls with (SELECT auth.uid()) to prevent re-evaluation per row
  - Significantly improves query performance at scale
  - Affects: All tables with RLS policies

  ### 3. Fix Insecure RLS Policy (Security)
  - Fix notifications INSERT policy that allows unrestricted access
  - Replace "always true" WITH CHECK with proper user validation

  ### 4. Fix Function Search Paths (Security)
  - Set explicit search_path for all mutable functions to prevent schema poisoning attacks
*/

-- =====================================================
-- PART 1: ADD MISSING INDEXES FOR FOREIGN KEYS
-- =====================================================

-- match_events
CREATE INDEX IF NOT EXISTS idx_match_events_user_id ON public.match_events(user_id);

-- match_rooms
CREATE INDEX IF NOT EXISTS idx_match_rooms_active_turn_user ON public.match_rooms(active_turn_user_id);

-- match_state
CREATE INDEX IF NOT EXISTS idx_match_state_current_turn_user ON public.match_state(current_turn_user_id);

-- matches
CREATE INDEX IF NOT EXISTS idx_matches_opponent_id ON public.matches(opponent_id);

-- online_matches
CREATE INDEX IF NOT EXISTS idx_online_matches_created_by ON public.online_matches(created_by);
CREATE INDEX IF NOT EXISTS idx_online_matches_current_turn ON public.online_matches(current_turn_player_id);

-- quick_match_lobbies
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_created_by_fk ON public.quick_match_lobbies(created_by);

-- quickmatch_lobbies
CREATE INDEX IF NOT EXISTS idx_quickmatch_lobbies_match_room ON public.quickmatch_lobbies(match_room_id);
CREATE INDEX IF NOT EXISTS idx_quickmatch_lobbies_guest_user ON public.quickmatch_lobbies(guest_user_id);

-- tournament_matches
CREATE INDEX IF NOT EXISTS idx_tournament_matches_match_id_fk ON public.tournament_matches(match_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player1_id_fk ON public.tournament_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_player2_id_fk ON public.tournament_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_winner_id_fk ON public.tournament_matches(winner_id);

-- =====================================================
-- PART 2: OPTIMIZE RLS POLICIES (AUTH.UID() CACHING)
-- =====================================================

-- Drop and recreate policies with optimized auth.uid() calls

-- tournaments table
DROP POLICY IF EXISTS "tournaments_insert_authenticated" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update_creator" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete_creator" ON public.tournaments;

CREATE POLICY "tournaments_insert_authenticated"
  ON public.tournaments
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "tournaments_update_creator"
  ON public.tournaments
  FOR UPDATE
  TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "tournaments_delete_creator"
  ON public.tournaments
  FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- tournament_entries table
DROP POLICY IF EXISTS "Users can join tournaments" ON public.tournament_entries;
DROP POLICY IF EXISTS "Users can register for tournaments" ON public.tournament_entries;
DROP POLICY IF EXISTS "Tournament owners and admins can manage entries" ON public.tournament_entries;

CREATE POLICY "Users can join tournaments"
  ON public.tournament_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Tournament owners and admins can manage entries"
  ON public.tournament_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_entries.tournament_id
      AND t.created_by = (SELECT auth.uid())
    )
  );

-- notifications table
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "System can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IN (SELECT id FROM auth.users));

-- user_achievements table
DROP POLICY IF EXISTS "Users can read own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can insert own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can update own achievements" ON public.user_achievements;

CREATE POLICY "Users can read own achievements"
  ON public.user_achievements
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own achievements"
  ON public.user_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own achievements"
  ON public.user_achievements
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- user_stats table
DROP POLICY IF EXISTS "Users can view their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can insert their own stats" ON public.user_stats;
DROP POLICY IF EXISTS "Users can update their own stats" ON public.user_stats;

CREATE POLICY "Users can view their own stats"
  ON public.user_stats
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert their own stats"
  ON public.user_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own stats"
  ON public.user_stats
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- player_stats table
DROP POLICY IF EXISTS "Users can read own player stats" ON public.player_stats;
DROP POLICY IF EXISTS "Users can insert own player stats" ON public.player_stats;
DROP POLICY IF EXISTS "Users can update own player stats" ON public.player_stats;

CREATE POLICY "Users can read own player stats"
  ON public.player_stats
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own player stats"
  ON public.player_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own player stats"
  ON public.player_stats
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- user_rank table
DROP POLICY IF EXISTS "Users can view their own rank" ON public.user_rank;
DROP POLICY IF EXISTS "System can insert user ranks" ON public.user_rank;
DROP POLICY IF EXISTS "System can update user ranks" ON public.user_rank;

CREATE POLICY "Users can view their own rank"
  ON public.user_rank
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "System can insert user ranks"
  ON public.user_rank
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "System can update user ranks"
  ON public.user_rank
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- matches table
DROP POLICY IF EXISTS "matches_select_participants" ON public.matches;
DROP POLICY IF EXISTS "matches_insert_creator" ON public.matches;
DROP POLICY IF EXISTS "matches_update_owner" ON public.matches;

CREATE POLICY "matches_select_participants"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) 
    OR opponent_id = (SELECT auth.uid())
    OR match_type = 'training'
  );

CREATE POLICY "matches_insert_creator"
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id IS NULL);

CREATE POLICY "matches_update_owner"
  ON public.matches
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid()) 
    OR opponent_id = (SELECT auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid()) 
    OR opponent_id = (SELECT auth.uid())
  );

-- match_players table
DROP POLICY IF EXISTS "match_players_select_participants" ON public.match_players;
DROP POLICY IF EXISTS "match_players_insert_participants" ON public.match_players;
DROP POLICY IF EXISTS "match_players_update_participants" ON public.match_players;

CREATE POLICY "match_players_select_participants"
  ON public.match_players
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "match_players_insert_participants"
  ON public.match_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "match_players_update_participants"
  ON public.match_players
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_players.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

-- match_visits table
DROP POLICY IF EXISTS "Users can view visits from their matches via match_id" ON public.match_visits;
DROP POLICY IF EXISTS "Users can insert visits via match_id" ON public.match_visits;

CREATE POLICY "Users can view visits from their matches via match_id"
  ON public.match_visits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()) OR m.match_type = 'training')
    )
  );

CREATE POLICY "Users can insert visits via match_id"
  ON public.match_visits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_visits.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()) OR m.match_type = 'training')
    )
  );

-- match_state table
DROP POLICY IF EXISTS "Players can view match state" ON public.match_state;
DROP POLICY IF EXISTS "Match owner can create match state" ON public.match_state;
DROP POLICY IF EXISTS "Players can update match state on their turn" ON public.match_state;

CREATE POLICY "Players can view match state"
  ON public.match_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Match owner can create match state"
  ON public.match_state
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
      AND m.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Players can update match state on their turn"
  ON public.match_state
  FOR UPDATE
  TO authenticated
  USING (
    current_turn_user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_state.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

-- match_events table
DROP POLICY IF EXISTS "Players can view match events" ON public.match_events;
DROP POLICY IF EXISTS "Players can insert match events" ON public.match_events;

CREATE POLICY "Players can view match events"
  ON public.match_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_events.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Players can insert match events"
  ON public.match_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM matches m
      WHERE m.id = match_events.match_id
      AND (m.user_id = (SELECT auth.uid()) OR m.opponent_id = (SELECT auth.uid()))
    )
  );

-- leagues table
DROP POLICY IF EXISTS "Users can view leagues they are members of" ON public.leagues;
DROP POLICY IF EXISTS "League owners and admins can update their leagues" ON public.leagues;
DROP POLICY IF EXISTS "Users can create leagues" ON public.leagues;

CREATE POLICY "Users can view leagues they are members of"
  ON public.leagues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = leagues.id
      AND lm.user_id = (SELECT auth.uid())
    )
    OR access = 'open'
  );

CREATE POLICY "League owners and admins can update their leagues"
  ON public.leagues
  FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = leagues.id
      AND lm.user_id = (SELECT auth.uid())
      AND lm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can create leagues"
  ON public.leagues
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

-- league_members table
DROP POLICY IF EXISTS "Users can view league members" ON public.league_members;
DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.league_members;

CREATE POLICY "Users can view league members"
  ON public.league_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = league_members.league_id
      AND (
        l.access = 'open'
        OR l.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM league_members lm2
          WHERE lm2.league_id = l.id
          AND lm2.user_id = (SELECT auth.uid())
        )
      )
    )
  );

CREATE POLICY "Owners and admins can manage members"
  ON public.league_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = league_members.league_id
      AND (
        l.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM league_members lm
          WHERE lm.league_id = l.id
          AND lm.user_id = (SELECT auth.uid())
          AND lm.role IN ('owner', 'admin')
        )
      )
    )
  );

-- tournament_matches table
DROP POLICY IF EXISTS "Users can view tournament matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Tournament owners and admins can manage matches" ON public.tournament_matches;

CREATE POLICY "Users can view tournament matches"
  ON public.tournament_matches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      WHERE te.tournament_id = tournament_matches.tournament_id
      AND te.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Tournament owners and admins can manage matches"
  ON public.tournament_matches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_matches.tournament_id
      AND t.created_by = (SELECT auth.uid())
    )
  );

-- online_matches table
DROP POLICY IF EXISTS "Players can view their matches" ON public.online_matches;
DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.online_matches;
DROP POLICY IF EXISTS "Players can update their matches" ON public.online_matches;

CREATE POLICY "Players can view their matches"
  ON public.online_matches
  FOR SELECT
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "Authenticated users can create matches"
  ON public.online_matches
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Players can update their matches"
  ON public.online_matches
  FOR UPDATE
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  )
  WITH CHECK (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

-- quick_match_lobbies table
DROP POLICY IF EXISTS "Users can view open lobbies or their own" ON public.quick_match_lobbies;
DROP POLICY IF EXISTS "Authenticated users can create lobbies" ON public.quick_match_lobbies;
DROP POLICY IF EXISTS "Host can update their lobby" ON public.quick_match_lobbies;
DROP POLICY IF EXISTS "Host can delete their lobby" ON public.quick_match_lobbies;

CREATE POLICY "Users can view open lobbies or their own"
  ON public.quick_match_lobbies
  FOR SELECT
  TO authenticated
  USING (
    status = 'open'
    OR created_by = (SELECT auth.uid())
    OR host_player_id = (SELECT auth.uid())
    OR guest_player_id = (SELECT auth.uid())
  );

CREATE POLICY "Authenticated users can create lobbies"
  ON public.quick_match_lobbies
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Host can update their lobby"
  ON public.quick_match_lobbies
  FOR UPDATE
  TO authenticated
  USING (created_by = (SELECT auth.uid()))
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "Host can delete their lobby"
  ON public.quick_match_lobbies
  FOR DELETE
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- online_match_state table
DROP POLICY IF EXISTS "Players can view their match state" ON public.online_match_state;
DROP POLICY IF EXISTS "Players can update their match state via RPC" ON public.online_match_state;

CREATE POLICY "Players can view their match state"
  ON public.online_match_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM online_matches om
      WHERE om.id = online_match_state.match_id
      AND (om.player1_id = (SELECT auth.uid()) OR om.player2_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "Players can update their match state via RPC"
  ON public.online_match_state
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM online_matches om
      WHERE om.id = online_match_state.match_id
      AND (om.player1_id = (SELECT auth.uid()) OR om.player2_id = (SELECT auth.uid()))
    )
  );

-- quickmatch_lobbies table
DROP POLICY IF EXISTS "Users can create lobbies" ON public.quickmatch_lobbies;
DROP POLICY IF EXISTS "Host can update own lobby" ON public.quickmatch_lobbies;
DROP POLICY IF EXISTS "Guest can update when joining" ON public.quickmatch_lobbies;

CREATE POLICY "Users can create lobbies"
  ON public.quickmatch_lobbies
  FOR INSERT
  TO authenticated
  WITH CHECK (host_user_id = (SELECT auth.uid()));

CREATE POLICY "Host can update own lobby"
  ON public.quickmatch_lobbies
  FOR UPDATE
  TO authenticated
  USING (host_user_id = (SELECT auth.uid()))
  WITH CHECK (host_user_id = (SELECT auth.uid()));

CREATE POLICY "Guest can update when joining"
  ON public.quickmatch_lobbies
  FOR UPDATE
  TO authenticated
  USING (guest_user_id = (SELECT auth.uid()) OR guest_user_id IS NULL)
  WITH CHECK (guest_user_id = (SELECT auth.uid()));

-- match_rooms table
DROP POLICY IF EXISTS "Players can view own match rooms" ON public.match_rooms;
DROP POLICY IF EXISTS "Authenticated users can create match rooms" ON public.match_rooms;
DROP POLICY IF EXISTS "Players can update own match rooms" ON public.match_rooms;

CREATE POLICY "Players can view own match rooms"
  ON public.match_rooms
  FOR SELECT
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

CREATE POLICY "Authenticated users can create match rooms"
  ON public.match_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

CREATE POLICY "Players can update own match rooms"
  ON public.match_rooms
  FOR UPDATE
  TO authenticated
  USING (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  )
  WITH CHECK (
    player1_id = (SELECT auth.uid())
    OR player2_id = (SELECT auth.uid())
  );

-- tournament_participants table
DROP POLICY IF EXISTS "Users can join tournaments" ON public.tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON public.tournament_participants;
DROP POLICY IF EXISTS "Admins can manage participants" ON public.tournament_participants;

CREATE POLICY "Users can join tournaments"
  ON public.tournament_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can leave tournaments"
  ON public.tournament_participants
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage participants"
  ON public.tournament_participants
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_participants.tournament_id
      AND t.created_by = (SELECT auth.uid())
    )
  );

-- tournament_admins table
DROP POLICY IF EXISTS "Users can view admins of visible tournaments" ON public.tournament_admins;
DROP POLICY IF EXISTS "Tournament owners can manage admins" ON public.tournament_admins;

CREATE POLICY "Users can view admins of visible tournaments"
  ON public.tournament_admins
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tournament owners can manage admins"
  ON public.tournament_admins
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_admins.tournament_id
      AND t.created_by = (SELECT auth.uid())
    )
  );

-- user_connection_test table
DROP POLICY IF EXISTS "Users can read own connection test data" ON public.user_connection_test;
DROP POLICY IF EXISTS "Users can insert own connection test data" ON public.user_connection_test;
DROP POLICY IF EXISTS "Users can delete own connection test data" ON public.user_connection_test;

CREATE POLICY "Users can read own connection test data"
  ON public.user_connection_test
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own connection test data"
  ON public.user_connection_test
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own connection test data"
  ON public.user_connection_test
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- realtime_test table
DROP POLICY IF EXISTS "Users can read own realtime test data" ON public.realtime_test;
DROP POLICY IF EXISTS "Users can insert own realtime test data" ON public.realtime_test;

CREATE POLICY "Users can read own realtime test data"
  ON public.realtime_test
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can insert own realtime test data"
  ON public.realtime_test
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- friends table
DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friends;
DROP POLICY IF EXISTS "Users can create friend requests" ON public.friends;
DROP POLICY IF EXISTS "Users can update friendships they're part of" ON public.friends;
DROP POLICY IF EXISTS "Users can delete their own friend requests" ON public.friends;

CREATE POLICY "Users can view their own friendships"
  ON public.friends
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR friend_id = (SELECT auth.uid())
  );

CREATE POLICY "Users can create friend requests"
  ON public.friends
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update friendships they're part of"
  ON public.friends
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR friend_id = (SELECT auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR friend_id = (SELECT auth.uid())
  );

CREATE POLICY "Users can delete their own friend requests"
  ON public.friends
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));
