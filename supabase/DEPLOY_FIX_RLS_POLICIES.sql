ALTER TABLE career_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_sponsor_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own career brackets" ON career_brackets;
CREATE POLICY "Users can read own career brackets" ON career_brackets
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert own career brackets" ON career_brackets;
CREATE POLICY "Users can insert own career brackets" ON career_brackets
  FOR INSERT WITH CHECK (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own career brackets" ON career_brackets;
CREATE POLICY "Users can update own career brackets" ON career_brackets
  FOR UPDATE USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can read own sponsor contracts" ON career_sponsor_contracts;
CREATE POLICY "Users can read own sponsor contracts" ON career_sponsor_contracts
  FOR SELECT USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update own sponsor contracts" ON career_sponsor_contracts;
CREATE POLICY "Users can update own sponsor contracts" ON career_sponsor_contracts
  FOR UPDATE USING (career_id IN (SELECT id FROM career_profiles WHERE user_id = auth.uid()));
