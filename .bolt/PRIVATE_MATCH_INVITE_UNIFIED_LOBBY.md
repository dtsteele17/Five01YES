# Private Match Invite - Unified Lobby System

## Summary
Updated Private Match invite flow to ensure both inviter and invitee use the SAME `room_id` for WebRTC signaling and match state, eliminating any lobby ID confusion.

## Changes Made

### 1. Database Migration - Updated RPC Function
**File:** Migration `update_accept_private_match_invite_with_details`

**Updates to `rpc_accept_private_match_invite`:**
- Returns complete match details: `ok`, `room_id`, `game_mode`, `match_format`
- Both players receive the same `room_id` to use for the match
- Updates match_rooms status to 'active' when invite accepted
- Sends notification to inviter with match details including `room_id`

**Response Structure:**
```json
{
  "ok": true,
  "room_id": "uuid-here",
  "game_mode": 501,
  "match_format": "best-of-3"
}
```

**Notification to Inviter:**
```json
{
  "kind": "private_match_accepted",
  "room_id": "uuid-here",
  "game_mode": 501,
  "match_format": "best-of-3",
  "invite_id": "invite-uuid"
}
```

### 2. Updated NotificationDropdown Component
**File:** `components/app/NotificationDropdown.tsx`

**Invitee Side (Accept Button):**
- Calls `rpc_accept_private_match_invite(invite_id)`
- Validates response: checks `ok === true`
- Extracts `room_id`, `game_mode`, `match_format` from response
- Navigates to `/app/play/quick-match/match/${room_id}`
- Logs debug info when `DEBUG_INVITES = true`

**Debug Logging (Invitee):**
```
[INVITE] ========== JOINING PRIVATE MATCH ==========
[INVITE] room_id: <uuid>
[INVITE] game_mode: 501
[INVITE] match_format: best-of-3
[INVITE] user: <user_id>
[INVITE] Navigating to /app/play/quick-match/match/<room_id>
```

**Inviter Side (Automatic Join):**
- Added `useEffect` hook to listen for acceptance notifications
- Detects notifications with `kind: 'private_match_accepted'`
- Extracts `room_id` from notification data
- Automatically navigates to `/app/play/quick-match/match/${room_id}`
- Shows toast: "Your invite was accepted! Joining match..."

**Debug Logging (Inviter):**
```
[INVITE] ========== INVITE ACCEPTED (INVITER SIDE) ==========
[INVITE] room_id: <uuid>
[INVITE] game_mode: 501
[INVITE] match_format: best-of-3
[INVITE] Navigating to /app/play/quick-match/match/<room_id>
```

## Flow Diagram

### Before (Problematic)
```
Inviter creates match → room_id_1
Invitee accepts → might generate room_id_2
❌ Different room IDs = no signaling connection
```

### After (Fixed)
```
1. Inviter creates match → room_id
2. Inviter sends invite with room_id
3. Invitee accepts invite
4. RPC returns { ok: true, room_id, game_mode, match_format }
5. Invitee navigates to /app/play/quick-match/match/{room_id}
6. Inviter receives notification with room_id
7. Inviter auto-navigates to /app/play/quick-match/match/{room_id}
✅ Both players use SAME room_id for signaling
```

## Key Features

### 1. Unified Room ID
- Both players use the exact same `room_id` from `match_rooms` table
- No separate lobby generation
- WebRTC signaling uses `match_signals` table filtered by `room_id`
- Match state stored in `match_rooms` and `match_events` tables

### 2. Error Handling
- Validates RPC response structure
- Checks `ok === false` for logical errors
- Ensures `room_id` exists before navigation
- Clear error messages to user

### 3. Debug Logging
- Enabled via `DEBUG_INVITES = true` constant
- Logs all critical steps:
  - RPC calls and responses
  - Room ID extraction
  - Navigation URLs
- Easy to trace issues in development

### 4. Automatic Inviter Join
- Inviter doesn't need to manually join
- Notification system triggers automatic navigation
- Seamless user experience

## Testing Checklist

- [x] Build compiles successfully
- [x] TypeScript types are correct
- [x] RPC function returns correct structure
- [x] Invitee can accept invite and navigate
- [x] Inviter receives acceptance notification
- [x] Both players use same `room_id`
- [x] Debug logging shows correct flow
- [x] Error handling works for edge cases

## Files Modified

1. **Database Migration:** `update_accept_private_match_invite_with_details.sql`
   - Updated `rpc_accept_private_match_invite` function
   - Returns complete match details
   - Sends notification with `room_id` to inviter

2. **Component:** `components/app/NotificationDropdown.tsx`
   - Updated `handleAcceptInvite` to parse new response format
   - Added `isPrivateMatchAccepted` helper
   - Added `useEffect` hook for inviter auto-join
   - Enhanced debug logging

## Database Schema

**Tables Used:**
- `private_match_invites` - Stores invite records
- `match_rooms` - Stores match state and configuration
- `match_signals` - WebRTC signaling (filtered by `room_id`)
- `match_events` - Match history (filtered by `room_id`)
- `notifications` - User notifications

**Key Relationships:**
```
private_match_invites.room_id → match_rooms.id
match_signals.room_id → match_rooms.id
match_events.room_id → match_rooms.id
```

## WebRTC Signaling

Both players use the same `room_id` for signaling:

```typescript
// In useMatchWebRTC hook
subscribeSignals(roomId, myUserId, {
  onOffer: handleOffer,
  onAnswer: handleAnswer,
  onIce: handleIce,
  onState: handleState
});

sendSignal(roomId, myUserId, opponentUserId, 'offer', { offer });
```

**Signaling Flow:**
1. Both players subscribe to `match_signals` filtered by `room_id`
2. Player1 (determined by `match_rooms.player1_id`) creates offer
3. Player2 receives offer and sends answer
4. ICE candidates exchanged via same `room_id`
5. Peer connection established

## Future Improvements

Possible enhancements:
1. Add retry logic if navigation fails
2. Add timeout if inviter doesn't join
3. Show loading state while waiting for inviter
4. Add "remind inviter" button if they don't join
5. Add match preview before joining

## Related Documentation

- WebRTC ICE Configuration: `.bolt/WEBRTC_ICE_CONFIG_UNIFIED.md`
- Private Match System: `.bolt/PRIVATE_MATCH_INVITE_SYSTEM_COMPLETE.md`
- Match Signals: `supabase/migrations/20260131200055_create_match_signals_with_strict_routing.sql`
