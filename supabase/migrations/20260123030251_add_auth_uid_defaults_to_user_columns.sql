/*
  # Add auth.uid() Defaults to User Columns

  ## Overview
  This migration adds default values using auth.uid() for created_by and player columns
  in tournaments and quick_match_lobbies tables. This ensures these fields are automatically
  populated from the authenticated user's session when inserting records.

  ## Changes

  1. **tournaments table**:
     - Add default value for `created_by`: auth.uid()
     - This ensures tournament creator is automatically set from session

  2. **quick_match_lobbies table**:
     - Add default value for `created_by`: auth.uid()
     - Add default value for `player1_id`: auth.uid()
     - This ensures lobby creator and first player are automatically set

  ## Security Notes
  - Defaults use auth.uid() which pulls from authenticated JWT token
  - Only works when user is authenticated (returns NULL if not)
  - Application code no longer needs to explicitly pass these fields
  - RLS policies still enforce proper access control

  ## Important
  - These defaults work with INSERT operations
  - Values can still be explicitly provided if needed
  - NULL values will be rejected if column has NOT NULL constraint and user is not authenticated
*/

-- Add default auth.uid() to tournaments.created_by
ALTER TABLE public.tournaments 
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Add default auth.uid() to quick_match_lobbies.created_by
ALTER TABLE public.quick_match_lobbies 
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Add default auth.uid() to quick_match_lobbies.player1_id
ALTER TABLE public.quick_match_lobbies 
  ALTER COLUMN player1_id SET DEFAULT auth.uid();

-- Add indexes to speed up queries by created_by (if not exists)
CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_created_by 
  ON public.quick_match_lobbies(created_by);

CREATE INDEX IF NOT EXISTS idx_quick_match_lobbies_player1_id 
  ON public.quick_match_lobbies(player1_id);
