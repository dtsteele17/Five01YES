# Summary of Changes

## 1. Camera Alternation Fix (Quick Match)
**Files Modified:**
- `lib/hooks/useMatchWebRTC.ts`
- `app/app/play/quick-match/match/[matchId]/page.tsx`

**Changes:**
- Changed from conditional rendering (which broke refs) to using callback refs
- Callback refs attach streams immediately when video elements mount
- Only the active player's camera is rendered at a time for bandwidth efficiency
- When it's your turn, you see your local camera; when it's opponent's turn, you see their remote camera

## 2. Forfeit Button Restoration
**Files Modified:**
- `app/app/play/quick-match/match/[matchId]/page.tsx`

**Changes:**
- Added forfeit button back to top-left of quick-match interface
- Removed the "only on your turn" restriction
- Players can now forfeit at any time during the match

## 3. SQL Syntax Error Fix
**Files Modified:**
- `supabase/migrations/20260213000007_fix_dartbot_rpc_params.sql`

**Fix:**
- Fixed missing parenthesis at line 166 in the `overall_first9_avg` calculation
- Changed from `... )::DECIMAL / (total_darts_thrown + p_player_total_darts) * 3)::DECIMAL` 
- To: `... )::DECIMAL / (total_darts_thrown + p_player_total_darts)) * 3, 2)`

## 4. DartBot Stats Recording & Display
**Files Modified:**
- `lib/dartbot.ts` - Added `botStats` field to `DartbotMatchStats` interface and updated `recordDartbotMatchCompletion`
- `app/app/play/training/501/page.tsx` - Pass bot stats when recording match completion
- `components/app/MatchStatsModal.tsx` - Display bot stats from metadata
- `supabase/migrations/20260213000008_add_dartbot_stats_params.sql` - New migration

**Changes:**
- Added `metadata` JSONB column to `match_history` table
- RPC function now accepts bot stats parameters
- Bot stats stored in metadata: `three_dart_avg`, `first9_avg`, `checkout_pct`, `highest_checkout`, `darts_at_double`, `total_darts`, `visits_100_plus`, `visits_140_plus`, `visits_180`, `total_score`
- MatchStatsModal reads bot stats from metadata and displays them in the opponent stats panel
- For DartBot matches, opponent name shows as "DartBot (Level X)"

## Testing Notes

### Camera Alternation
1. Start a quick match with another player
2. Verify your camera shows when it's your turn
3. Verify opponent's camera shows when it's their turn
4. Check browser console for `[CAMERA]` debug messages

### Forfeit Button
1. Start a quick match
2. Click forfeit button at any time (not just your turn)
3. Confirm match ends and stats are recorded

### DartBot Stats
1. Play a training match against DartBot
2. After match ends, click to view match stats
3. Verify both player and DartBot stats are displayed
4. Check that DartBot's 3-dart average, checkouts, and visit counts are shown

## Remaining Issues

### Rematch System
The rematch system in quick-match needs to be fixed:
- Detect when both users click rematch
- Player 1 creates lobby with same settings
- Player 2 auto-joins
- Restart match with coin toss

### Quick Match Stats Recording
Need to verify that quick matches properly record stats to match_history for both players. Currently the system appears to use database triggers rather than explicit function calls.
