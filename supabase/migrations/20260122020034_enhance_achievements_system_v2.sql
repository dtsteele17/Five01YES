-- Enhance Achievements System
--
-- 1. Schema Changes
--    - Add type, goal_value, and stat_key columns to achievements table
--    - type: counter, boolean, best, milestone
--    - goal_value: target value for completion
--    - stat_key: which stat to track
--
-- 2. Clear existing achievements and reseed with all 80
--
-- 3. No changes needed to user_achievements (already correct)

-- Add new columns to achievements table
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'counter' 
  CHECK (type IN ('counter', 'boolean', 'best', 'milestone'));
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS goal_value integer;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS stat_key text;

-- Clear existing achievements for fresh seed
DELETE FROM achievements;

-- Seed all 80 achievements with tracking metadata
-- Categories: General, Funny, Scoring, Finishing, Streaks, Competitive

-- Tournaments (Competitive)
INSERT INTO achievements (code, name, description, category, icon, xp, tier, type, goal_value, stat_key) VALUES
('first-blood', 'First Blood', 'Win your first tournament match', 'Competitive', '🏆', 100, 'Common', 'milestone', 1, 'tournament_matches_won'),
('champion', 'Champion', 'Win 1 tournament', 'Competitive', '🏆', 250, 'Rare', 'milestone', 1, 'tournaments_won'),
('serial-winner', 'Serial Winner', 'Win 5 tournaments', 'Competitive', '🏅', 500, 'Epic', 'counter', 5, 'tournaments_won'),
('trophy-cabinet', 'Trophy Cabinet', 'Win 10 tournaments', 'Competitive', '🏆', 1000, 'Epic', 'counter', 10, 'tournaments_won'),
('elite-champion', 'Elite Champion', 'Win 25 tournaments', 'Competitive', '👑', 2500, 'Legendary', 'counter', 25, 'tournaments_won'),
('tournament-monster', 'Tournament Monster', 'Win 50 tournaments', 'Competitive', '🔥', 5000, 'Legendary', 'counter', 50, 'tournaments_won'),
('legendary', 'Legendary', 'Win 100 tournaments', 'Competitive', '⭐', 10000, 'Legendary', 'counter', 100, 'tournaments_won'),
('bracket-buster', 'Bracket Buster', 'Win a tournament without losing a leg', 'Competitive', '⚡', 750, 'Rare', 'boolean', 1, 'perfect_tournament'),
('final-boss', 'Final Boss', 'Win a tournament final from behind', 'Competitive', '🎯', 750, 'Rare', 'boolean', 1, 'comeback_final'),
('weekend-warrior', 'Weekend Warrior', 'Win a weekend tournament', 'Competitive', '📅', 300, 'Common', 'boolean', 1, 'weekend_tournament_won'),

-- League (Competitive)
('joined-ranks', 'Joined the Ranks', 'Join your first league', 'Competitive', '👥', 100, 'Common', 'milestone', 1, 'leagues_joined'),
('league-winner', 'League Winner', 'Win 1 league title', 'Competitive', '🏆', 500, 'Rare', 'milestone', 1, 'leagues_won'),
('dominant-season', 'Dominant Season', 'Win 5 league titles', 'Competitive', '🏅', 2000, 'Epic', 'counter', 5, 'leagues_won'),
('dynasty', 'Dynasty', 'Win 10 league titles', 'Competitive', '👑', 5000, 'Epic', 'counter', 10, 'leagues_won'),
('immortal', 'Immortal', 'Win 25 league titles', 'Competitive', '⭐', 10000, 'Legendary', 'counter', 25, 'leagues_won'),
('the-gaffer', 'The Gaffer', 'Create a league', 'Competitive', '➕', 200, 'Common', 'milestone', 1, 'leagues_created'),
('invincible-season', 'Invincible Season', 'Finish a league unbeaten', 'Competitive', '🛡️', 1000, 'Legendary', 'boolean', 1, 'unbeaten_league'),
('great-escape', 'Great Escape', 'Avoid relegation on the final match', 'Competitive', '❤️', 250, 'Rare', 'boolean', 1, 'great_escape'),
('promotion-party', 'Promotion Party', 'Earn promotion', 'Competitive', '📈', 400, 'Common', 'milestone', 1, 'promotions'),
('relegation-tears', 'Relegation Tears', 'Get relegated twice', 'Funny', '😢', 50, 'Common', 'counter', 2, 'relegations'),

