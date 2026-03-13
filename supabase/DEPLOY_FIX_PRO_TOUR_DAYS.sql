UPDATE career_events ce
SET day = cp.day + (ce.sequence_no * 14)
FROM career_profiles cp
WHERE ce.career_id = cp.id
  AND cp.tier = 5
  AND ce.season = cp.season
  AND ce.event_type IN ('pro_players_championship', 'pro_open', 'pro_major', 'pro_major_qualifier', 'pro_world_series')
  AND ce.status IN ('pending', 'active');
