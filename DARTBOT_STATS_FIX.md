# Dartbot Stats Recording Fix

## Summary
This fix ensures dartbot match stats are properly recorded and player stats (including win streaks) are correctly updated.

## Changes Made

### 1. SQL Migrations (Apply these in Supabase SQL Editor)

#### Migration 1: `20260213000005_fix_rpc_and_streaks.sql`
This migration:
- Adds win streak columns to `player_stats` if they don't exist
- Creates win streak calculation functions:
  - `calculate_win_streak(user_id)` - Current streak from match_history
  - `calculate_best_win_streak(user_id)` - Best streak ever
- Fixes the `record_dartbot_match_completion()` RPC to:
  - Insert to `match_history` table
  - Update `player_stats` aggregate with cumulative stats
  - Calculate and update win streaks
- Creates `get_dashboard_stats()` RPC for dashboard data
- Backfills streak data for existing records

#### Migration 2: `20260213000006_verify_stats_system.sql`
This migration:
- Creates `verify_user_stats()` function for debugging
- Creates trigger `trg_match_history_update_stats` that auto-updates player_stats when match_history is inserted
- Backfills any missing player_stats from match_history
- Recalculates all streaks

### 2. Frontend (Already Updated)

The training page (`app/app/play/training/501/page.tsx`) calls `recordDartbotMatchCompletion()` with:
- Game mode (301/501)
- Match format (best-of-N)
- Dartbot level (1-5)
- Winner (player/dartbot)
- Player stats (averages, checkouts, 180s, etc.)

## How to Apply

1. **Go to Supabase Dashboard** → SQL Editor
2. **Run migration 20260213000005_fix_rpc_and_streaks.sql**
3. **Run migration 20260213000006_verify_stats_system.sql**
4. **Test by playing a dartbot match**

## Verification

After applying, test with:

```sql
-- Check your stats
SELECT * FROM verify_user_stats();

-- Or get dashboard stats
SELECT * FROM get_dashboard_stats();
```

## Data Flow

```
Training Match Ends
    ↓
saveMatchStats() in page.tsx
    ↓
recordDartbotMatchCompletion() RPC
    ↓
INSERT INTO match_history
    ↓
UPDATE player_stats (cumulative)
    ↓
UPDATE win streaks (calculated from match_history)
    ↓
Dashboard shows updated stats
```

## What Gets Updated

### match_history table (one row per match)
- Room ID, user ID, opponent ID
- Game mode, match format (= 'dartbot')
- Result (win/loss), legs won/lost
- All player stats for this match

### player_stats table (cumulative)
- `total_matches`, `wins`, `losses`
- `total_darts_thrown`, `total_score`
- `overall_3dart_avg`, `overall_first9_avg`
- `highest_checkout`, `total_checkouts`
- `checkout_attempts`, `checkout_percentage`
- `visits_100_plus`, `visits_140_plus`, `visits_180`
- `current_win_streak`, `best_win_streak`

## Files Changed

### New SQL Migrations
- `supabase/migrations/20260213000005_fix_rpc_and_streaks.sql`
- `supabase/migrations/20260213000006_verify_stats_system.sql`

### Frontend (already working)
- `lib/dartbot.ts` - RPC call interface
- `app/app/play/training/501/page.tsx` - Stats calculation and saving
