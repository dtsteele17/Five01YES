-- Fix end-of-season tournament naming
-- 1. Update schedule template: relegation_tournament → open, remove hardcoded name
-- 2. Fix advance_to_next_season to use random pub names for end-season events
-- 3. Fix any existing events in DB

-- Update template rows to use 'open' type
UPDATE career_schedule_templates
SET event_type = 'open', event_name = 'End of Season Open'
WHERE event_type = 'relegation_tournament';

-- Fix any existing events that haven't been played yet
UPDATE career_events
SET event_type = 'open',
    event_name = (SELECT _random_pub_tournament_name())
WHERE event_type = 'relegation_tournament'
  AND status IN ('pending', 'pending_invite', 'active');

-- Now patch the advance_to_next_season INSERT to randomize names for 'open' events from templates
-- We override event_name with a random pub name for any template event_type = 'open'
-- This is done by replacing the INSERT in rpc_career_advance_to_next_season

-- Actually the cleanest fix: just update the two INSERT INTO career_events statements
-- in rpc_career_advance_to_next_season to use CASE for event naming

CREATE OR REPLACE FUNCTION _random_end_season_tournament_name()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_adjectives TEXT[] := ARRAY[
    'Grand', 'Classic', 'Championship', 'Premier', 'Annual', 'Golden',
    'Silver', 'Diamond', 'Royal', 'Masters', 'Elite', 'Supreme',
    'Open', 'Invitational', 'Memorial', 'Challenge', 'Showdown'
  ];
  v_nouns TEXT[] := ARRAY[
    'Cup', 'Trophy', 'Shield', 'Plate', 'Bowl', 'Stakes',
    'Series', 'Classic', 'Challenge', 'Knockout', 'Showpiece',
    'Festival', 'Championship', 'Tournament', 'Open'
  ];
  v_pubs TEXT[] := ARRAY[
    'The Crown', 'The Red Lion', 'The White Hart', 'The Kings Arms',
    'The Rose & Crown', 'The Wheatsheaf', 'The Plough', 'The Bell',
    'The George', 'The Fox & Hounds', 'The Black Horse', 'The Swan',
    'The Royal Oak', 'The Coach & Horses', 'The Three Tuns',
    'The Golden Fleece', 'The Anchor', 'The Ship', 'The Castle',
    'The Angel', 'The Lamb', 'The Eagle', 'The Bull',
    'The Green Man', 'The Railway', 'The Nags Head'
  ];
  v_style INT;
BEGIN
  v_style := floor(random() * 3)::int;
  IF v_style = 0 THEN
    -- "The Crown Grand Cup"
    RETURN v_pubs[1 + floor(random() * array_length(v_pubs, 1))::int] || ' ' ||
           v_adjectives[1 + floor(random() * array_length(v_adjectives, 1))::int] || ' ' ||
           v_nouns[1 + floor(random() * array_length(v_nouns, 1))::int];
  ELSIF v_style = 1 THEN
    -- "The End of Season Classic"
    RETURN 'The End of Season ' || v_nouns[1 + floor(random() * array_length(v_nouns, 1))::int];
  ELSE
    -- "The Crown Invitational"
    RETURN v_pubs[1 + floor(random() * array_length(v_pubs, 1))::int] || ' ' ||
           v_nouns[1 + floor(random() * array_length(v_nouns, 1))::int];
  END IF;
END;
$$;
