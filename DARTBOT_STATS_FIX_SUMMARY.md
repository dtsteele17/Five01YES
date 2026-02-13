# Dartbot Stats Fix - Complete Summary

## Issues Fixed

### 1. Winning Throw Not Included in Stats
**Problem**: The final winning dart throw was not being included in the match stats calculation, causing incorrect averages and missing checkout data.

**Root Cause**: React's state updates are asynchronous. When a player checked out, the code called `setCurrentLeg()` to add the winning visit, then immediately called `handleLegComplete()`. However, `handleLegComplete()` captured the `currentLeg` state BEFORE React had applied the update, so the winning visit was lost.

**Fix** (in `app/app/play/training/501/page.tsx`):
- Modified `handleLegComplete()` to accept an optional `winningVisit` parameter
- When a checkout occurs, the winning visit is now passed directly to `handleLegComplete()` instead of relying on state
- Updated both player and bot checkout handlers to pass the visit

```typescript
// Before
if (isCheckout) handleLegComplete('player1');

// After
if (isCheckout) {
  handleLegComplete('player1', visit);  // Pass visit directly
}
```

### 2. Checkout Percentage and Highest Checkout Calculations Wrong
**Problem**: Checkout percentage was not calculating correctly, and highest checkout was not being detected.

**Fix** (in `app/app/play/training/501/page.tsx`):
- Fixed `calculatePlayerStatsFromVisits()` to properly identify checkout visits using `isCheckout` flag OR `remainingScore === 0`
- Fixed checkout value calculation to use `remainingBefore` (what was remaining before the checkout visit)
- Fixed darts at double calculation to count all visits where remaining was ≤ 170 before the visit

**Fix** (in `lib/stats/computeMatchStats.ts`):
- Simplified highest checkout calculation to use `visit.remainingScore + visit.score` (the score before checkout)

### 3. Dartbot Games Not Showing in "Last 3 Games"
**Problem**: Dartbot matches weren't appearing in the "Last 3 Games" section on the play page.

**Fix** (in `app/app/play/page.tsx`):
- Added `metadata` column to the query fetching recent matches
- Added logic to extract bot stats from metadata for dartbot matches
- Bot stats now display alongside player stats in the recent matches list

### 4. Opponent (Bot) Stats Not Recorded
**Problem**: Bot stats were not being saved or displayed in match history.

**Fix** (in multiple files):
1. **`app/app/play/page.tsx`**: 
   - Added `metadata` to the query
   - Extract bot stats from `metadata.bot_stats` when displaying dartbot matches
   - Map bot stats to opponent stats fields

2. **`components/stats/MatchHistoryList.tsx`**:
   - Added `metadata` field to the MatchHistoryItem interface
   - Added `metadata` to the query

3. **`supabase/migrations/20260213000010_fix_dartbot_stats_complete.sql`**:
   - Ensured `metadata` column exists in `match_history`
   - Updated `record_dartbot_match_completion` function to properly save bot stats to metadata

### 5. Current Leg Data Not Included in Stats
**Problem**: When saving match stats, only completed legs (from `completedLegsRef`) were included. If the match ended but the current leg hadn't been added to `allLegs` yet, those visits would be lost.

**Fix** (in `app/app/play/training/501/page.tsx`):
- Modified `saveMatchStats()` to include both completed legs AND the current leg:
```typescript
const allLegsData = [...completedLegsRef.current, currentLeg];
```

## Files Modified

1. **`app/app/play/training/501/page.tsx`**
   - Fixed `handleLegComplete()` to accept winning visit parameter
   - Fixed player checkout to pass visit to `handleLegComplete()`
   - Fixed bot checkout to pass visit to `handleLegComplete()`
   - Fixed `saveMatchStats()` to include current leg
   - Fixed `calculatePlayerStatsFromVisits()` checkout calculations

2. **`app/app/play/page.tsx`**
   - Added `metadata` to query
   - Added bot stats extraction from metadata

3. **`lib/stats/computeMatchStats.ts`**
   - Fixed highest checkout calculation

4. **`components/stats/MatchHistoryList.tsx`**
   - Added `metadata` to interface and query

5. **`supabase/migrations/20260213000010_fix_dartbot_stats_complete.sql`** (NEW)
   - Ensures metadata column exists
   - Creates/updates `record_dartbot_match_completion` function
   - Sets up proper permissions

## Testing Checklist

After applying these fixes, verify:

1. **Winning Throw Stats**
   - [ ] Play a dartbot match and win with a checkout
   - [ ] Verify the checkout appears in match stats
   - [ ] Verify the 3-dart average includes the winning visit

2. **Checkout Percentage**
   - [ ] Check that checkout % calculates correctly (checkouts made / darts at double)
   - [ ] Verify darts at double are counted for all visits where remaining ≤ 170

3. **Highest Checkout**
   - [ ] Make a high checkout (e.g., 100+)
   - [ ] Verify it appears in match stats and end-game screen

4. **Last 3 Games Display**
   - [ ] Play a dartbot match
   - [ ] Go to Play page
   - [ ] Verify the match appears in "Last 3 Games"
   - [ ] Verify bot stats are displayed

5. **Match History**
   - [ ] Go to Stats page
   - [ ] Verify dartbot matches appear in match history
   - [ ] Click on a dartbot match to view stats modal
   - [ ] Verify both player and bot stats are shown

## Migration Instructions

Run the SQL migration to update the database:

```bash
# Using supabase CLI
supabase migration up

# Or apply the SQL file directly in Supabase Dashboard
# File: supabase/migrations/20260213000010_fix_dartbot_stats_complete.sql
```

## Notes

- All fixes maintain backward compatibility
- Bot stats are stored in `metadata.bot_stats` JSONB field
- Human opponent stats are still fetched from their match_history entry
- The fixes ensure dartbot matches are treated similarly to quick matches for stats purposes
