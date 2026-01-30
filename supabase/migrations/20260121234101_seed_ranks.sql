/*
  # Seed Ranks Data
  
  ## Overview
  This migration seeds the ranks table with all tier and division combinations
  with continuous RP ranges (no gaps). Players progress from Bronze 1 to Grand Champion 4.
  
  ## Rank Structure
  
  Each tier has 4 divisions (1 = lowest, 4 = highest within tier):
  
  ### Bronze (0-399 RP)
  - Bronze 1: 0-99 RP
  - Bronze 2: 100-199 RP
  - Bronze 3: 200-299 RP
  - Bronze 4: 300-399 RP
  
  ### Silver (400-799 RP)
  - Silver 1: 400-499 RP
  - Silver 2: 500-599 RP
  - Silver 3: 600-699 RP
  - Silver 4: 700-799 RP
  
  ### Gold (800-1199 RP)
  - Gold 1: 800-899 RP
  - Gold 2: 900-999 RP
  - Gold 3: 1000-1099 RP
  - Gold 4: 1100-1199 RP
  
  ### Platinum (1200-1599 RP)
  - Platinum 1: 1200-1299 RP
  - Platinum 2: 1300-1399 RP
  - Platinum 3: 1400-1499 RP
  - Platinum 4: 1500-1599 RP
  
  ### Champion (1600-1999 RP)
  - Champion 1: 1600-1699 RP
  - Champion 2: 1700-1799 RP
  - Champion 3: 1800-1899 RP
  - Champion 4: 1900-1999 RP
  
  ### Grand Champion (2000+ RP)
  - Grand Champion 1: 2000-2249 RP
  - Grand Champion 2: 2250-2499 RP
  - Grand Champion 3: 2500-2999 RP
  - Grand Champion 4: 3000+ RP (no upper limit)
*/

INSERT INTO ranks (tier, division, min_rp, max_rp, icon, color, order_index) VALUES
  -- Bronze (0-399)
  ('Bronze', 1, 0, 99, '🥉', '#CD7F32', 1),
  ('Bronze', 2, 100, 199, '🥉', '#CD7F32', 2),
  ('Bronze', 3, 200, 299, '🥉', '#CD7F32', 3),
  ('Bronze', 4, 300, 399, '🥉', '#CD7F32', 4),
  
  -- Silver (400-799)
  ('Silver', 1, 400, 499, '🥈', '#C0C0C0', 5),
  ('Silver', 2, 500, 599, '🥈', '#C0C0C0', 6),
  ('Silver', 3, 600, 699, '🥈', '#C0C0C0', 7),
  ('Silver', 4, 700, 799, '🥈', '#C0C0C0', 8),
  
  -- Gold (800-1199)
  ('Gold', 1, 800, 899, '🥇', '#FFD700', 9),
  ('Gold', 2, 900, 999, '🥇', '#FFD700', 10),
  ('Gold', 3, 1000, 1099, '🥇', '#FFD700', 11),
  ('Gold', 4, 1100, 1199, '🥇', '#FFD700', 12),
  
  -- Platinum (1200-1599)
  ('Platinum', 1, 1200, 1299, '💎', '#E5E4E2', 13),
  ('Platinum', 2, 1300, 1399, '💎', '#E5E4E2', 14),
  ('Platinum', 3, 1400, 1499, '💎', '#E5E4E2', 15),
  ('Platinum', 4, 1500, 1599, '💎', '#E5E4E2', 16),
  
  -- Champion (1600-1999)
  ('Champion', 1, 1600, 1699, '👑', '#9B59B6', 17),
  ('Champion', 2, 1700, 1799, '👑', '#9B59B6', 18),
  ('Champion', 3, 1800, 1899, '👑', '#9B59B6', 19),
  ('Champion', 4, 1900, 1999, '👑', '#9B59B6', 20),
  
  -- Grand Champion (2000+)
  ('Grand Champion', 1, 2000, 2249, '💫', '#FF6B6B', 21),
  ('Grand Champion', 2, 2250, 2499, '💫', '#FF6B6B', 22),
  ('Grand Champion', 3, 2500, 2999, '💫', '#FF6B6B', 23),
  ('Grand Champion', 4, 3000, 999999, '💫', '#FF6B6B', 24)
ON CONFLICT (tier, division) DO NOTHING;