-- Scoring
('boom', 'Boom!', 'Hit your first 180', 'Scoring', '🎯', 150, 'Common', 'milestone', 1, 'oneEighties'),
('maximum-effort', 'Maximum Effort', 'Hit 5x 180s', 'Scoring', '⚡', 300, 'Rare', 'counter', 5, 'oneEighties'),
('ton-80-club', 'The Ton 80 Club', 'Hit 10x 180s', 'Scoring', '⭐', 600, 'Epic', 'counter', 10, 'oneEighties'),
('treble-trouble', 'Treble Trouble', 'Hit 25x 180s', 'Scoring', '🔥', 1500, 'Epic', 'counter', 25, 'oneEighties'),
('180-machine', '180 Machine', 'Hit 50x 180s', 'Scoring', '💻', 3000, 'Legendary', 'counter', 50, 'oneEighties'),
('maximum-overload', 'Maximum Overload', 'Hit 100x 180s', 'Scoring', '🚀', 6000, 'Legendary', 'counter', 100, 'oneEighties'),
('treble-factory', 'Treble Factory', 'Hit 250x 180s', 'Scoring', '🏭', 15000, 'Legendary', 'counter', 250, 'oneEighties'),
('treble-god', 'Treble God', 'Hit 500x 180s', 'Scoring', '👑', 30000, 'Legendary', 'counter', 500, 'oneEighties'),
('back-to-back', 'Back-to-Back', 'Hit 2 consecutive 180s in one match', 'Streaks', '🔁', 500, 'Epic', 'boolean', 1, 'consecutive_180s'),
('180-under-pressure', '180 Under Pressure', 'Hit a 180 to win a deciding leg', 'Scoring', '🎯', 750, 'Legendary', 'boolean', 1, 'clutch_180'),

-- Finishing/Checkouts
('checked-out', 'Checked Out', 'Win a leg by checkout', 'Finishing', '✅', 50, 'Common', 'milestone', 1, 'checkoutsMade'),
('cool-hand', 'Cool Hand', 'Checkout above 100', 'Finishing', '⭕', 200, 'Rare', 'best', 100, 'highestCheckout'),
('big-finish', 'Big Finish', 'Checkout above 120', 'Finishing', '🎯', 300, 'Rare', 'best', 120, 'highestCheckout'),
('clutch-finisher', 'Clutch Finisher', 'Checkout above 150', 'Finishing', '⚡', 500, 'Epic', 'best', 150, 'highestCheckout'),
('out-in-style', 'Out in Style', 'Checkout with bull', 'Finishing', '💿', 250, 'Rare', 'boolean', 1, 'bull_checkout'),
('double-trouble', 'Double Trouble', 'Miss 5 doubles in a row', 'Funny', '❌', 100, 'Common', 'boolean', 1, 'missed_5_doubles'),
('ice-cold', 'Ice Cold', 'Checkout on first dart at double', 'Finishing', '❄️', 400, 'Epic', 'boolean', 1, 'first_dart_checkout'),
('shanghai-surprise', 'Shanghai Surprise', 'Hit a Shanghai finish', 'Finishing', '✨', 500, 'Legendary', 'boolean', 1, 'shanghai_finish'),
('170-club', '170 Club', 'Checkout 170', 'Finishing', '🏅', 1000, 'Legendary', 'best', 170, 'highestCheckout'),

-- High Scoring
('ton-up', 'Ton Up', 'Hit 100+', 'Scoring', '⬆️', 100, 'Common', 'milestone', 1, 'count100Plus'),
('ton-machine', 'Ton Machine', 'Hit 10x 100+', 'Scoring', '🔁', 300, 'Rare', 'counter', 10, 'count100Plus'),

-- Averages
('heavy-scorer', 'Heavy Scorer', 'Average 60+ in a match', 'General', '📈', 200, 'Rare', 'best', 60, 'threeDartAverage'),
('serious-business', 'Serious Business', 'Average 80+ in a match', 'General', '📊', 400, 'Epic', 'best', 80, 'threeDartAverage'),
('centurion', 'Centurion', 'Average 100+ in a match', 'General', '🏆', 1000, 'Legendary', 'best', 100, 'threeDartAverage'),

-- Match Achievements
('the-wall', 'The Wall', 'Win a match without dropping a leg', 'General', '🛡️', 300, 'Rare', 'boolean', 1, 'whitewash_win'),
('early-doors', 'Early Doors', 'Win a match in under 10 minutes', 'General', '⏱️', 250, 'Rare', 'boolean', 1, 'quick_win'),

-- Funny - Score 26
('feared-number', 'The Feared Number', 'Score 26 for the first time', 'Funny', '⚠️', 10, 'Common', 'milestone', 1, 'score_26'),
('double-13-specialist', 'Double 13 Specialist', 'Score 26 ten times', 'Funny', '😢', 100, 'Rare', 'counter', 10, 'score_26'),
('pain-merchant', 'Pain Merchant', 'Score 26 fifty times', 'Funny', '💀', 500, 'Epic', 'counter', 50, 'score_26'),
('anti-checkout', 'Anti-Checkout', 'Score 26 one hundred times', 'Funny', '❌', 1000, 'Legendary', 'counter', 100, 'score_26'),
('dartboard-hates-me', 'Dartboard Hates Me', 'Score 26 three times in one match', 'Funny', '😡', 200, 'Rare', 'boolean', 1, 'score_26_3x_match'),

