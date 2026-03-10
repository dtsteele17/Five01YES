UPDATE career_events SET template_id = NULL WHERE template_id IN (SELECT id FROM career_schedule_templates WHERE tier = 2);

DELETE FROM career_schedule_templates WHERE tier = 2;

INSERT INTO career_schedule_templates (tier, sequence_no, event_type, event_name, event_subtype, format_legs, bracket_size, training_available, metadata) VALUES
(2, 1, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 2, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 3, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 4, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 5, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 6, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}'),
(2, 7, 'league', 'Weekend League Night', 'pub_league', 3, NULL, FALSE, '{}');
