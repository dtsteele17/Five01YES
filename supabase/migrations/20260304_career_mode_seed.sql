-- ============================================================
-- FIVE01 Career Mode — Seed Data (Schedule Templates + Sponsors)
-- ============================================================

-- ===================== TIER 1: Local Circuit Trials (day-based) =====================
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, day_based, metadata) VALUES
(1, 1, 'trial_tournament', 'The Brass Anchor Open', 'trial_choice', 3, 8, TRUE, '{"day": 1, "description": "Pick one of three local 8-player tournaments to prove yourself."}'),
(1, 2, 'trial_tournament', 'Local Circuit Cup', 'trial_retry', 3, 8, TRUE, '{"day": 4, "description": "Another shot at a local tournament.", "is_retry": true}'),
(1, 3, 'trial_tournament', 'Neighbourhood Classic', 'trial_final', 3, 8, TRUE, '{"day": 5, "description": "Your last chance to prove yourself on the local circuit."}');

-- ===================== TIER 2: Pub Leagues (8 weeks) =====================
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(2, 1,  'league',    'Weekend League Night — Matchday 1', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 2,  'league',    'Weekend League Night — Matchday 2', 'pub_league', 3, NULL, TRUE,  '{}'),
(2, 3,  'league',    'Weekend League Night — Matchday 3', 'pub_league', 5, NULL, FALSE, '{}'),
(2, 4,  'open',      'The Pub Open',                      'pub_open',   3, 8,   FALSE, '{"rep_multiplier": 1.5}'),
(2, 5,  'league',    'Weekend League Night — Matchday 4', 'pub_league', 5, NULL, TRUE,  '{}'),
(2, 6,  'league',    'Weekend League Night — Matchday 5', 'pub_league', 5, NULL, FALSE, '{}'),
(2, 7,  'league',    'Weekend League Night — Matchday 6', 'pub_league', 5, NULL, FALSE, '{}'),
(2, 8,  'promotion', 'Promotion Weekend',                 'pub_promo',  5, NULL, FALSE, '{"min_avg": 35, "min_checkout_pct": 15, "top_finish": 3}');

-- ===================== TIER 3: County / City Circuit (10 weeks) =====================
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(3, 1,  'league',    'Weekend League Night — Matchday 1',  'county_league', 5, NULL, FALSE, '{}'),
(3, 2,  'league',    'Weekend League Night — Matchday 2',  'county_league', 5, NULL, TRUE,  '{}'),
(3, 3,  'league',    'Weekend League Night — Matchday 3',  'county_league', 5, NULL, FALSE, '{}'),
(3, 4,  'open',      'County Open',                        'county_open',   5, 8,   FALSE, '{"rep_multiplier": 1.5}'),
(3, 5,  'league',    'Weekend League Night — Matchday 4',  'county_league', 7, NULL, TRUE,  '{}'),
(3, 6,  'league',    'Weekend League Night — Matchday 5',  'county_league', 7, NULL, FALSE, '{}'),
(3, 7,  'qualifier', 'County Qualifier',                   'county_qual',   5, 8,   FALSE, '{"rep_multiplier": 1.8, "description": "A taste of the bigger stage."}'),
(3, 8,  'league',    'Weekend League Night — Matchday 6',  'county_league', 7, NULL, FALSE, '{}'),
(3, 9,  'league',    'Weekend League Night — Matchday 7',  'county_league', 7, NULL, TRUE,  '{}'),
(3, 10, 'promotion', 'Promotion Weekend',                  'county_promo',  7, NULL, FALSE, '{"min_avg": 45, "min_checkout_pct": 20, "top_finish": 3}');

-- ===================== TIER 4: Regional Tour (12 weeks) =====================
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(4, 1,  'league',    'Weekend League Night — Matchday 1',   'regional_league', 7,  NULL, FALSE, '{}'),
(4, 2,  'league',    'Weekend League Night — Matchday 2',   'regional_league', 7,  NULL, TRUE,  '{}'),
(4, 3,  'open',      'Regional Open',                       'regional_open',   7,  16,  FALSE, '{"rep_multiplier": 1.8}'),
(4, 4,  'league',    'Weekend League Night — Matchday 3',   'regional_league', 7,  NULL, FALSE, '{}'),
(4, 5,  'league',    'Weekend League Night — Matchday 4',   'regional_league', 9,  NULL, TRUE,  '{}'),
(4, 6,  'open',      'Ranking Open',                        'ranking_open',    7,  16,  FALSE, '{"rep_multiplier": 2.0}'),
(4, 7,  'league',    'Weekend League Night — Matchday 5',   'regional_league', 9,  NULL, FALSE, '{}'),
(4, 8,  'league',    'Weekend League Night — Matchday 6',   'regional_league', 9,  NULL, FALSE, '{}'),
(4, 9,  'qualifier', 'Regional Qualifier',                  'regional_qual',   9,  16,  FALSE, '{"rep_multiplier": 2.0}'),
(4, 10, 'league',    'Weekend League Night — Matchday 7',   'regional_league', 9,  NULL, TRUE,  '{}'),
(4, 11, 'league',    'Weekend League Night — Matchday 8',   'regional_league', 9,  NULL, FALSE, '{}'),
(4, 12, 'promotion', 'Promotion Weekend',                   'regional_promo',  9,  NULL, FALSE, '{"min_avg": 55, "min_checkout_pct": 25, "top_finish": 2}');

