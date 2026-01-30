/*
  # Seed Achievements Data
  
  ## Overview
  This migration seeds the achievements table with initial achievement definitions
  across various categories including the famous "Score 69" achievement.
  
  ## Achievements Seeded
  
  ### Funny Category
  - Score 69 (SCORE_69) - Score exactly 69 in a visit
  - Snake Eyes (SNAKE_EYES) - Score 22 with two single 11s
  - Zero Hero (ZERO_HERO) - Score 0 in a visit (all misses)
  
  ### Scoring Category
  - Century (CENTURY) - Score 100+ in a single visit
  - High Roller (HIGH_ROLLER) - Score 140+ in a single visit
  - Perfect Game (PERFECT_180) - Score 180 in a single visit
  - Consistency King (CONSISTENCY) - Maintain 80+ average for full match
  
  ### Finishing Category
  - First Checkout (FIRST_CHECKOUT) - Win your first leg
  - Double Trouble (DOUBLE_TROUBLE) - Checkout with a double
  - Big Fish (BIG_FISH) - Checkout 170
  - Nine Darter (NINE_DARTER) - Win a leg in 9 darts
  
  ### General Category
  - First Steps (FIRST_MATCH) - Complete your first match
  - Dedicated (PLAY_10_MATCHES) - Play 10 matches
  - Competitor (PLAY_50_MATCHES) - Play 50 matches
  - Legend (PLAY_100_MATCHES) - Play 100 matches
  
  ### Streaks Category
  - Win Streak (WIN_STREAK_3) - Win 3 matches in a row
  - Hot Streak (WIN_STREAK_5) - Win 5 matches in a row
  - Unstoppable (WIN_STREAK_10) - Win 10 matches in a row
  
  ### Competitive Category
  - Ranked Rookie (FIRST_RANKED) - Play first ranked match
  - Rising Star (REACH_SILVER) - Reach Silver tier
  - Golden Touch (REACH_GOLD) - Reach Gold tier
  - Elite Player (REACH_PLATINUM) - Reach Platinum tier
  - Champion (REACH_CHAMPION) - Reach Champion tier
  - Grand Master (REACH_GRAND_CHAMPION) - Reach Grand Champion tier
*/

INSERT INTO achievements (code, category, name, description, icon, condition, xp, tier) VALUES
  -- Funny Category
  ('SCORE_69', 'Funny', 'Nice.', 'Score exactly 69 in a visit.', '😏', '{"type":"visit_score","value":69}'::jsonb, 69, 'Rare'),
  ('SNAKE_EYES', 'Funny', 'Snake Eyes', 'Score 22 with two single 11s.', '🐍', '{"type":"specific_score","value":22}'::jsonb, 25, 'Common'),
  ('ZERO_HERO', 'Funny', 'Zero Hero', 'Score 0 in a visit (all misses).', '🫥', '{"type":"visit_score","value":0}'::jsonb, 10, 'Common'),
  
  -- Scoring Category
  ('CENTURY', 'Scoring', 'Century', 'Score 100+ in a single visit.', '💯', '{"type":"visit_score_min","value":100}'::jsonb, 100, 'Common'),
  ('HIGH_ROLLER', 'Scoring', 'High Roller', 'Score 140+ in a single visit.', '🎰', '{"type":"visit_score_min","value":140}'::jsonb, 140, 'Rare'),
  ('PERFECT_180', 'Scoring', 'Perfect Game', 'Score 180 in a single visit (3x Triple 20).', '🎯', '{"type":"visit_score","value":180}'::jsonb, 180, 'Epic'),
  ('CONSISTENCY', 'Scoring', 'Consistency King', 'Maintain 80+ three-dart average for a full match.', '👑', '{"type":"match_average","value":80}'::jsonb, 150, 'Epic'),
  
  -- Finishing Category
  ('FIRST_CHECKOUT', 'Finishing', 'First Checkout', 'Win your first leg.', '🎊', '{"type":"checkout_count","value":1}'::jsonb, 50, 'Common'),
  ('DOUBLE_TROUBLE', 'Finishing', 'Double Trouble', 'Checkout with a double.', '✌️', '{"type":"double_checkout","value":true}'::jsonb, 50, 'Common'),
  ('BIG_FISH', 'Finishing', 'Big Fish', 'Checkout 170 (T20, T20, Bull).', '🐟', '{"type":"checkout_value","value":170}'::jsonb, 170, 'Legendary'),
  ('NINE_DARTER', 'Finishing', 'Nine Darter', 'Win a leg in exactly 9 darts (perfect leg).', '⚡', '{"type":"leg_darts","value":9}'::jsonb, 501, 'Legendary'),
  
  -- General Category
  ('FIRST_MATCH', 'General', 'First Steps', 'Complete your first match.', '🚀', '{"type":"match_count","value":1}'::jsonb, 25, 'Common'),
  ('PLAY_10_MATCHES', 'General', 'Dedicated', 'Play 10 matches.', '💪', '{"type":"match_count","value":10}'::jsonb, 100, 'Common'),
  ('PLAY_50_MATCHES', 'General', 'Competitor', 'Play 50 matches.', '🏆', '{"type":"match_count","value":50}'::jsonb, 250, 'Rare'),
  ('PLAY_100_MATCHES', 'General', 'Legend', 'Play 100 matches.', '🌟', '{"type":"match_count","value":100}'::jsonb, 500, 'Epic'),
  
  -- Streaks Category
  ('WIN_STREAK_3', 'Streaks', 'Win Streak', 'Win 3 matches in a row.', '🔥', '{"type":"win_streak","value":3}'::jsonb, 75, 'Common'),
  ('WIN_STREAK_5', 'Streaks', 'Hot Streak', 'Win 5 matches in a row.', '🔥🔥', '{"type":"win_streak","value":5}'::jsonb, 150, 'Rare'),
  ('WIN_STREAK_10', 'Streaks', 'Unstoppable', 'Win 10 matches in a row.', '🔥🔥🔥', '{"type":"win_streak","value":10}'::jsonb, 300, 'Epic'),
  
  -- Competitive Category
  ('FIRST_RANKED', 'Competitive', 'Ranked Rookie', 'Play your first ranked match.', '🎮', '{"type":"ranked_count","value":1}'::jsonb, 50, 'Common'),
  ('REACH_SILVER', 'Competitive', 'Rising Star', 'Reach Silver tier in ranked play.', '🥈', '{"type":"rank_tier","value":"Silver"}'::jsonb, 100, 'Common'),
  ('REACH_GOLD', 'Competitive', 'Golden Touch', 'Reach Gold tier in ranked play.', '🥇', '{"type":"rank_tier","value":"Gold"}'::jsonb, 200, 'Rare'),
  ('REACH_PLATINUM', 'Competitive', 'Elite Player', 'Reach Platinum tier in ranked play.', '💎', '{"type":"rank_tier","value":"Platinum"}'::jsonb, 300, 'Epic'),
  ('REACH_CHAMPION', 'Competitive', 'Champion', 'Reach Champion tier in ranked play.', '👑', '{"type":"rank_tier","value":"Champion"}'::jsonb, 500, 'Legendary'),
  ('REACH_GRAND_CHAMPION', 'Competitive', 'Grand Master', 'Reach Grand Champion tier - the highest rank!', '💫', '{"type":"rank_tier","value":"Grand Champion"}'::jsonb, 1000, 'Legendary')
ON CONFLICT (code) DO NOTHING;
