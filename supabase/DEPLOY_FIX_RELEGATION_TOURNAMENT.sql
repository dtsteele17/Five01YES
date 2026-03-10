DELETE FROM career_schedule_templates WHERE event_type = 'relegation_tournament';

UPDATE career_events SET status = 'skipped'
WHERE event_type = 'relegation_tournament'
  AND status IN ('pending', 'active', 'pending_invite');
