DELETE FROM career_brackets
WHERE status = 'active'
  AND (bracket_data IS NULL OR bracket_data = '{}'::JSONB OR bracket_data = '[]'::JSONB);
