# Complete Stats Recording Fix

## Summary of Issues Fixed

### 1. **Dartbot Stats Not Recording to Aggregate Stats**
**Problem:** The `record_dartbot_match_completion` function was inserting into `match_history` but NOT updating the `player_stats` aggregate table.

**Solution:** Updated the function to also update `player_stats` with proper cumulative calculations.

**File:** `supabase/migrations/20260213000000_fix_all_stats_recording.sql`

### 2. **Quick Match Stats Should Work**
The `fn_update_player_match_stats` function in migration 038 already correctly updates both `match_history` and `player_stats`.

### 3. **Last 5 Matches on Stats Page**
The stats page was already configured with `limit={5}` for the MatchHistoryList component.

### 4. **Last 3 Matches on Play Page**
The play page was already configured with `.limit(3)` for the recent matches query.

## How to Apply the Fix

1. **Run the SQL migration in Supabase:**
   ```sql
   \i supabase/migrations/20260213000000_fix_all_stats_recording.sql
   ```
   Or copy-paste the contents into the Supabase SQL Editor.

2. **The migration will:**
   - Drop all existing versions of `record_dartbot_match_completion`
   - Create a new version that updates BOTH `match_history` AND `player_stats`
   - Backfill missing `player_stats` records from existing `match_history` data
   - Ensure RLS policies are correct

## Testing Steps

After applying the migration:

### Test Dartbot Match
1. Go to Play → Training → 501
2. Play a match against the dartbot
3. Finish the match
4. Check browser console - should see "📊 DARTBOT MATCH SAVED: {success: true}"
5. Go to Stats page - should see:
   - Updated overall stats
   - The dartbot match in "Last 5 Matches"

### Test Quick Match
1. Go to Play → Quick Match
2. Play a match
3. Finish the match  
4. Check browser console - should see "[STATS] Match stats saved successfully"
5. Go to Stats page - should see updated stats

### Check Dashboard (Play Page)
1. Go to Play page
2. Should see last 3 matches in "Recent Games" section
3. Should include dartbot, quick, ranked matches

## Database Schema

### match_history table
Stores individual match records:
- `user_id` - The player
- `opponent_id` - Opponent (NULL for dartbot)
- `game_mode` - 301, 501, etc.
- `match_format` - 'quick', 'ranked', 'dartbot', etc.
- `result` - 'win', 'loss', 'draw'
- `three_dart_avg`, `first9_avg`, etc.

### player_stats table
Stores cumulative/aggregate stats across all matches:
- `user_id` - The player
- `total_matches`, `wins`, `losses`
- `overall_3dart_avg`, `overall_first9_avg`
- `highest_checkout`, `checkout_percentage`
- Updates after EVERY match (quick, dartbot, ranked, etc.)

## Frontend Logging

Added console logging to help debug:
- `[usePlayerStats] Fetching stats for user: ...`
- `[MatchHistoryList] Fetching matches...`
- `[Play] Fetching recent matches...`
- `📊 DARTBOT MATCH SAVED: ...`
- `[STATS] Match stats saved successfully`

Check the browser console to verify stats are being saved and loaded correctly.

## Troubleshooting

If stats still don't appear:

1. **Check console for errors**
   - Look for RPC errors when saving
   - Look for fetch errors when loading

2. **Verify database entries**
   ```sql
   -- Check match_history
   SELECT * FROM match_history WHERE user_id = 'your-user-id' ORDER BY played_at DESC;
   
   -- Check player_stats
   SELECT * FROM player_stats WHERE user_id = 'your-user-id';
   ```

3. **Check RLS policies**
   ```sql
   -- Should return rows
   SELECT * FROM match_history WHERE user_id = auth.uid();
   ```

4. **Manual backfill if needed**
   The migration includes automatic backfill, but if needed, run:
   ```sql
   -- Recalculate all player_stats from match_history
   INSERT INTO player_stats (...)
   SELECT ... FROM match_history GROUP BY user_id
   ON CONFLICT (user_id) DO UPDATE SET ...;
   ```
