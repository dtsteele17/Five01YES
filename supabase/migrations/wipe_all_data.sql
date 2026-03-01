-- ============================================================================
-- WIPE ALL DATA - Fresh Start
-- ============================================================================
-- WARNING: This deletes ALL users, matches, stats, and profiles!
-- Run in Supabase SQL Editor only when you want a complete reset.
-- ============================================================================

-- Wipe all match data
DELETE FROM match_history;
DELETE FROM match_visits;
DELETE FROM match_legs;
DELETE FROM match_rooms;
DELETE FROM quick_match_join_requests;
DELETE FROM quick_match_lobbies;

-- Wipe stats and social
DELETE FROM player_stats;
DELETE FROM friendships;
DELETE FROM friend_requests;

-- Wipe profiles
DELETE FROM profiles;

-- Wipe all auth users
DELETE FROM auth.users;
