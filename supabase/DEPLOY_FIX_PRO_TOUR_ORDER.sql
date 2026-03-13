UPDATE career_schedule_templates SET sequence_no = 99 WHERE tier = 5 AND event_subtype = 'ws_usa';
UPDATE career_schedule_templates SET sequence_no = 98 WHERE tier = 5 AND event_subtype = 'pro_major_england';
UPDATE career_schedule_templates SET sequence_no = 9 WHERE tier = 5 AND sequence_no = 99;
UPDATE career_schedule_templates SET sequence_no = 8 WHERE tier = 5 AND sequence_no = 98;

UPDATE career_events ce
SET sequence_no = 99
FROM career_profiles cp
WHERE ce.career_id = cp.id AND cp.tier = 5
  AND ce.event_type = 'pro_world_series' AND ce.sequence_no = 8;

UPDATE career_events ce
SET sequence_no = 8
FROM career_profiles cp
WHERE ce.career_id = cp.id AND cp.tier = 5
  AND ce.event_type = 'pro_major' AND ce.sequence_no = 7;

UPDATE career_events ce
SET sequence_no = 9
FROM career_profiles cp
WHERE ce.career_id = cp.id AND cp.tier = 5
  AND ce.event_type = 'pro_world_series' AND ce.sequence_no = 99;

UPDATE career_events ce
SET sequence_no = 7
FROM career_profiles cp
WHERE ce.career_id = cp.id AND cp.tier = 5
  AND ce.event_type = 'pro_major_qualifier';
