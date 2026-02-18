# Opponent Stats Recording Fix

## Problem
When viewing the rematch popup / head-to-head history, only the current player's stats were showing. The opponent's stats were not being saved to the database, resulting in zeros or missing values for:
- Opponent's 3-dart average
- Opponent's first 9 average  
- Opponent's highest checkout
- Opponent's 100+/140+/180 counts

## Root Cause
The database trigger `trg_match_rooms_completion` that records match completion was only saving the player's own stats, not calculating and storing the opponent's stats from the match.

## Solution

### 1. Database Migration (`20260222000003_fix_opponent_stats_recording.sql`)

The migration does the following:

#### a) Recreates the match completion trigger function
- Calculates stats for both players from `quick_match_visits` table
- Saves winner's record with opponent's stats populated
- Saves loser's record with opponent's (winner's) stats populated

#### b) Ensures all opponent stats columns exist
```sql
opponent_three_dart_avg
opponent_first9_avg
opponent_highest_checkout
opponent_checkout_percentage
opponent_darts_thrown
opponent_visits_100_plus
opponent_visits_140_plus
opponent_visits_180
```

#### c) Creates a verification view
```sql
v_match_history_with_opponent_stats
```
This view shows match history with both players' stats and a flag indicating if opponent stats were recorded.

#### d) Backfills existing matches
Attempts to backfill opponent stats for recent matches (last 7 days) by cross-referencing the opponent's match_history record.

### 2. Updated RematchPopup Component

The component now:
- Explicitly queries all opponent stats columns
- Properly swaps stats when normalizing match records
- Displays both players' stats clearly in the "Last Match" view
- Shows both players' stats in the "Match History" scroll view
- Added icons and better formatting for stat display

## How It Works

### During Match Completion
1. Match ends (status changes to 'finished' or 'forfeited')
2. Trigger fires and calculates stats from `quick_match_visits`
3. Two records inserted into `match_history`:
   - Player 1's record: Contains P1's stats + P2's stats as opponent_* columns
   - Player 2's record: Contains P2's stats + P1's stats as opponent_* columns

### When Displaying History
1. Query fetches all matches between the two players
2. Records are normalized so Player 1 is always the reference
3. For Player 2's records, the stats are swapped
4. Both players' stats are displayed from the normalized record

## Testing

### Verify the fix is working:
1. Run the SQL migration in Supabase SQL Editor
2. Play a quick match (301 or 501)
3. Click "Rematch" to open the popup
4. Check that both players' stats are displayed:
   - Your 3-dart average, first 9, checkout, 180s
   - Opponent's 3-dart average, first 9, checkout, 180s

### Check database directly:
```sql
SELECT * FROM v_match_history_with_opponent_stats 
WHERE player_username = 'your_username' 
ORDER BY played_at DESC LIMIT 5;
```

The `has_opponent_stats` column should show 'YES' for recent matches.

## Files Changed
- `supabase/migrations/20260222000003_fix_opponent_stats_recording.sql` (new)
- `components/game/RematchPopup.tsx` (updated)

## Next Steps
1. Run the SQL migration in Supabase
2. Test with a new match
3. Verify stats display correctly in rematch popup
