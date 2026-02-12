# Stats Recording Fix Summary

## Issues Fixed

### 1. Quick Match Stats Not Recording
**Root Cause:** Stats recording wasn't properly updating the `player_stats` aggregate table.

**Fix:** Created `record_quick_match_stats` function that:
- Inserts into `match_history`
- Updates `player_stats` aggregate table with proper calculations
- Handles running averages and totals correctly

### 2. Dartbot Stats Using Wrong Level Format
**Root Cause:** Dartbot level was being stored as average (45, 55, 65, etc.) instead of level (1-5).

**Fix:** 
- Dartbot page now maps difficulty to level 1-5:
  ```typescript
  const difficultyToLevel: Record<string, number> = {
    'novice': 1, 'beginner': 1,
    'casual': 2, 'intermediate': 2,
    'advanced': 3,
    'elite': 4,
    'pro': 5, 'worldClass': 5,
  };
  ```
- Updated `record_dartbot_match_completion` function to accept and store `bot_level`

### 3. Recent Matches Not Displaying
**Root Cause:** Play page was querying `match_rooms` instead of `match_history`.

**Fix:** 
- Play page now queries `match_history` with limit=3
- Stats page shows "Last 5 Matches" with limit=5
- Both pages display opponent, score, match type, and time ago

### 4. Checkout % and Highest Checkout Missing in WinnerPopup
**Root Cause:** These stats weren't being passed to the WinnerPopup component.

**Fix:** 
- Dartbot page calculates these stats in `calculatePlayerStatsFromVisits()`
- Stats are correctly passed to WinnerPopup via `matchEndStats` state
- WinnerPopup displays checkout % and highest checkout (or '-' if none)

## Files Changed

### SQL Migration
- **File:** `supabase/migrations/20260212190000_fix_stats_recording_complete.sql`
- Contains complete fix for stats recording system

### Frontend
- **Play Page:** `app/app/play/page.tsx` - Already using `match_history`
- **Stats Page:** `app/app/stats/page.tsx` - Shows "Last 5 Matches"
- **Dartbot Page:** `app/app/play/training/501/page.tsx` - Maps difficulty to level

## How to Apply

1. Run the SQL migration in Supabase:
   ```sql
   -- Apply the migration file
   -- 20260212190000_fix_stats_recording_complete.sql
   ```

2. The migration will:
   - Create/update functions for recording match stats
   - Backfill missing player_stats for users with match_history
   - Recalculate all aggregate stats from match_history
   - Create trigger for auto-updating player_stats

## Verification

After applying the migration:

1. **Play a dartbot match** - Check that:
   - WinnerPopup shows checkout % and highest checkout
   - Stats are saved (check match_history table)

2. **Check Stats Page** - Verify:
   - Overall stats appear (from player_stats table)
   - Last 5 matches display correctly

3. **Check Play Page** - Verify:
   - Last 3 matches display correctly
   - Bot level shows as 1-5 (not average)

## Database Functions Created

1. `record_quick_match_stats()` - Records quick match completion
2. `record_dartbot_match_completion()` - Records dartbot match completion
3. `update_player_stats_from_match()` - Updates aggregate player_stats table
4. `convert_bot_average_to_level()` - Maps average to level 1-5
5. `on_match_history_insert()` - Trigger function for auto-updating stats
