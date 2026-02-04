# Quick Match: Complete Forfeit Flow Implementation

## Overview
Successfully implemented a comprehensive forfeit flow for Quick Match that restricts forfeiting to the player's turn only, includes confirmation modal, creates proper database records, notifies the opponent via realtime signals, and handles all edge cases defensively.

## Key Features Implemented

### 1. Turn-Based Forfeit Restriction

**Forfeit Button Behavior:**
- **Enabled**: Only when it's the player's turn (`isMyTurn === true`)
- **Disabled**: When not player's turn OR match already complete
- **Visual State**: 40% opacity + cursor-not-allowed when disabled
- **Tooltip**: Shows "You can only forfeit on your turn" when hovering over disabled button
- **Click Handler**: Shows toast error if clicked while disabled (shouldn't happen due to button being disabled, but defensive)

**Implementation:**
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <div>
        <Button
          onClick={() => {
            if (!isMyTurn) {
              toast.error("You can only forfeit on your turn");
              return;
            }
            if (matchComplete) {
              return;
            }
            setShowEndMatchDialog(true);
          }}
          disabled={forfeitLoading || !isMyTurn || matchComplete}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-900/80 backdrop-blur-sm"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Forfeit
        </Button>
      </div>
    </TooltipTrigger>
    {!isMyTurn && !matchComplete && (
      <TooltipContent side="bottom">
        <p>You can only forfeit on your turn</p>
      </TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

### 2. Confirmation Modal

**AlertDialog Implementation:**
- **Title**: "Forfeit Match?"
- **Body**: "Are you sure you want to forfeit? This will end the match."
- **Buttons**:
  - **Cancel**: Secondary style, closes modal
  - **Forfeit**: Red/destructive style, executes forfeit
- **Focus Trap**: Automatically managed by AlertDialog component
- **Escape Key**: Closes modal (built-in AlertDialog behavior)
- **Loading State**: Shows "Forfeiting..." while processing

**Modal Guards:**
```tsx
<AlertDialog
  open={showEndMatchDialog}
  onOpenChange={(open) => !forfeitLoading && setShowEndMatchDialog(open)}
>
```

Prevents closing while forfeit is in progress.

### 3. Forfeit Execution Flow

**Defensive Checks (Before RPC Call):**
```typescript
async function forfeitMatch() {
  // 1. Check required data exists
  if (!room || !matchState || !currentUserId) {
    toast.error("Match data not available");
    return;
  }

  // 2. Check if match already ended
  if (room.status === 'completed' || room.status === 'finished' || room.status === 'forfeited') {
    toast.error("Match already ended");
    setShowEndMatchDialog(false);
    return;
  }

  // 3. Safely resolve opponent ID
  const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;
  if (!opponentId) {
    toast.error("Couldn't forfeit—opponent not found");
    return;
  }

  setForfeitLoading(true);
  setDidIForfeit(true);
  setShowEndMatchDialog(false);

  // ... continue with RPC call
}
```

**Database Updates (via RPC):**

The `rpc_forfeit_match` function handles:

1. **Authentication Check**: Verifies `auth.uid()` exists
2. **Room Validation**: Locks and retrieves room with `FOR UPDATE`
3. **Player Verification**: Ensures user is a player in the match
4. **Status Check**: Prevents forfeit if match already ended
5. **Winner Determination**: Sets opponent as winner
6. **Event Creation**: Inserts forfeit event in `match_events`:
   ```sql
   INSERT INTO match_events (room_id, player_id, seq, event_type, payload, leg, created_at)
   VALUES (
     p_room_id,
     v_user_id,
     v_event_seq,
     'forfeit',
     jsonb_build_object(
       'forfeiter_id', v_user_id,
       'winner_id', v_winner_id
     ),
     v_room.current_leg,
     now()
   );
   ```
6. **Room Update**: Updates `match_rooms`:
   ```sql
   UPDATE match_rooms
   SET
     status = 'forfeited',
     winner_id = v_winner_id,
     updated_at = now()
   WHERE id = p_room_id;
   ```

**RPC Response:**
```json
{
  "ok": true,
  "winner_id": "uuid",
  "forfeiter_id": "uuid"
}
```

**Error Handling:**
```typescript
if (error) {
  console.error('[FORFEIT] RPC error:', error);
  throw error;
}

if (!data || data.ok === false) {
  const errorMsg = data?.error || 'Unknown error';
  console.error('[FORFEIT] RPC returned error:', errorMsg);
  toast.error("Couldn't forfeit—try again");
  setDidIForfeit(false);
  setForfeitLoading(false);
  return;
}
```

### 4. Opponent Notification

**Realtime Signal:**
After successful forfeit, send signal to opponent:

```typescript
const { error: signalError } = await supabase
  .from('match_signals')
  .insert({
    room_id: matchId,
    from_user_id: currentUserId,
    to_user_id: opponentId,
    type: 'forfeit',
    payload: { message: 'Opponent forfeited the match' }
  });
```

**Opponent Receives Signal:**
The opponent's client listens for signals via realtime subscription:

```typescript
// In useEffect realtime subscription
if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
  console.log('[SIGNALS] Opponent forfeited, showing modal');
  setShowOpponentForfeitSignalModal(true);
}
```

### 5. Forfeiting Player Redirect

**Post-Forfeit Actions:**
```typescript
toast.success('You forfeited the match');

// Cleanup WebRTC/subscriptions
if (cleanupMatchRef.current) {
  cleanupMatchRef.current();
}

// Clear local storage
await clearMatchState(matchId);

// Navigate to play hub
router.push('/app/play');
```

**User Experience:**
1. Confirmation modal closes
2. Toast shows: "You forfeited the match"
3. Match state cleared from storage
4. Redirected to `/app/play` (Play hub)

### 6. Opponent Modal & Return

**Opponent Forfeit Signal Modal:**

When opponent receives forfeit signal, they see:

**Title**: "Opponent Forfeited"
**Subtitle**: "You win by forfeit"

**Match Summary Displayed:**
- Winner's avatar and name
- Winner's stats:
  - 3-Dart Average
  - Highest Visit
  - Legs Won
- Opponent (forfeiter) avatar and name with "Forfeited" label
- Opponent's stats (same format)

**Primary Action Button:**
```tsx
<Button
  onClick={async () => {
    setShowOpponentForfeitSignalModal(false);
    if (cleanupMatchRef.current) {
      cleanupMatchRef.current();
    }
    await clearMatchState(matchId);
    router.push('/app/play');
  }}
  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
>
  <Home className="w-4 h-4 mr-2" />
  Return to Dashboard
</Button>
```

**Scoring Input Disabled:**
While the opponent forfeit modal is open:
- The modal uses `onOpenChange={() => {}}` - prevents manual closing
- Must click "Return to Dashboard" button
- Scoring panel is not visible (match is complete, so opponent sees visit history instead)

**Match Complete Modal (Alternative Flow):**

There's also a general match complete modal that shows when:
- Match status becomes 'forfeited' via room update (alternative to signal)
- Regular match completion

This modal shows similar summary and has same "Return to Dashboard" button.

### 7. Defensive Programming

**Network Failure Handling:**
```typescript
try {
  // ... RPC call and signal
} catch (error: any) {
  console.error('[FORFEIT] Failed to forfeit:', error);
  toast.error("Couldn't forfeit—try again");
  setDidIForfeit(false);
  setForfeitLoading(false);
}
```

**Double Forfeit Prevention:**
```typescript
// Check at start of function
if (room.status === 'completed' || room.status === 'finished' || room.status === 'forfeited') {
  toast.error("Match already ended");
  setShowEndMatchDialog(false);
  return;
}

// Button is disabled if match is complete
disabled={forfeitLoading || !isMyTurn || matchComplete}

// RPC also checks server-side
IF v_room.status IN ('finished', 'forfeited', 'completed') THEN
  RETURN jsonb_build_object('ok', false, 'error', 'match_already_ended');
END IF;
```

**Safe Opponent ID Resolution:**
```typescript
const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;
if (!opponentId) {
  toast.error("Couldn't forfeit—opponent not found");
  return;
}
```

**Null/Undefined Guards:**
```typescript
if (!room || !matchState || !currentUserId) {
  toast.error("Match data not available");
  return;
}
```

### 8. UI Polish

**Forfeit Button Positioning:**
- Top-left corner of screen
- Positioned absolutely with z-index
- Part of top bar with "QUICK MATCH" label next to it
- Maintains position throughout match

**Visual States:**

**Normal (My Turn):**
```css
border-red-500/30 text-red-400 hover:bg-red-500/10 bg-slate-900/80 backdrop-blur-sm
```

**Disabled (Not My Turn / Match Complete):**
```css
disabled:opacity-40 disabled:cursor-not-allowed
```

**Loading:**
```tsx
{forfeitLoading ? 'Forfeiting...' : 'Forfeit'}
```

**Quick Match Label:**
- Stays unchanged next to forfeit button
- Small rounded pill with semi-transparent background
- Text: "QUICK MATCH" in uppercase

## Realtime Flow Diagram

```
Forfeiting Player (Player A):
┌─────────────────────────────┐
│ 1. Click Forfeit (my turn)  │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 2. See Confirmation Modal   │
│    "Forfeit Match?"         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 3. Click "Forfeit" Button   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 4. RPC: rpc_forfeit_match   │
│    - Creates forfeit event  │
│    - Sets status=forfeited  │
│    - Sets winner=opponent   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 5. Insert forfeit signal    │
│    to match_signals         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 6. Toast: "You forfeited"   │
│ 7. Cleanup & clear storage  │
│ 8. Navigate to /app/play    │
└─────────────────────────────┘

Opponent (Player B):
┌─────────────────────────────┐
│ 1. Realtime: receives       │
│    forfeit signal           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 2. Show "Opponent Forfeited"│
│    blocking modal           │
│    - Display match summary  │
│    - Show stats             │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 3. Scoring inputs disabled  │
│    (match complete)         │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 4. User clicks              │
│    "Return to Dashboard"    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│ 5. Cleanup & clear storage  │
│ 6. Navigate to /app/play    │
└─────────────────────────────┘
```

## Error Messages

All error messages follow user-friendly pattern:

| Scenario | Toast Message |
|----------|---------------|
| Not authenticated | "Match data not available" |
| Missing match data | "Match data not available" |
| Match already ended | "Match already ended" |
| Opponent not found | "Couldn't forfeit—opponent not found" |
| RPC error | "Couldn't forfeit—try again" |
| Network failure | "Couldn't forfeit—try again" |
| Not player's turn | "You can only forfeit on your turn" |
| Forfeit success | "You forfeited the match" |

## Database Schema Usage

### Tables Involved

**1. `match_rooms`:**
- **Read**: Current status, player IDs
- **Write**:
  - `status = 'forfeited'`
  - `winner_id = opponent_user_id`
  - `updated_at = now()`

**2. `match_events`:**
- **Write**: New event with:
  - `event_type = 'forfeit'`
  - `payload = { forfeiter_id, winner_id }`
  - `seq` = next sequence number
  - `leg` = current leg number

**3. `match_signals`:**
- **Write**: Realtime signal to opponent:
  - `type = 'forfeit'`
  - `from_user_id = forfeiter`
  - `to_user_id = opponent`
  - `payload = { message }`

### RPC Function

**`rpc_forfeit_match(p_room_id uuid)`**

Location: `/supabase/migrations/20260202235834_create_rpc_forfeit_match.sql`

**Security:** `SECURITY DEFINER` - runs with elevated privileges

**Returns:**
```json
{
  "ok": boolean,
  "winner_id": "uuid",
  "forfeiter_id": "uuid",
  "error": "string" (optional)
}
```

**Error Codes:**
- `not_authenticated` - No auth.uid()
- `room_not_found` - Room doesn't exist
- `not_a_player` - User not in this match
- `match_already_ended` - Status already terminal

## Testing Scenarios

### Scenario 1: Normal Forfeit (My Turn)
```
Given: Player A's turn
When: Player A clicks Forfeit → Confirms
Then:
  - Player A sees: "You forfeited the match"
  - Player A navigates to /app/play
  - Player B sees: "Opponent Forfeited" modal
  - Player B clicks "Return to Dashboard"
  - Player B navigates to /app/play
  - Database shows: status='forfeited', winner=Player B
```

### Scenario 2: Forfeit Disabled (Not My Turn)
```
Given: Player B's turn (not Player A's turn)
When: Player A hovers Forfeit button
Then:
  - Button is disabled (40% opacity)
  - Tooltip shows: "You can only forfeit on your turn"
  - Clicking does nothing (button disabled)
```

### Scenario 3: Double Forfeit Prevention
```
Given: Player A already forfeited
When: Player A tries to forfeit again (shouldn't be possible)
Then:
  - Button is disabled (match complete)
  - If somehow clicked: toast "Match already ended"
  - RPC also rejects: "match_already_ended"
```

### Scenario 4: Network Failure
```
Given: Player A's turn
When: Player A confirms forfeit but network fails
Then:
  - Toast: "Couldn't forfeit—try again"
  - Modal closes
  - forfeitLoading reset to false
  - didIForfeit reset to false
  - Player can try again
```

### Scenario 5: Missing Opponent
```
Given: Corrupted match data (no opponent_id)
When: Player A tries to forfeit
Then:
  - Toast: "Couldn't forfeit—opponent not found"
  - No database changes
  - Modal closes
```

### Scenario 6: Cancel Forfeit
```
Given: Forfeit confirmation modal open
When: Player clicks "Cancel" OR presses Escape
Then:
  - Modal closes
  - No forfeit happens
  - Match continues normally
```

### Scenario 7: Opponent Receives Forfeit
```
Given: Player A forfeits
When: Player B's client receives signal
Then:
  - "Opponent Forfeited" modal appears
  - Modal blocks all input (can't close without clicking button)
  - Shows match summary with stats
  - Scoring inputs hidden (match complete)
  - "Return to Dashboard" button navigates to /app/play
```

## Files Modified

### 1. `/app/app/play/quick-match/match/[matchId]/page.tsx`

**Imports Added:**
```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
```

**Functions Updated:**

**`forfeitMatch()`:**
- Added defensive checks for null/undefined
- Added match status verification
- Added safe opponent ID resolution
- Improved error messages (user-friendly)
- Changed redirect to `/app/play` instead of `/app/play/quick-match`
- Updated success toast to "You forfeited the match"

**UI Changes:**

**Forfeit Button:**
- Wrapped in `TooltipProvider` and `Tooltip`
- Added `disabled` logic: `forfeitLoading || !isMyTurn || matchComplete`
- Added `onClick` handler that checks `isMyTurn` before opening modal
- Updated className: `disabled:opacity-40 disabled:cursor-not-allowed`
- Added conditional `TooltipContent` when not player's turn

**Opponent Forfeit Signal Modal:**
- Updated button text: "Back to Quick Match" → "Return to Dashboard"
- Added Home icon to button
- Changed navigation: `/app/play/quick-match` → `/app/play`

**Match Complete Modal:**
- Updated button text: "Back to Quick Match" → "Return to Dashboard"
- Changed navigation: `/app/play/quick-match` → `/app/play`

## Component Dependencies

**New Dependency:**
- `@/components/ui/tooltip` - Provides tooltip functionality for disabled forfeit button

**Existing Dependencies Used:**
- `AlertDialog` - Confirmation modal
- `Dialog` - Opponent forfeit modal
- `Button` - All interactive buttons
- `toast` - User feedback

## Edge Cases Handled

1. ✅ **Not Player's Turn**: Button disabled with tooltip
2. ✅ **Match Already Complete**: Button disabled, no modal
3. ✅ **Double Forfeit**: Server-side and client-side prevention
4. ✅ **Missing Opponent**: Error toast, no crash
5. ✅ **Network Failure**: Error toast, can retry
6. ✅ **Missing Match Data**: Error toast, safe return
7. ✅ **RPC Failure**: Error handling with user-friendly message
8. ✅ **Signal Send Failure**: Logged, doesn't block forfeit
9. ✅ **Cancel Forfeit**: Modal closes, match continues
10. ✅ **Opponent Disconnected**: Signal sent, waiting in database

## Build Status

✅ Build successful
✅ Type checking passed
✅ All components compiled correctly
✅ No webpack errors
✅ Static page generation complete

## User Experience Summary

### Forfeiting Player
1. Can only forfeit on their turn (button disabled otherwise)
2. Hover shows tooltip explaining restriction
3. Click opens confirmation modal
4. Clear warning about match ending
5. Can cancel or confirm
6. On confirm: friendly success message
7. Immediate redirect to play hub
8. Match state cleaned up properly

### Opponent
1. Receives instant notification via realtime
2. Sees blocking modal with match summary
3. Clear indication of victory by forfeit
4. View complete stats for both players
5. Single clear action: "Return to Dashboard"
6. Clean navigation back to play hub
7. Match state cleaned up properly

## Conclusion

The forfeit flow is now fully functional with:

✅ **Turn-based restriction** - Can only forfeit on player's turn
✅ **Confirmation modal** - Prevents accidental forfeits
✅ **Proper database updates** - Via secure RPC function
✅ **Realtime opponent notification** - Via match_signals
✅ **Clean redirects** - Both players go to /app/play
✅ **Defensive programming** - Handles all edge cases
✅ **User-friendly errors** - Clear, actionable messages
✅ **UI polish** - Proper disabled states and tooltips

The implementation follows all requirements and provides a smooth, error-free forfeit experience for both players.
