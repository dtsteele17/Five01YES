# Rematch and Stats Recording Fix Summary

## Issues Fixed

### 1. Rematch Button Not Recognizing When Both Players Press

**Problem:** The rematch button UI was showing incorrect states and not properly recognizing when both players clicked rematch.

**Root Cause:** The `WinnerPopup` component's `getRematchButtonContent()` function had incorrect logic for determining what state to display.

**Fix Applied:** Updated `components/game/WinnerPopup.tsx`:

```typescript
const getRematchButtonContent = () => {
  // Combined 'creating' and 'ready' states - both mean the room is being created
  if (rematchStatus === 'creating' || rematchStatus === 'ready') {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        Starting...
      </>
    );
  }
  // Show waiting state when I clicked but we're still waiting for opponent
  if (youReady && readyCount < 2) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
        Waiting... ({readyCount}/2)
      </>
    );
  }
  // Show "Join Rematch" when opponent already clicked but I haven't
  if (opponentRematchReady && !youReady) {
    return (
      <>
        <RotateCcw className="w-4 h-4 mr-1" />
        Join Rematch ({readyCount}/2)
      </>
    );
  }
  // Initial state - show "Rematch 0/2"
  return (
    <>
      <RotateCcw className="w-4 h-4 mr-1" />
      Rematch ({readyCount}/2)
    </>
  );
};
```

**How it works now:**
1. **0/2 - Initial state:** Shows "Rematch (0/2)" - neither player clicked
2. **1/2 - Player clicked:** Shows "Waiting... (1/2)" with spinner
3. **1/2 - Opponent clicked:** Shows "Join Rematch (1/2)" 
4. **2/2 - Both clicked:** Shows "Starting..." with spinner, then auto-navigates

---

### 2. Stats Recording (Opponent Stats from WinnerPopup)

**Problem:** Opponent stats from the end-game popup were not being saved to the `match_history` table.

**Status: ALREADY FIXED** - The database function `fn_record_quick_match_complete` was already correctly implemented to:

1. Calculate stats for BOTH players from `quick_match_visits` table
2. Insert two records to `match_history` (one for winner, one for loser)
3. Include opponent stats in each record:
   - `opponent_three_dart_avg`
   - `opponent_first9_avg`
   - `opponent_highest_checkout`
   - `opponent_checkout_percentage`
   - `opponent_darts_thrown`
   - `opponent_visits_100_plus`
   - `opponent_visits_140_plus`
   - `opponent_visits_180`

**Database functions in place:**
- `fn_update_player_match_stats()` - Calculates and inserts stats for one player (with opponent data)
- `fn_record_quick_match_complete()` - Wrapper that calls the above for both winner and loser

**Frontend flow:**
1. Match ends → `showMatchEndPopup()` is called
2. Fetches ALL visits from `quick_match_visits` table
3. Calculates stats for both players using `calculatePlayerStatsFromVisits()`
4. Calls `saveMatchStats()` which invokes `fn_record_quick_match_complete` RPC
5. Function calculates stats from database visits and saves both players' records

---

## Files Modified

1. **`components/game/WinnerPopup.tsx`** - Fixed rematch button state logic

## Files to Deploy (SQL Migrations)

1. **`supabase/migrations/20260219000002_fix_rematch_system.sql`** - Contains the rematch system functions
2. **`supabase/migrations/20260221000000_verify_opponent_stats_recording.sql`** - Contains the stats recording functions

## Verification

### Test Rematch System:
1. Play a quick match (301 or 501) to completion
2. Click "Rematch (0/2)" - should change to "Waiting... (1/2)"
3. Have opponent click rematch - both should auto-navigate to new match

### Test Stats Recording:
1. Run the SQL in `VERIFY_AND_FIX_REMATCH_STATS.sql` to check recent matches
2. Verify both players have records in `match_history` for each match
3. Verify `opponent_three_dart_avg` and other opponent_* columns are populated

## Database Triggers Flow (Rematch)

```
1. Player clicks rematch
   → request_quick_match_rematch() RPC called
   → Sets player1_ready or player2_ready to TRUE

2. Second player clicks rematch
   → request_quick_match_rematch() RPC called
   → Sets both player1_ready AND player2_ready to TRUE
   → Updates status to 'ready'

3. BEFORE UPDATE trigger fires
   → trg_create_rematch_room() executes
   → Creates new room in match_rooms
   → Sets NEW.new_room_id = created_room_id
   → Sets NEW.status = 'created'
   → Updates original room with rematch_room_id

4. Frontend receives realtime update
   → new_room_id is now set
   → Auto-navigates to /app/play/quick-match/match/{new_room_id}
```

## Database Flow (Stats Recording)

```
1. Match ends
   → saveMatchStats() called from frontend

2. RPC call
   → fn_record_quick_match_complete(room_id, winner_id, loser_id, ...)

3. For each player (winner and loser)
   → fn_update_player_match_stats() calculates stats from quick_match_visits
   → Inserts/updates match_history record
   → Includes opponent's calculated stats
   → Updates player_stats aggregate table

4. Both players now have complete match records with opponent stats
```