-- ===================== TIER 5: World Tour / Majors (14 weeks) =====================
INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(5, 1,  'league',    'Tour League — Matchday 1',    'world_league',   9,  NULL, FALSE, '{}'),
(5, 2,  'open',      'Pro Series Open',             'pro_open',       9,  16,  FALSE, '{"rep_multiplier": 2.0}'),
(5, 3,  'league',    'Tour League — Matchday 2',    'world_league',   9,  NULL, TRUE,  '{}'),
(5, 4,  'qualifier', 'World Qualifier',             'world_qual',     9,  16,  FALSE, '{"rep_multiplier": 2.5}'),
(5, 5,  'league',    'Tour League — Matchday 3',    'world_league',   11, NULL, FALSE, '{}'),
(5, 6,  'league',    'Tour League — Matchday 4',    'world_league',   11, NULL, TRUE,  '{}'),
(5, 7,  'major',     'The Grand Open',              'major_open',     11, 32,  FALSE, '{"rep_multiplier": 3.0, "is_major": true}'),
(5, 8,  'league',    'Tour League — Matchday 5',    'world_league',   11, NULL, FALSE, '{}'),
(5, 9,  'qualifier', 'Championship Qualifier',      'champ_qual',     11, 16,  FALSE, '{"rep_multiplier": 2.5}'),
(5, 10, 'league',    'Tour League — Matchday 6',    'world_league',   11, NULL, FALSE, '{}'),
(5, 11, 'league',    'Tour League — Matchday 7',    'world_league',   11, NULL, TRUE,  '{}'),
(5, 12, 'open',      'Pro Series Open II',          'pro_open',       11, 16,  FALSE, '{"rep_multiplier": 2.0}'),
(5, 13, 'league',    'Tour League — Matchday 8',    'world_league',   13, NULL, FALSE, '{}'),
(5, 14, 'season_finals', 'Season Finals',           'world_finals',   13, 8,   FALSE, '{"rep_multiplier": 4.0, "is_finale": true}');

-- ===================== SPONSOR CATALOG =====================
INSERT INTO career_sponsor_catalog (name, tier_min, tier_max, rep_bonus_pct, rep_objectives, cosmetic_unlock, flavour_text, rarity) VALUES
-- Tier 2 (Pub) sponsors
('Bullseye Brewing',        2, 3, 0.10, '[{"condition": "win_3_league", "bonus_rep": 200, "description": "Win 3 league matches"}]',
 'title_bullseye_brewer', 'Bullseye Brewing wants to back your pub league run.', 'common'),
('Steeltip Supplies',       2, 3, 0.05, '[{"condition": "hit_3_180s", "bonus_rep": 300, "description": "Hit 3 maximums this season"}]',
 'title_steeltip', 'Steeltip Supplies — darts gear for the up-and-comer.', 'common'),
('The Dartboard Diner',     2, 3, 0.08, '[{"condition": "checkout_100_plus", "bonus_rep": 250, "description": "Hit a 100+ checkout"}]',
 'badge_diner', 'Free chips with every win. The Dartboard Diner is in your corner.', 'common'),
('Tungsten Terry''s',       2, 4, 0.12, '[{"condition": "avg_above_40", "bonus_rep": 350, "description": "Average above 40 for 3 matches"}]',
 'title_tungsten', 'Tungsten Terry says you''ve got potential.', 'uncommon'),

-- Tier 3 (County) sponsors
('County Darts Association', 3, 4, 0.10, '[{"condition": "reach_open_final", "bonus_rep": 500, "description": "Reach an Open final"}]',
 'badge_county', 'The County DA is watching your progress.', 'common'),
('Arrows & Ales',           3, 4, 0.15, '[{"condition": "win_5_matches", "bonus_rep": 400, "description": "Win 5 matches this season"}]',
 'title_arrows_ales', 'Arrows & Ales — proud sponsors of county darts.', 'uncommon'),
('Oche Energy Drinks',      3, 5, 0.08, '[{"condition": "hit_5_180s", "bonus_rep": 500, "description": "Hit 5 maximums"}]',
 'badge_oche_energy', 'Oche Energy — fuel for the throw.', 'uncommon'),

-- Tier 4 (Regional) sponsors
('Flight Path Athletics',   4, 5, 0.15, '[{"condition": "win_qualifier", "bonus_rep": 800, "description": "Win a qualifier"}]',
 'title_flight_path', 'Flight Path Athletics sees a regional star in the making.', 'uncommon'),
('Treble Twenty Media',     4, 5, 0.12, '[{"condition": "avg_above_60", "bonus_rep": 700, "description": "Average above 60 for 3 matches"}]',
 'badge_t20_media', 'Treble Twenty Media wants to tell your story.', 'rare'),
('Double Top Motors',       4, 5, 0.18, '[{"condition": "hit_10_180s", "bonus_rep": 1000, "description": "Hit 10 maximums this season"}]',
 'title_double_top', 'Double Top Motors — driving you to the top.', 'rare'),

-- Tier 5 (World) sponsors
('Tungsten Elite',          5, 5, 0.20, '[{"condition": "win_major", "bonus_rep": 2000, "description": "Win a Major"}]',
 'title_tungsten_elite', 'Tungsten Elite — the biggest brand in darts wants you.', 'rare'),
('Maximum 180 Sports',      5, 5, 0.15, '[{"condition": "hit_20_180s", "bonus_rep": 1500, "description": "Hit 20 maximums this season"}]',
 'badge_max180', 'Maximum 180 Sports — for those who never miss treble 20.', 'legendary'),
('World Darts Corp',        5, 5, 0.25, '[{"condition": "top_4_world_ranking", "bonus_rep": 3000, "description": "Finish Top 4 in World Rankings"}]',
 'title_wdc', 'World Darts Corp — the pinnacle of sponsorship.', 'legendary');
