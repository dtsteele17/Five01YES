# Opponent Forfeit Signal System - Complete

## Overview
Implemented a real-time forfeit signal system using Supabase `match_signals` table. When a player forfeits, a signal is sent to the opponent who receives it via real-time subscription, triggering a modal popup and automatic cleanup of WebRTC resources.

## Changes Made

### 1. Database Migration - Add Forfeit Signal Type
**File**: `supabase/migrations/add_forfeit_signal_type_to_match_signals.sql`

Updated the `match_signals` table CHECK constraint to include `'forfeit'` as a valid signal type:

```sql
ALTER TABLE match_signals DROP CONSTRAINT IF EXISTS match_signals_type_check;
ALTER TABLE match_signals ADD CONSTRAINT match_signals_type_check
  CHECK (type IN ('offer', 'answer', 'ice', 'state', 'forfeit'));
```

**Valid signal types now**:
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice` - ICE candidate
- `state` - State information (camera on/off, etc.)
- `forfeit` - Forfeit notification (NEW)

### 2. Updated forfeitMatch Function
**File**: `app/app/play/quick-match/match/[matchId]/page.tsx`

**Before**: Only called RPC and navigated away

**After**: Sends forfeit signal to opponent before cleanup

```typescript
async function forfeitMatch() {
  // ... existing RPC call ...

  // NEW: Send forfeit signal to opponent
  if (opponentId) {
    console.log('[FORFEIT] Sending forfeit signal to opponent:', opponentId);
    const { error: signalError } = await supabase
      .from('match_signals')
      .insert({
        room_id: matchId,
        from_user_id: currentUserId,
        to_user_id: opponentId,
        type: 'forfeit',
        payload: { message: 'Opponent forfeited the match' }
      });

    if (signalError) {
      console.error('[FORFEIT] Failed to send forfeit signal:', signalError);
    } else {
      console.log('[FORFEIT] Forfeit signal sent successfully');
    }
  }

  // ... existing cleanup and navigation ...
}
```

### 3. Added Realtime Subscription for Forfeit Signals
**File**: `app/app/play/quick-match/match/[matchId]/page.tsx`

Added new `signalsChannel` to subscribe to `match_signals` table:

```typescript
function setupRealtimeSubscriptions() {
  // ... existing roomChannel ...

  // NEW: Subscribe to match signals
  const signalsChannel = supabase
    .channel(`signals_${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'match_signals',
        filter: `room_id=eq.${matchId}`,
      },
      (payload) => {
        console.log('[SIGNALS] Signal received:', payload.new);
        const signal = payload.new as any;

        // Handle forfeit signals
        if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
          console.log('[SIGNALS] Opponent forfeited, showing modal');
          setShowOpponentForfeitSignalModal(true);

          // Cleanup after short delay to allow modal to show
          setTimeout(() => {
            if (cleanupMatchRef.current) {
              console.log('[SIGNALS] Auto-cleanup triggered after forfeit');
              cleanupMatchRef.current();
            }
          }, 100);
        }
      }
    )
    .subscribe();

  // ... existing rematchChannel ...

  return () => {
    supabase.removeChannel(roomChannel);
    supabase.removeChannel(signalsChannel); // NEW
    supabase.removeChannel(rematchChannel);
  };
}
```

### 4. Added Modal State
**File**: `app/app/play/quick-match/match/[matchId]/page.tsx`

Added new state to control the forfeit signal modal:

```typescript
const [showOpponentForfeitSignalModal, setShowOpponentForfeitSignalModal] = useState(false);
```

### 5. Added Forfeit Signal Modal UI
**File**: `app/app/play/quick-match/match/[matchId]/page.tsx`

Simple, clean modal that shows when opponent forfeits:

```typescript
<Dialog open={showOpponentForfeitSignalModal} onOpenChange={() => {}}>
  <DialogContent className="bg-slate-900 border-white/10 text-white">
    <DialogHeader>
      <DialogTitle className="text-2xl font-bold text-white text-center">
        Opponent forfeited the match.
      </DialogTitle>
    </DialogHeader>
    <div className="py-4 text-center">
      <Button
        onClick={() => {
          setShowOpponentForfeitSignalModal(false);
          router.push('/app/play');
        }}
        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
      >
        Return
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

## How It Works

### Player A (Forfeits)
1. Clicks "Forfeit" button
2. Confirms in dialog
3. `forfeitMatch()` function executes:
   - Calls `rpc_forfeit_match` RPC
   - Sends forfeit signal to opponent via `match_signals` INSERT
   - Cleans up camera/WebRTC
   - Navigates to `/app/play`

### Player B (Receives Forfeit)
1. Real-time subscription receives INSERT on `match_signals`
2. Signal has `type = 'forfeit'` and `to_user_id = currentUserId`
3. Modal appears: "Opponent forfeited the match."
4. After 100ms delay, cleanup function runs:
   - Stops camera via `stopCamera()`
   - Closes peer connections
   - Clears sessionStorage
5. User clicks "Return" button → navigates to `/app/play`

## Cleanup Process

The `cleanupMatchRef.current()` function handles:

```typescript
cleanupMatchRef.current = () => {
  console.log('[CLEANUP] Starting match cleanup');

  // Stop camera and close peer connections
  stopCamera('match cleanup');

  // Clear any cached match context
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(`match_context_${matchId}`);
    sessionStorage.removeItem(`lobby_id_${matchId}`);
  }

  console.log('[CLEANUP] Match cleanup complete');
};
```

**Triggered automatically when**:
- Forfeit signal is received (after 100ms)
- Room status changes to 'forfeited' or 'finished'
- Component unmounts

## Security

### Row Level Security (RLS)
The `match_signals` table has strict RLS policies:

**INSERT Policy**:
```sql
CREATE POLICY "Users can send signals as themselves"
  ON match_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = from_user_id);
