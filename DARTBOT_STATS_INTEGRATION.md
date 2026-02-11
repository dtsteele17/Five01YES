# DartBot Stats Integration

## Overview
DartBot match stats are now fully integrated with the main stats system, just like QuickMatch stats.

## How It Works

### 1. Match Recording Flow
When a dartbot match ends:
1. `saveMatchStats()` is called in the dartbot match page
2. `recordMatchCompletion()` saves to:
   - `matches` table (with `match_type = 'dartbot'`)
   - `match_players` table (user and bot stats)
   - `match_history` table (via trigger)
   - `user_stats` table (aggregate stats)
   - `player_stats` table (dashboard stats)

### 2. Database Trigger
The `trg_sync_dartbot_matches` trigger automatically syncs dartbot matches from `matches` to `match_history`:
```sql
-- Trigger fires on INSERT/UPDATE of matches table
-- Copies dartbot match data to match_history
-- Sets match_format = 'dartbot'
```

### 3. Stats Page Filtering
The Stats page has filters for:
- **Game Mode**: All Games, 301, 501
- **Match Type**: All Types, Quick Match, Ranked Match, Private Match, Local Match, **Training (vs Bot)**

When "Training (vs Bot)" is selected, it filters `match_history` by `match_format = 'dartbot'`.

## Files Modified

### Core Stats Recording
- `lib/match/recordMatchCompletion.ts` - Added `botLevel` to opponent interface
- `app/app/play/training/501/page.tsx` - Passes `botLevel` when saving stats

### Database Migrations
- `supabase/migrations/040_update_dartbot_stats_sync_with_level.sql` - Enhanced sync trigger with bot level support

### UI Components
- `components/stats/MatchHistoryList.tsx` - Shows bot level in match list (e.g., "Bot (55)")
- `app/app/stats/page.tsx` - Already has "Training (vs Bot)" filter option

## Stats Tracked for DartBot Matches

### Per-Match Stats
- Total matches played
- Wins/Losses
- Legs won/lost
- 3-dart average
- First 9 average
- Highest checkout
- Checkout percentage
- 100+ visits
- 140+ visits
- 180s
- Darts thrown
- Total score

### Aggregate Stats
All dartbot stats are included in overall aggregates via:
- `user_stats` table (total matches, wins, losses, 180s, etc.)
- `player_stats` table (dashboard display)

## Bot Level Tracking

The bot's target average (25, 35, 45, 55, 65, 75, 85, 95) is now stored:
- In `matches.dartbot_level`
- In `match_history.bot_level`
- Displayed in match history as "Bot (55)"

## Filtering Examples

### View all dartbot 501 stats:
1. Go to Stats page
2. Select Game Mode: "501"
3. Select Match Type: "Training (vs Bot)"

### View all practice stats (combined):
Currently filters work with AND logic. To see combined stats, use "All Games" with "Training (vs Bot)" filter.

## Testing

To verify stats are being recorded:
1. Play a dartbot match
2. Finish the match
3. Check browser console for: "📊 DARTBOT MATCH SAVED"
4. Go to Stats page
5. Select "Training (vs Bot)" filter
6. Match should appear in history

## Troubleshooting

### Stats not appearing:
1. Check browser console for errors
2. Verify `match_history` table has the match
3. Check that `match_format = 'dartbot'`

### Incorrect bot level:
1. Check `matches.dartbot_level` column
2. Verify `config.botAverage` is being passed to `recordMatchCompletion`

## Future Enhancements

Potential improvements:
1. Filter by specific bot level (e.g., only level 55 bots)
2. Separate stats for each bot difficulty
3. Win rate against each bot level
4. Average progression over time against bots
