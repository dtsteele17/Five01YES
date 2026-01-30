# Quick Match Improvements Complete

## Overview

Implemented three major improvements to the Quick Match system:

1. **Enhanced Visit History UI** - Shows visits from both players in realtime
2. **Forfeit with Opponent Modal** - Proper forfeit handling with opponent notification
3. **Alternate Starting Player Each Leg** - Fair leg starter alternation

## A) Visit History UI Improvements

### Changes to Adapter (`lib/match/mapRoomToMatchState.ts`)

**Enhanced MatchStateVisit Interface:**
```typescript
export interface MatchStateVisit {
  id: string;
  playerId: string;
  playerName: string;
  by: 'you' | 'opponent';          // NEW: indicates whose visit
  label: string;                   // NEW: display label (YOU or player name)
  score: number;
  remainingAfter: number;          // RENAMED: from 'remaining'
  isBust: boolean;
  isCheckout: boolean;
  createdAt: string;
}
```

**Filter Visit Events:**
Now filters events by type to only include actual visits:
```typescript
const currentLegEvents = events.filter(e => {
  const isVisitEvent = e.event_type === 'visit' ||
                      e.event_type === 'visit_submitted' ||
                      e.event_type === 'throw' ||
                      e.event_type === 'score';
  return isVisitEvent && e.payload.leg === room.current_leg;
});
```

**Pre-computed Display Values:**
- `by`: 'you' or 'opponent' based on currentUserId
- `label`: 'YOU' for current user, player name for opponent

### UI Updates (`app/play/quick-match/match/[matchId]/page.tsx`)

**Visit History Display:**
- Shows visits from **both players** in the current leg
- Most recent visits appear first (reversed list)
- Distinct styling for your visits vs opponent visits:
  - Your visits: teal background with teal border
  - Opponent visits: slate background with slate border
