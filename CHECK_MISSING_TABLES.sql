/*
  # Check Which Tables Are Missing

  Run this in Supabase SQL Editor to see which tables need to be created.
  This will show you a complete list of expected vs actual tables.
*/

-- List of all tables that SHOULD exist based on your migrations
WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'profiles',
    'leagues',
    'league_members',
    'league_matches',
    'tournaments',
    'tournament_participants',
    'tournament_players',
    'tournament_matches',
    'tournament_match_ready',
    'tournament_scheduler_log',
    'matches',
    'match_players',
    'match_visits',
    'match_events',
    'match_rooms',
    'match_rematches',
    'match_signals',
    'match_call_signals',
    'match_chat_messages',
    'match_chat_reads',
    'notifications',
    'user_achievements',
    'achievements_master',
    'user_stats',
    'player_stats',
    'quick_match_lobbies',
    'quick_match_visits',
    'ranked_queue',
    'ranked_match_rooms',
    'ranked_match_visits',
    'ranked_matches',
    'ranked_player_state',
    'ranked_rating_history',
    'ranked_seasons',
    'ranked_tiers',
    'friends',
    'friend_requests',
    'friend_conversations',
    'friend_messages',
    'private_match_invites',
    'training_sessions',
    'training_throws',
    'finish_training_sessions',
    'finish_training_darts',
    'finish_training_checkouts',
    'trust_ratings',
    'trust_rating_events',
    'user_presence'
  ]) AS table_name
),
actual_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
)
SELECT
  e.table_name,
  CASE
    WHEN a.table_name IS NOT NULL THEN '✓ EXISTS'
    ELSE '✗ MISSING'
  END as status
FROM expected_tables e
LEFT JOIN actual_tables a ON e.table_name = a.table_name
ORDER BY
  CASE WHEN a.table_name IS NULL THEN 0 ELSE 1 END,
  e.table_name;