-- Ranked
('ranked-rookie', 'Ranked Rookie', 'Play your first ranked match', 'Competitive', '▶️', 100, 'Common', 'milestone', 1, 'ranked_matches_played'),
('on-the-ladder', 'On The Ladder', 'Win 5 ranked matches', 'Competitive', '📈', 250, 'Rare', 'counter', 5, 'ranked_wins'),
('ranked-grinder', 'Ranked Grinder', 'Win 25 ranked matches', 'Competitive', '🏅', 1000, 'Epic', 'counter', 25, 'ranked_wins'),
('sweaty-hands', 'Sweaty Hands', 'Win 50 ranked matches', 'Competitive', '💧', 2000, 'Epic', 'counter', 50, 'ranked_wins'),
('the-tryhard', 'The Tryhard', 'Win 100 ranked matches', 'Funny', '🔥', 5000, 'Legendary', 'counter', 100, 'ranked_wins'),
('win-streak', 'Win Streak', 'Win 5 ranked matches in a row', 'Streaks', '⚡', 500, 'Epic', 'boolean', 5, 'ranked_win_streak'),
('unstoppable', 'Unstoppable', 'Win 10 ranked matches in a row', 'Streaks', '🚀', 1000, 'Legendary', 'boolean', 10, 'ranked_win_streak'),
('revenge-arc', 'Revenge Arc', 'Beat a player who beat you last time', 'Competitive', '↩️', 300, 'Rare', 'boolean', 1, 'revenge_match'),
('promotion-secured', 'Promotion Secured', 'Reach a new division', 'Competitive', '⏫', 400, 'Rare', 'milestone', 1, 'rank_promotions'),

-- Milestones
('friendly-fire', 'Friendly Fire', 'Play a private match', 'General', '👥', 50, 'Common', 'milestone', 1, 'private_matches'),
('rivalry', 'Rivalry', 'Play the same opponent 10 times', 'General', '⚔️', 500, 'Epic', 'counter', 10, 'same_opponent'),
('best-frenemies', 'Best Frenemies', 'Beat your friend 25 times', 'Funny', '😂', 1000, 'Epic', 'counter', 25, 'beat_friend'),
('group-chat-hero', 'Group Chat Hero', 'Win a match after trash talk', 'Funny', '💬', 200, 'Rare', 'boolean', 1, 'trash_talk_win'),

-- Practice
('warm-up', 'Warm Up', 'Complete 10 practice sessions', 'General', '⚡', 150, 'Common', 'counter', 10, 'training_matches'),
('dedicated', 'Dedicated', 'Practice 50 times', 'General', '🎯', 500, 'Rare', 'counter', 50, 'training_matches'),
('training-arc', 'Training Arc', 'Practice 100 times', 'General', '🏋️', 1000, 'Epic', 'counter', 100, 'training_matches'),
('bullseye-hunter', 'Bullseye Hunter', 'Hit 25 bulls in practice', 'General', '⭕', 400, 'Rare', 'counter', 25, 'bulls_hit'),
('robin-hood', 'Robin Hood', 'Hit the same treble 3 darts in a row', 'General', '🎯', 500, 'Legendary', 'boolean', 1, 'robin_hood'),

-- Around The Clock
('clock-starter', 'Clock Starter', 'Complete Around The Clock once', 'General', '⏰', 100, 'Common', 'milestone', 1, 'atc_completions'),
('clock-master', 'Clock Master', 'Complete 10 times', 'General', '⏱️', 500, 'Rare', 'counter', 10, 'atc_completions'),
('clock-legend', 'Clock Legend', 'Complete 50 times', 'General', '🏅', 2000, 'Epic', 'counter', 50, 'atc_completions'),
('speed-runner', 'Speed Runner', 'Complete Around The Clock under 5 minutes', 'General', '⚡', 750, 'Epic', 'boolean', 1, 'atc_speed'),
('missed-20-times', 'Missed 20 Times', 'Miss the same number 20 times', 'Funny', '😢', 200, 'Rare', 'counter', 20, 'atc_misses'),

-- More Funny
('pub-thrower', 'The Pub Thrower', 'Win a match with a lower average than your opponent', 'Funny', '🍺', 300, 'Rare', 'boolean', 1, 'lower_avg_win'),
('bottle-job', 'The Bottle Job', 'Lose a match from 1 dart away', 'Funny', '⚠️', 150, 'Rare', 'boolean', 1, 'bottle_job'),
('dartboard-bully', 'Dartboard Bully', 'Hit 20 twenty times in a row', 'General', '🎯', 800, 'Epic', 'boolean', 20, 'hit_20_streak'),
('wall-inspector', 'The Wall Inspector', 'Miss the board 10 times in 1 game', 'Funny', '🏠', 100, 'Rare', 'boolean', 10, 'miss_board'),
('respectfully', 'Respectfully', 'Win then immediately rematch 5 times', 'Funny', '🤝', 300, 'Rare', 'counter', 5, 'rematch_wins'),
('nice', 'Nice.', 'Score exactly 69 in a single visit', 'Funny', '😊', 69, 'Common', 'milestone', 1, 'score_69');