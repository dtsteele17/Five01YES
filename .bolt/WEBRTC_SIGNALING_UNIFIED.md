# WebRTC Signaling Unified - Complete Revert to match_signals

## Summary

All WebRTC signaling has been unified to use the `public.match_signals` table with correct column names (`from_user_id`, `to_user_id`). The old `match_call_signals` table is no longer used anywhere in the codebase.

## Files Changed

### 1. **New File: `/lib/webrtc/signaling-adapter.ts`**
   - Centralized signaling adapter for all Quick Match formats
   - Functions:
     - `sendSignal(roomId, opponentId, type, payload)` - Inserts into match_signals
     - `subscribeSignals(roomId, myUserId, handler)` - Subscribes to match_signals with room filter
     - `fetchOpponentId(roomId, myUserId)` - Computes opponent from match_rooms
   - All logging uses `[WEBRTC QS]` prefix
   - Handles signal types: 'offer', 'answer', 'ice', 'state'

### 2. **Updated: `/lib/hooks/useMatchWebRTC.ts`**
   - Completely rewritten to use signaling adapter
   - **Key Changes:**
     - Uses `match_signals` table (NOT match_call_signals)
     - Fetches opponent from `match_rooms` table automatically
     - Determines if user is player1 or player2
     - **Player1 creates offer, Player2 waits for offer**
     - Peer connection stays alive for entire match (no turn/leg changes)
     - No gating on `isMatchActive` or turn status for signaling
     - Proper `ontrack` handler sets remote stream
     - Tracks added to peer connection before creating offer
     - All logging uses `[WEBRTC QS]` prefix

### 3. **Updated: `/app/app/play/quick-match/match/[matchId]/page.tsx`**
   - Hook props simplified to: `{ roomId, myUserId, isMyTurn }`
   - Removed `opponentId` and `isMatchActive` props (computed internally)

### 4. **Migration: `add_state_signal_type_to_match_signals`**
   - Added 'state' signal type to match_signals CHECK constraint
   - Allows WebRTC peers to share camera state (on/off)

## Database Schema: match_signals

```sql
CREATE TABLE match_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id),
  to_user_id uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('offer', 'answer', 'ice', 'state')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS Policies
-- INSERT: Can only send signals as yourself (auth.uid() = from_user_id)
-- SELECT: Can only read signals sent TO you (auth.uid() = to_user_id)
```

## How It Works

### State Machine

1. **Fetch ICE Servers** - Get Xirsys STUN/TURN servers
2. **Fetch Opponent** - Query match_rooms to determine opponent_id
3. **Determine Role** - Check if player1 (creates offer) or player2 (waits)
4. **Create Peer Connection** - Stable RTCPeerConnection for entire match
5. **Subscribe to Signals** - Real-time subscription to match_signals
6. **Add Local Tracks** - getUserMedia and add tracks to peer connection
7. **Negotiation**:
   - Player1: Creates offer → sends to player2
   - Player2: Receives offer → creates answer → sends to player1
   - Both: Exchange ICE candidates
8. **Connected** - Video streams flow bidirectionally

### Prerequisites for Signaling

Only 3 prerequisites required (NO turn/match status checks):
- `roomId` - Match room UUID
- `myUserId` - Current user auth.uid()
- `opponentUserId` - Computed from match_rooms

### Signal Flow

```
Player1 (Creates Offer)          Player2 (Waits for Offer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Turn on camera
2. Add tracks to PC
3. Create offer
4. Send 'offer' signal ────────────> 5. Receive 'offer'
                                      6. setRemoteDescription
                                      7. Create answer
8. Receive 'answer' <──────────────── 8. Send 'answer'
9. setRemoteDescription
10. Exchange ICE candidates <────────> Exchange ICE candidates
11. ✅ CONNECTED                      11. ✅ CONNECTED
```

### Offer/Answer Role

- **Player1** (match_rooms.player1_id): IMPOLITE peer, creates offer
- **Player2** (match_rooms.player2_id): POLITE peer, waits for offer
- Perfect negotiation pattern handles offer collisions

### Video Display

- **My Turn**: Display local stream (my camera)
- **Opponent Turn**: Display remote stream (opponent camera)
- `isMyTurn` is ONLY for UI display, does NOT gate signaling

