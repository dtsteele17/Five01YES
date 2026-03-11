ALTER TABLE career_brackets DROP CONSTRAINT IF EXISTS career_brackets_bracket_size_check;
ALTER TABLE career_brackets ADD CONSTRAINT career_brackets_bracket_size_check CHECK (bracket_size IN (4, 8, 16, 32, 64, 128));
