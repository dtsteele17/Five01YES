# Win Streak Fix

## Problem
The win streak on the dashboard was not being calculated correctly from all game types (quick matches and dartbot games).

## Solution

### SQL Migration: `20260212000002_fix_win_streak_calculation.sql`

Created functions to properly calculate win streaks from `match_history` table:

#### `calculate_win_streak(p_user_id uuid)`
- Returns the current consecutive win count
- Loops through matches in reverse chronological order
- Increments for each win, stops at first loss
- Ignores draws (they don't break streak but don't add to it)

#### `calculate_best_win_streak(p_user_id uuid)`
- Returns the highest consecutive win count ever achieved
- Loops through all matches chronologically
- Tracks current streak, updates best when exceeded
- Resets to 0 on loss

#### `get_dashboard_stats(p_user_id uuid)`
- Returns all dashboard stats including calculated streaks:
  - `total_matches`
  - `wins`
  - `losses`
  - `win_rate`
  - `current_streak`
  - `best_streak`

#### Auto-Update Trigger
- `trg_update_streak_on_match` - Automatically updates `player_stats` when a new match is added to `match_history`

#### Backfill
- Updates all existing `player_stats` records with correct streaks from match history

### Frontend Changes

#### Updated: `app/app/page.tsx`
- Changed from fetching from `player_stats` table directly
- Now uses `get_dashboard_stats()` RPC function
- Gets accurate streaks calculated from all match_history records

## How Win Streak Works Now

1. **Win**: Streak increases by 1
2. **Loss**: Streak resets to 0
3. **Draw**: Streak unchanged (no increase, no reset)

### Example:
```
Match 1: Win  → Streak: 1
Match 2: Win  → Streak: 2
Match 3: Loss → Streak: 0
Match 4: Win  → Streak: 1
Match 5: Win  → Streak: 2
Match 6: Win  → Streak: 3 (Best: 3)
```

## Database Schema

### match_history table
Records from:
- Quick matches (via trigger on match_rooms)
- Dartbot matches (via record_dartbot_match_completion)

### player_stats table
Updated automatically via trigger with:
- `current_win_streak` - Current consecutive wins
- `best_win_streak` - Highest streak ever
- `wins` - Total wins
- `losses` - Total losses
- `total_matches` - Total games played

## Testing

1. Play a quick match and win
2. Check dashboard - streak should be 1
3. Play dartbot match and win
4. Check dashboard - streak should be 2
5. Play any match and lose
6. Check dashboard - streak should be 0
7. Best streak should remain at 2

## Files Modified

1. **SQL Migration** (New):
   - `supabase/migrations/20260212000002_fix_win_streak_calculation.sql`

2. **Frontend** (Modified):
   - `app/app/page.tsx` - Uses new `get_dashboard_stats()` function