- Each visit shows:
  - Player label (YOU or opponent name)
  - Visit number (#1, #2, etc.)
  - Score achieved
  - Remaining score after the visit
  - Badges for BUST or CHECKOUT events

**Realtime Updates:**
Visit history automatically updates when:
- You submit a score
- Opponent submits a score
- New leg begins (history clears for new leg)

## B) Forfeit with Opponent Modal

### New RPC Function (`forfeit_quick_match`)

Created server-side forfeit function in migration `add_forfeit_and_fix_leg_alternation`:

```sql
CREATE OR REPLACE FUNCTION public.forfeit_quick_match(
  p_room_id UUID
)
RETURNS JSONB
```

**Features:**
- Validates user is authenticated and in the match
- Validates match is still active
- Sets opponent as winner
- Creates forfeit event in match_events
- Updates match status to 'finished'
- Atomic transaction prevents race conditions

### UI Implementation

**Client Forfeit Flow:**
1. User clicks "End Match" → confirmation dialog
2. User confirms → calls `supabase.rpc('forfeit_quick_match', { p_room_id })`
3. On success → redirects to quick match lobby

**Opponent Notification Flow:**
1. Realtime subscription detects:
   - Forfeit event in match_events, OR
   - match_rooms status changes to 'finished' with current user as winner
2. Shows modal with opponent's name: "{Name} has left the game"
3. "Leave" button redirects to quick match lobby

**Realtime Subscriptions:**

Updated room subscription:
```typescript
// Detect opponent forfeit via room status
if (updatedRoom.status === 'finished' && updatedRoom.winner_id === currentUserId) {
  setOpponentForfeitName(opponentProfile?.username || 'Opponent');
  setShowOpponentForfeitModal(true);
}
```

Updated events subscription:
```typescript
// Detect opponent forfeit via forfeit event
if (newEvent.event_type === 'forfeit' && newEvent.player_id !== currentUserId) {
  setOpponentForfeitName(opponentProfile?.username || 'Opponent');
  setShowOpponentForfeitModal(true);
}
```

**Modal Component:**
```tsx
<Dialog open={showOpponentForfeitModal} onOpenChange={() => {}}>
  <DialogContent className="bg-slate-900 border-white/10 text-white">
    <DialogHeader>
      <DialogTitle className="text-2xl font-bold text-white text-center">
        {opponentForfeitName} has left the game
      </DialogTitle>
    </DialogHeader>
    <div className="text-center py-4">
      <p className="text-gray-300 mb-6">The match has ended.</p>
      <Button onClick={() => router.push('/app/play/quick-match')}>
        Leave
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

## C) Alternate Starting Player Each Leg

### Updated RPC Function (`submit_quick_match_throw`)

Fixed the leg completion logic to alternate starting players:

**Previous Behavior:**
```sql
-- Always started with player1
current_turn = v_room.player1_id
```

**New Behavior:**
```sql
-- Alternate starting player based on leg number
-- Odd legs (1, 3, 5, ...): player1 starts
-- Even legs (2, 4, 6, ...): player2 starts
IF v_next_leg % 2 = 1 THEN
  v_next_leg_starter := v_room.player1_id;
ELSE
  v_next_leg_starter := v_room.player2_id;
END IF;

UPDATE public.match_rooms
SET
  current_leg = v_next_leg,
  player1_remaining = v_room.game_mode,
  player2_remaining = v_room.game_mode,
  current_turn = v_next_leg_starter,  -- Uses alternating starter
  ...
WHERE id = p_room_id;
```

**How It Works:**
1. Player wins leg → server calculates next leg number
2. Server determines starter based on leg parity:
   - Leg 1: player1 starts
   - Leg 2: player2 starts
   - Leg 3: player1 starts
   - And so on...
3. Both clients receive room update via realtime
4. UI automatically shows whose turn it is based on `current_turn` field

**UI Reflection:**
The turn indicator updates automatically via the realtime subscription:
- Subscribes to match_rooms UPDATE events
- Reads `current_turn` field from room
- Adapter maps to `currentTurnPlayer` (1 or 2)
- UI shows "Your Turn" or "Opponent's Turn" banner

## Files Modified

### Database
- **Migration:** `add_forfeit_and_fix_leg_alternation`
  - Created `forfeit_quick_match()` RPC function
  - Updated `submit_quick_match_throw()` with alternating leg starter

### Adapter
- **File:** `lib/match/mapRoomToMatchState.ts`
  - Enhanced `MatchStateVisit` interface with `by`, `label`, `remainingAfter`
  - Added visit event type filtering
  - Pre-computed display values

### UI
- **File:** `app/play/quick-match/match/[matchId]/page.tsx`
  - Updated forfeit function to use RPC
  - Added opponent forfeit modal state
  - Enhanced realtime subscriptions to detect forfeits
  - Updated visit history display to use new adapter fields
  - Added opponent forfeit modal component

## Expected Behavior

### Visit History
✅ Every submitted visit appears for both players
✅ Visits update in realtime via subscriptions
✅ Clear visual distinction between your visits and opponent visits
✅ Shows score, remaining, bust/checkout status
✅ History clears when new leg starts

### Forfeit
✅ User can forfeit via "End Match" → confirm dialog
✅ Forfeit uses server-side RPC (secure, atomic)
✅ Opponent sees modal: "{Name} has left the game"
✅ Modal has "Leave" button to exit
✅ Forfeiting user immediately redirected
✅ Winner recorded correctly in database

### Leg Alternation
✅ Leg 1: player1 starts (by convention)
✅ Leg 2: player2 starts
✅ Leg 3: player1 starts
✅ Pattern continues for all legs
✅ Turn indicator updates automatically for both players
✅ No client-side turn decision (server decides)

## Testing Checklist

### Visit History
- [ ] Start a quick match with another player
- [ ] Submit scores from both accounts
- [ ] Verify both players' visits appear in history
- [ ] Verify your visits have teal styling
- [ ] Verify opponent visits have slate styling
- [ ] Verify scores and remaining values are correct
- [ ] Complete a leg and verify history clears for new leg

### Forfeit
- [ ] Start a quick match
- [ ] Click "End Match" on one player's side
- [ ] Verify forfeit confirmation dialog appears
- [ ] Confirm forfeit
- [ ] Verify forfeiting player redirects to lobby
- [ ] Verify opponent sees modal with player name
- [ ] Click "Leave" on modal
- [ ] Verify opponent redirects to lobby
- [ ] Check database: winner_id should be set correctly

### Leg Alternation
- [ ] Start a best-of-3 or best-of-5 match
- [ ] Verify Leg 1 starts with player1
- [ ] Complete Leg 1
- [ ] Verify Leg 2 starts with player2
- [ ] Complete Leg 2
- [ ] Verify Leg 3 starts with player1
- [ ] Verify turn banner updates correctly for both players
- [ ] Verify no client-side errors in console

## Security Considerations

### Forfeit RPC
- ✅ Uses `SECURITY DEFINER` for secure execution
- ✅ Validates user authentication (`auth.uid()`)
- ✅ Validates user is a player in the match
- ✅ Validates match is still active
- ✅ Uses `FOR UPDATE` lock to prevent race conditions
- ✅ Atomic transaction (all updates succeed or fail together)

### Visit Events
- ✅ RLS policies ensure users can only submit their own scores
- ✅ Server validates it's the player's turn
- ✅ Server calculates leg starter (clients don't decide)
- ✅ All game logic happens server-side

## Code Quality

### Minimal Changes
- Reused existing UI patterns from local match
- Used existing realtime subscription structure
- Leveraged existing adapter pattern
- No unnecessary refactoring

### Consistency
- Follows existing component styling
- Uses same Badge and Card components
- Matches existing modal patterns
- Consistent with codebase conventions

### Type Safety
- All TypeScript types compile successfully
- Strong typing for adapter interfaces
- Type-safe RPC calls
- No `any` types in new code

## Performance

### Realtime Efficiency
- Subscriptions use proper filters (`filter: room_id=eq.${matchId}`)
- Only receives events for current match
- Efficient event filtering in adapter
- Minimal re-renders (only when data changes)

### Database
- Uses indexed columns for queries
- Atomic RPC functions prevent conflicts
- Proper row locking prevents race conditions
- Efficient JSONB operations for summary field

## Conclusion

All three improvements have been successfully implemented:

1. **Visit History** now shows comprehensive realtime visit data for both players
2. **Forfeit** properly ends matches and notifies opponents with a modal
3. **Leg Alternation** fairly alternates starting players each leg

The implementation follows best practices:
- Server-side game logic (security)
- Realtime synchronization (UX)
- Type-safe code (reliability)
- Minimal code changes (maintainability)
- Consistent UI patterns (familiarity)

Build successful, ready for testing.
