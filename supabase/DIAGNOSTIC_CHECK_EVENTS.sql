-- Run this to check what's happening with career events
-- Replace the UUID below with your career ID from the URL

-- Check career profile
SELECT id, tier, season, week, day FROM career_profiles WHERE id = 'PASTE_CAREER_ID_HERE';

-- Check events for this career's current season
SELECT id, season, sequence_no, event_type, event_name, status, day 
FROM career_events 
WHERE career_id = 'PASTE_CAREER_ID_HERE'
ORDER BY season DESC, sequence_no ASC;

-- Check league standings
SELECT season, tier, is_player, opponent_id, played, points 
FROM career_league_standings 
WHERE career_id = 'PASTE_CAREER_ID_HERE'
ORDER BY season DESC, points DESC;

-- Check schedule templates for tier 2
SELECT * FROM career_schedule_templates WHERE tier = 2;