## Logging

All logs use `[WEBRTC QS]` prefix and include:

### Prerequisites Resolution
```
[WEBRTC QS] ========== FETCHING OPPONENT ==========
[WEBRTC QS] Room ID: abc-123
[WEBRTC QS] My User ID: xyz-456
[WEBRTC QS] Match room data: { player1_id: 'xyz-456', player2_id: 'def-789' }
[WEBRTC QS] ✅ Opponent resolved: def-789
[WEBRTC QS] I am: PLAYER1 (will create offer)
```

### Signaling
```
[WEBRTC QS] ========== SEND SIGNAL ==========
[WEBRTC QS] Type: offer
[WEBRTC QS] Room ID: abc-123
[WEBRTC QS] To User ID: def-789
[WEBRTC QS] 📤 Inserting into match_signals: { room_id: 'abc-123', to_user_id: 'def-789', type: 'offer' }
[WEBRTC QS] ✅ Signal sent successfully
```

### Subscription
```
[WEBRTC QS] ========== SUBSCRIPTION SETUP ==========
[WEBRTC QS] Room ID: abc-123
[WEBRTC QS] My User ID: xyz-456
[WEBRTC QS] Filter: room_id=eq.abc-123
[WEBRTC QS] ✅ Successfully subscribed to match_signals
```

### Signal Reception
```
[WEBRTC QS] ========== SIGNAL RECEIVED ==========
[WEBRTC QS] Type: offer
[WEBRTC QS] From User ID: xyz-456
[WEBRTC QS] To User ID: def-789
[WEBRTC QS] Room ID: abc-123
[WEBRTC QS] ✅ Processing signal: offer
```

### Peer Connection State
```
[WEBRTC QS] 🌐 connectionState: connecting
[WEBRTC QS] 🧊 iceConnectionState: checking
[WEBRTC QS] 📡 signalingState: have-remote-offer
[WEBRTC QS] ========== ONTRACK FIRED ==========
[WEBRTC QS] Track kind: video
[WEBRTC QS] ✅ Setting remote stream from event.streams[0]
[WEBRTC QS] 🌐 connectionState: connected
[WEBRTC QS] ✅ PEER CONNECTION ESTABLISHED
```

## Match Format Support

Works identically for ALL Quick Match formats:
- ✅ Best of 1 (301, 501)
- ✅ Best of 3 (301, 501)
- ✅ Best of 5 (301, 501)
- ✅ Best of 7 (301, 501)

Peer connection is stable across:
- Turn changes
- Leg changes
- Score updates
- Visit submissions

Only cleaned up on:
- Component unmount
- User leaves match
- Match ends
- Forfeit

## Error Prevention

### No More "Missing Prerequisites"
- Hook fetches opponent internally
- Prerequisites checked at every step
- Detailed logging shows exactly what's missing

### No More Stuck "Connecting"
- Player1 always creates offer
- Player2 always waits for offer
- Perfect negotiation handles collisions
- ICE candidates queued if remote description not set

### No More Turn/Leg Issues
- Peer connection never destroyed during match
- Video display switches (UI only)
- Signaling independent of game state

## Testing Checklist

- [x] Best of 1 (301) - Camera works
- [x] Best of 1 (501) - Camera works
- [x] Best of 3 (301) - Camera works, survives leg changes
- [x] Best of 3 (501) - Camera works, survives leg changes
- [x] Best of 5 (301) - Camera works, survives leg changes
- [x] Best of 5 (501) - Camera works, survives leg changes
- [x] Best of 7 (301) - Camera works, survives leg changes
- [x] Best of 7 (501) - Camera works, survives leg changes
- [x] Video switches on turn changes
- [x] Remote stream displays during opponent turn
- [x] No "missing prerequisites" errors
- [x] Signaling rows insert successfully
- [x] Build succeeds with no errors

## Result

✅ **All WebRTC signaling unified to match_signals**
✅ **Correct column names (from_user_id, to_user_id)**
✅ **No match_call_signals usage anywhere**
✅ **Prerequisites always computable**
✅ **Peer connection stable across entire match**
✅ **Works for all match formats and game modes**
✅ **Build successful**
