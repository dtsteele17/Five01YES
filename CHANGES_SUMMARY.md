# DartBot Stats Integration - Changes Summary

## Problem Statement
DartBot match stats were not being properly recorded and displayed on the Stats page like QuickMatch stats.

## Solution Overview
Enhanced the existing stats recording system to properly categorize and display dartbot matches with bot level information.

---

## Files Modified

### 1. `lib/match/recordMatchCompletion.ts`
**Changes:**
- Added `botLevel?: number` to `RecordMatchInput.opponent` interface
- Updated `dartbot_level` field to use `input.opponent.botLevel` instead of hardcoded `3`
- Updated `bot_level` field in `opponentPlayerData` to use the passed bot level

**Purpose:** Allow dartbot matches to record the bot's target average (25, 35, 45, 55, 65, 75, 85, 95)

### 2. `app/app/play/training/501/page.tsx`
**Changes:**
- Updated `recordMatchCompletion` call to pass `botLevel: config.botAverage`

**Purpose:** Pass the actual bot difficulty level when saving match stats

### 3. `components/stats/MatchHistoryList.tsx`
**Changes:**
- Added `bot_level?: number` to `MatchHistoryItem` interface
- Enhanced the Supabase query to fetch `opponent:opponent_id (username, avatar_url)`
- Added `getMatchFormatLabel()` helper function that displays "Bot (55)" for dartbot matches
- Updated match format display to use the new helper

**Purpose:** Show bot level in match history list (e.g., "301 • Bot (55)")

---

## New Migration File

### `supabase/migrations/040_update_dartbot_stats_sync_with_level.sql`
**Contains:**
1. Drops existing trigger `trg_sync_dartbot_matches`
2. Recreates `sync_matches_to_history()` function with:
   - Proper null handling with COALESCE
   - Cleaner SELECT into RECORD
   - Better error handling
3. Recreates trigger
4. Adds `bot_level` column to `match_history` if not exists
5. Creates index on `bot_level` for faster filtering
6. Backfills any missing dartbot matches

**Purpose:** Ensure dartbot matches are properly synced to match_history with bot level

---

## How Stats Flow Works

```
┌─────────────────────────────────────────────────────────────────┐
│  DARTBOT MATCH ENDS                                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  saveMatchStats() called                                        │
│  - Formats visit data                                           │
│  - Computes user & opponent stats                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  recordMatchCompletion()                                        │
│  - Inserts into 'matches' table (match_type='dartbot')          │
│  - Inserts into 'match_players' table (user + bot stats)        │
│  - Inserts into 'match_history' table (via trigger)             │
│  - Updates 'user_stats' aggregate table                         │
│  - Updates 'player_stats' dashboard table                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Database Trigger: trg_sync_dartbot_matches                     │
│  - Syncs matches → match_history                                │
│  - Sets match_format = 'dartbot'                                │
│  - Copies bot_level from matches.dartbot_level                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STATS PAGE displays data                                       │
│  - Filter: "Training (vs Bot)" queries match_format='dartbot'   │
│  - Shows: "Bot (55)" with bot_level from match_history          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stats Page Filters

### Game Mode Filter
- All Games
- 301
- 501

### Match Type Filter
- All Types
- Quick Match (`match_format = 'quick'`)
- Ranked Match (`match_format = 'ranked'`)
- Private Match (`match_format = 'private'`)
- Local Match (`match_format = 'local'`)
- **Training (vs Bot)** (`match_format = 'dartbot'`)

---

## Stats Tracked for DartBot Matches

### Per-Match Stats (in match_history)
- `game_mode`: 301 or 501
- `match_format`: 'dartbot'
- `bot_level`: Bot target average (25-95)
- `result`: win/loss
- `legs_won`, `legs_lost`
- `three_dart_avg`, `first9_avg`
- `highest_checkout`, `checkout_percentage`
- `darts_thrown`, `total_score`
- `visits_100_plus`, `visits_140_plus`, `visits_180`
- `played_at`: Timestamp

### Aggregate Stats
All dartbot stats contribute to:
- Overall averages
- Total matches/wins/losses
- Total 180s
- Best checkout
- etc.

---

## Testing Checklist

- [ ] Play a 501 match against dartbot
- [ ] Win or lose the match
- [ ] Check browser console for "📊 DARTBOT MATCH SAVED"
- [ ] Go to Stats page
- [ ] Select "Training (vs Bot)" filter
- [ ] Verify match appears in history
- [ ] Verify "Bot (55)" shows the correct level
- [ ] Select "501" game mode + "Training (vs Bot)"
- [ ] Verify correct filtered stats
- [ ] Check overall stats include dartbot matches

---

## Database Schema Notes

### matches table
- `match_type`: 'dartbot' for bot matches
- `dartbot_level`: Bot target average

### match_history table
- `match_format`: 'dartbot' for filtering
- `bot_level`: Bot target average (new column)
- `game_mode`: 301 or 501 as integer

### match_players table
- `bot_level`: Bot target average
- `is_bot`: true for bot player
