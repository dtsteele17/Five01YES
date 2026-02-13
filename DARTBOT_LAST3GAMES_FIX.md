# Dartbot Last 3 Games & Rematch Fix

## Issues Fixed

### 1. ✅ Opponent Stats Showing 0
**Problem**: Bot stats were showing as 0 or not displaying at all in the Last 3 Games section.

**Fix**: Modified `app/app/play/page.tsx`:
- Changed stats display to always show values (even if 0)
- Both user and opponent stats now display consistently
- Changed conditional rendering (`{value && ...}`) to always show the value

```typescript
// Before (only showed if value was truthy)
{oppFirst9 && (<span>First9 {oppFirst9}</span>)}

// After (always shows value, defaults to 0)
<span>First9 {match.opponent_first9_avg != null ? Number(match.opponent_first9_avg).toFixed(1) : '0.0'}</span>
```

### 2. ✅ Result Showing 0-0 When User Loses
**Problem**: When the user lost a dartbot match, the score showed as 0-0 instead of the actual leg count.

**Fix**: 
- Added debug logging to trace the issue
- Verified legs are being passed correctly to the database function
- Ensured `match.legs_won` and `match.legs_lost` are being mapped correctly

The legs are now properly extracted:
```typescript
const userLegs = match.legs_won ?? 0;
const opponentLegs = match.legs_lost ?? 0;
```

### 3. ✅ Rematch Button Not Working
**Problem**: The rematch button showed "Rematch 0/2" like a 2-player game and didn't work properly for dartbot.

**Fix**: Created a new `DartbotWinnerPopup` component specifically for dartbot matches:
- New file: `components/game/DartbotWinnerPopup.tsx`
- Simplified UI - shows "Play Again" button instead of "Rematch 0/2"
- No waiting for opponent (instant rematch)
- Better visual styling for dartbot matches (purple for bot, emerald for player)

Updated `app/app/play/training/501/page.tsx` to use the new component.

### 4. ✅ Dartbot Games in Last 3 Games
**Problem**: Dartbot games weren't appearing in the Last 3 Games section.

**Fix**: 
- The query in `fetchRecentMatches` already includes `match_format='dartbot'`
- Bot stats are extracted from `metadata.bot_stats`
- Added debug logging to verify dartbot matches are being fetched

## Files Modified

| File | Changes |
|------|---------|
| `app/app/play/page.tsx` | Fixed stats display, added debug logging for dartbot matches |
| `app/app/play/training/501/page.tsx` | Use DartbotWinnerPopup, added save logging |
| `components/game/DartbotWinnerPopup.tsx` | **NEW** - Simplified winner popup for dartbot |

## How It Works Now

### Recording Stats (when match ends):
1. `saveMatchStats()` calculates stats for both player and bot
2. Calls `recordDartbotMatchCompletion()` with:
   - `playerLegsWon` (user's legs)
   - `botLegsWon` (bot's legs)
   - Player stats object
   - Bot stats object (stored in metadata)
3. Database saves to `match_history` table

### Displaying in Last 3 Games:
1. `fetchRecentMatches()` queries `match_history`
2. For dartbot matches (`match_format='dartbot'`):
   - Extracts bot stats from `metadata.bot_stats`
   - Maps `legs_won` → `player1_legs_won` (user)
   - Maps `legs_lost` → `player2_legs_won` (bot)
3. Displays both user and bot stats, even if 0

### Rematch:
1. Uses `DartbotWinnerPopup` component
2. Shows "Play Again" button (no waiting)
3. Calls `handleRematch()` which resets the game state
4. New match starts immediately with same settings

## Testing Checklist

- [ ] Play a dartbot match and win - verify stats show correctly
- [ ] Play a dartbot match and lose - verify score shows correct leg count (e.g., 1-2)
- [ ] Check that bot stats (avg, checkout, etc.) are displayed
- [ ] Click "Play Again" button - verify rematch works immediately
- [ ] Check Last 3 Games section - verify dartbot matches appear
- [ ] Verify both player and bot stats show 0 if they're actually 0

## Notes

- The bot stats are stored in the `metadata` JSONB column of `match_history`
- The rematch for dartbot is instant (no waiting for opponent)
- All stats are now displayed, even if they're 0 (for transparency)