```
- Users can only send signals as themselves
- Cannot impersonate other users

**SELECT Policy**:
```sql
CREATE POLICY "Users can only read signals sent to them"
  ON match_signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = to_user_id);
```
- Users can only see signals addressed to them
- Cannot see signals meant for other players

### Signal Routing
- Forfeit signal is sent with `to_user_id = opponentId`
- Realtime subscription filters by `room_id = currentRoomId`
- Client-side double-checks `to_user_id === currentUserId` before showing modal
- Prevents accidental processing of wrong signals

## Testing Checklist

- [x] Build passes without errors
- [ ] Player A forfeits → Player B receives forfeit signal
- [ ] Modal shows "Opponent forfeited the match."
- [ ] Return button navigates to /app/play
- [ ] Camera stops when forfeit signal received
- [ ] WebRTC connections cleaned up
- [ ] SessionStorage cleared
- [ ] Realtime subscription cleaned up
- [ ] No console errors
- [ ] Works in Quick Match
- [ ] Works in Ranked Match (if applicable)
- [ ] Works in Tournament Match (if applicable)

## Key Features

✅ **Real-time Forfeit Notification**: Opponent knows immediately when player forfeits
✅ **Automatic Cleanup**: Camera, WebRTC, and subscriptions cleaned up automatically
✅ **Clean Modal UI**: Simple message with Return button
✅ **Secure Routing**: RLS ensures signals only reach intended recipient
✅ **Subscription Cleanup**: Channels properly removed on unmount
✅ **Logging**: Comprehensive console logs for debugging

## Performance

- Minimal overhead: Single INSERT on forfeit
- Efficient filtering: Supabase RLS filters signals by `to_user_id`
- Fast delivery: Real-time subscription provides sub-second latency
- Clean cleanup: All resources properly released

## Future Enhancements

Potential improvements (not implemented):
- Add forfeit reason in payload
- Show forfeit animation/transition
- Track forfeit statistics
- Add forfeit penalties for ranked matches
- Implement forfeit cooldown period

## Files Modified

1. `supabase/migrations/add_forfeit_signal_type_to_match_signals.sql` (NEW)
2. `app/app/play/quick-match/match/[matchId]/page.tsx` (MODIFIED)
   - Added forfeit signal sending in `forfeitMatch()`
   - Added `signalsChannel` subscription
   - Added `showOpponentForfeitSignalModal` state
   - Added forfeit signal modal UI
   - Updated cleanup function return to include signalsChannel

## Breaking Changes

None - all changes are additive and backward compatible.

## Notes

- The `match_signals` table was already enabled for realtime (no migration needed)
- Forfeit signals use the same RLS and routing as WebRTC signals
- Modal cannot be dismissed except via "Return" button (intentional)
- Cleanup happens automatically 100ms after signal received
- Works alongside existing forfeit detection via room status changes
