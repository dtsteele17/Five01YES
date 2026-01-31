/*
  # Add best_of column to league_matches

  1. Changes
    - Add `best_of` column to `league_matches` table
    - Default value is 3 (best of 3)
    - Valid values: 1, 3, 5, 7, 9
  
  2. Purpose
    - Enable league matches to have different match formats
    - Allows leagues to configure match length per fixture
    - Maps to legs_to_win in match rooms:
      - Best of 1 = legs_to_win 1
      - Best of 3 = legs_to_win 2
      - Best of 5 = legs_to_win 3
      - Best of 7 = legs_to_win 4
      - Best of 9 = legs_to_win 5
*/

ALTER TABLE league_matches 
ADD COLUMN IF NOT EXISTS best_of integer DEFAULT 3 CHECK (best_of IN (1, 3, 5, 7, 9));

COMMENT ON COLUMN league_matches.best_of IS 'Number of legs in the match format (e.g., 3 = best of 3)';
