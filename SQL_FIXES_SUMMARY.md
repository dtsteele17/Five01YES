# SQL Fixes Summary

## Problem 1: `matches` is a View
**Error**: `ERROR: 42809: "matches" is a view DETAIL: Views cannot have row-level BEFORE or AFTER triggers.`

**Root Cause**: The `matches` table was converted to a view in a later migration, so triggers cannot be created on it.

**Solution**: 
- Removed the migration that tried to create a trigger on the `matches` view
- Created `record_dartbot_match_completion` RPC function that directly inserts into `match_history`
- Updated the client code to call this RPC instead of `recordMatchCompletion`

## Migration Files

### 1. `040_update_dartbot_stats_with_bot_level.sql`
This migration:
1. Adds `bot_level` column to `match_history` table
2. Creates index on `bot_level` for filtering
3. **Updates the `finalize_dartbot_match` function** to include `bot_level` in inserts
4. Backfills existing dartbot matches with bot level

### 2. `041_create_record_dartbot_match_rpc.sql`
This migration creates:
- `record_dartbot_match_completion` RPC function
- Accepts all match stats as parameters
- Inserts directly into `match_history` with `match_format = 'dartbot'`
- Updates `player_stats` aggregate table

## Client-Side Changes

### `lib/dartbot.ts`
Added:
- `DartbotMatchStats` interface
- `recordDartbotMatchCompletion()` function that calls the RPC

### `app/app/play/training/501/page.tsx`
Changed:
- Import from `recordMatchCompletion` to `recordDartbotMatchCompletion`
- Updated `saveMatchStats` to use the new RPC function

## How Stats Flow Now

```
Dartbot Match Ends
        │
        ▼
saveMatchStats() called
        │
        ▼
recordDartbotMatchCompletion() (RPC)
        │
        ├─► Insert into match_history (match_format='dartbot', bot_level=X)
        │
        └─► Update player_stats aggregate
        │
        ▼
Stats appear on Stats page with "Training (vs Bot)" filter
```

## Testing

1. Run migration `040_update_dartbot_stats_with_bot_level.sql`
2. Run migration `041_create_record_dartbot_match_rpc.sql`
3. Play a dartbot match
4. Check that stats appear in Stats page with "Training (vs Bot)" filter

## Notes

- The `matches` view is NOT used for dartbot matches anymore
- Stats go directly to `match_history` via RPC
- The bot level (target average like 55, 65, etc.) is stored in `bot_level` column
