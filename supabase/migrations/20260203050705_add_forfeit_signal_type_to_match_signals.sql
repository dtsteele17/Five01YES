/*
  # Add 'forfeit' signal type to match_signals

  1. Changes
    - Update CHECK constraint on match_signals.type to include 'forfeit'
    - Allows players to send forfeit signals through the match_signals table
    - Forfeit signals follow same RLS routing as other signals (to_user_id based)

  2. Security
    - No changes to RLS policies
    - Forfeit signals are only visible to the intended recipient (to_user_id)
    - Sender must be authenticated and match from_user_id

  3. Usage
    - When a player forfeits, a signal with type='forfeit' is sent to the opponent
    - Opponent's client receives the signal via realtime subscription
    - Opponent's UI can show a modal and clean up resources
*/

-- Drop old constraint
ALTER TABLE match_signals DROP CONSTRAINT IF EXISTS match_signals_type_check;

-- Add new constraint with 'forfeit' type
ALTER TABLE match_signals ADD CONSTRAINT match_signals_type_check
  CHECK (type IN ('offer', 'answer', 'ice', 'state', 'forfeit'));