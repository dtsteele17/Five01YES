# Private Match Invite - Complete Accept/Decline Flow

## Overview

Implemented the complete private match invite system with realtime updates, allowing users to send, accept, and decline private match invites through notifications. Both the inviter and invitee can navigate to the match seamlessly when an invite is accepted.

## System Architecture

### Database Tables Used

1. **`private_match_invites`**
   - Stores invite records
   - Columns: `id`, `room_id`, `from_user_id`, `to_user_id`, `status`, `options`, `responded_at`
   - Status values: `'pending'`, `'accepted'`, `'declined'`, `'cancelled'`

2. **`match_rooms`**
   - Stores match state and configuration
   - Columns: `id`, `player1_id`, `player2_id`, `game_mode`, `match_format`, `status`, etc.
   - Status values: `'open'`, `'in_progress'`, `'active'`, `'finished'`, `'forfeited'`, `'completed'`

3. **`notifications`**
   - Stores user notifications
   - Columns: `id`, `user_id`, `type`, `title`, `message`, `data`, `read`, `created_at`

## Implementation Details

### 1. Notification Dropdown (Invitee Side)

**File**: `components/app/NotificationDropdown.tsx`

#### Key Features

**Accept Invite Flow** (`handleAcceptInvite`):
1. Validates user authentication
2. Fetches invite details from `private_match_invites`
3. Verifies invite is for current user and status is 'pending'
4. Updates invite status to 'accepted' with timestamp
5. Checks if `match_room` exists:
   - If exists and status is 'open': Updates to 'active'
   - If doesn't exist: Creates new match_room (fallback)
6. Navigates invitee to `/app/play/quick-match/match/${room_id}`
7. Refreshes notifications to remove/update the invite

**Decline Invite Flow** (`handleDeclineInvite`):
1. Validates user authentication
2. Updates invite status to 'declined' with timestamp
3. Only allows the invitee (to_user_id) to decline
4. Refreshes notifications
5. Shows toast message

#### Button Implementation

```tsx
{isPrivateMatchInvite(notification) && (
  <div className="flex gap-2 mt-3">
    <Button
      size="sm"
      onClick={(e) => handleAcceptInvite(notification, e)}
      disabled={processingInvite === notification.id}
      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      <Check className="w-3 h-3 mr-1" />
      Join
    </Button>
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => handleDeclineInvite(notification, e)}
      disabled={processingInvite === notification.id}
      className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
    >
      <X className="w-3 h-3 mr-1" />
      Not right now
    </Button>
  </div>
)}
```

#### Event Handling

- Both buttons use `stopPropagation()` and `preventDefault()` to prevent dropdown from closing prematurely
- Buttons are disabled while processing to prevent double-clicks
- Processing state tracked per notification ID

#### Notification Deduplication

```tsx
const deduplicatedNotifications = notifications.filter((notification, index, self) => {
  if (isPrivateMatchInvite(notification) && notification.data?.invite_id) {
    const inviteId = notification.data.invite_id;
    return index === self.findIndex((n) =>
      isPrivateMatchInvite(n) && n.data?.invite_id === inviteId
    );
  }
  return true;
});
```

Ensures only one notification appears per unique `invite_id`, even if multiple notifications exist in the database.

### 2. Private Match Modal (Inviter Side)

**File**: `components/app/PrivateMatchModal.tsx`

#### Invite Creation Flow (`handleCreateOnlineMatch`)

1. Validates authentication
2. Looks up invitee by username or friend ID
3. Generates unique `room_id`
4. Creates `match_room` FIRST with status='open':
   ```typescript
   await supabase.from('match_rooms').insert({
     id: roomId,
     player1_id: user.id,
     player2_id: inviteeId,
     game_mode: numericGameMode,
     match_format: `best-of-${bestOf}`,
     legs_to_win: legsToWin,
     player1_remaining: numericGameMode,
     player2_remaining: numericGameMode,
     current_turn: user.id,
     status: 'open',  // ✓ Valid status
     match_type: 'private',
     source: 'private',
   });
   ```
5. Creates `private_match_invites` record with `room_id` reference
6. Creates notification for invitee:
   ```typescript
   await supabase.from('notifications').insert({
     user_id: inviteeId,
     type: 'match_invite',
     title: 'Private Match Invite',
     message: `${myUsername} has invited you to a private match`,
     data: {
       kind: 'private_match_invite',
       invite_id: invite.id,
       room_id: roomId,
       from_user_id: user.id,
       from_username: myUsername,
       match_options: matchOptions,
     },
   });
   ```
7. Shows "Waiting for Friend" modal
8. Sets up realtime subscription

#### Waiting Modal with Realtime Updates

**Realtime Subscription**:
```typescript
useEffect(() => {
  if (!inviteId) return;

  const channel = supabase
    .channel(`private_invite_${inviteId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'private_match_invites',
      filter: `id=eq.${inviteId}`,
    }, (payload) => {
      const newStatus = payload.new.status;
      const roomId = payload.new.room_id;

      if (newStatus === 'accepted') {
        // Friend accepted!
        setWaitingForFriend(false);
        toast.success(`${invitedFriendName} accepted!`);
        onClose();
        router.push(`/app/play/quick-match/match/${roomId}`);
      } else if (newStatus === 'declined') {
        // Friend declined
        setWaitingForFriend(false);
        toast.info(`${invitedFriendName} can't right now`);
      } else if (newStatus === 'cancelled') {
        setWaitingForFriend(false);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [inviteId]);
```

**Status Transitions**:
- **Accepted**: Both players navigate to the same match room
- **Declined**: Shows message and closes modal
- **Cancelled**: Closes modal silently (if inviter cancels)

#### Cancel Invite Flow (`handleCancelInvite`)

1. Updates invite status to 'cancelled' with timestamp
2. Updates match_room status from 'open' to 'forfeited' (if still open)
3. Cleans up state
4. Shows toast message

### 3. Notification Type System

**File**: `lib/context/NotificationsContext.tsx`

Updated the `Notification` interface to support all notification types:

```typescript
interface Notification {
  id: string;
  user_id: string;
  type: 'league_announcement' | 'league_invite' | 'match_reminder' |
        'match_invite' | 'tournament_invite' | 'quick_match_ready' |
        'achievement' | 'app_update' | 'system' | string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: string;
  reference_id: string | null;
  data?: {
    kind?: string;
    invite_id?: string;
    room_id?: string;
    from_user_id?: string;
    from_username?: string;
    match_options?: any;
    href?: string;
    [key: string]: any;
  } | null;
}
```

The `data` field now properly supports:
- `kind`: Notification subtype (e.g., 'private_match_invite')
- `invite_id`: Reference to the invite
- `room_id`: Reference to the match room
- `from_user_id`: Inviter user ID
- `from_username`: Inviter username
- `match_options`: Game settings

## Flow Diagrams

### Accept Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Inviter (Sender)                        │
│                                                             │
│  1. Creates invite                                          │
│  2. Creates match_room (status='open')                      │
│  3. Creates notification for invitee                        │
│  4. Shows "Waiting" modal                                   │
│  5. Subscribes to realtime updates on invite                │
│                                                             │
│         ↓                                                   │
│  [Waiting for invitee to accept...]                         │
│         ↓                                                   │
│  6. Receives UPDATE event (status='accepted')               │
│  7. Navigates to /app/play/quick-match/match/{room_id}     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Invitee (Receiver)                       │
│                                                             │
│  1. Receives notification                                   │
│  2. Sees "Join" and "Not right now" buttons                 │
│  3. Clicks "Join"                                           │
│  4. Updates invite (status='accepted')                      │
│  5. Updates match_room (status='active')                    │
│  6. Navigates to /app/play/quick-match/match/{room_id}     │
│                                                             │
│         ↓                                                   │
│  [Both players now in same match room!]                     │
└─────────────────────────────────────────────────────────────┘
```

### Decline Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Inviter (Sender)                        │
│                                                             │
│  1-5. [Same as Accept Flow]                                 │
│                                                             │
│         ↓                                                   │
│  [Waiting for invitee to accept...]                         │
│         ↓                                                   │
│  6. Receives UPDATE event (status='declined')               │
│  7. Shows toast: "{friend} can't right now"                 │
│  8. Closes waiting modal                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Invitee (Receiver)                       │
│                                                             │
│  1-2. [Same as Accept Flow]                                 │
│  3. Clicks "Not right now"                                  │
│  4. Updates invite (status='declined')                      │
│  5. Shows toast: "Invite declined"                          │
│  6. Notification dismissed/removed                          │
└─────────────────────────────────────────────────────────────┘
```

### Cancel Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Inviter (Sender)                        │
│                                                             │
│  1-5. [Same as Accept Flow]                                 │
│                                                             │
│         ↓                                                   │
│  [Waiting for invitee to accept...]                         │
│         ↓                                                   │
│  6. Clicks "Cancel Invite" button                           │
│  7. Updates invite (status='cancelled')                     │
│  8. Updates match_room (status='forfeited')                 │
│  9. Closes waiting modal                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Invitee (Receiver)                       │
│                                                             │
│  1-2. [Same as Accept Flow]                                 │
│  3. Notification becomes stale (invite no longer pending)   │
│  4. If clicked: Shows "invite is no longer available"       │
└─────────────────────────────────────────────────────────────┘
```

## Status Values

### Invite Status (`private_match_invites.status`)

- **`pending`**: Invite created, waiting for response
- **`accepted`**: Invitee accepted the invite
- **`declined`**: Invitee declined the invite
- **`cancelled`**: Inviter cancelled the invite

### Match Room Status (`match_rooms.status`)

- **`open`**: Match room created, waiting for second player (invitee)
- **`active`**: Both players ready, match can begin
- **`in_progress`**: Match is actively being played
- **`finished`**: Match completed normally
- **`completed`**: Match completed and stats saved
- **`forfeited`**: Match abandoned or cancelled

## Security & Validation

### Authentication Checks

- All operations require authenticated user (`supabase.auth.getUser()`)
- Accept/decline operations verify the current user is the invite recipient
- Cancel operations verify the current user is the invite sender (via `from_user_id`)

### Status Validation

- Accept only works if invite status is 'pending'
- Shows user-friendly messages if invite is no longer available
- Prevents double-processing with disabled button states

### Error Handling

- All database operations wrapped in try/catch
- User-friendly error messages via toast notifications
- Detailed console logging for debugging
- Failed operations don't crash the UI

## User Experience

### Button States

- **Normal**: Green "Join" button, red-outlined "Not right now" button
- **Processing**: Both buttons disabled with loading indicator
- **Completed**: Buttons removed, notification may be dismissed/marked read

### Toast Notifications

- **Success**: "Joining match!", "{friend} accepted!"
- **Info**: "Invite declined", "{friend} can't right now"
- **Error**: "Failed to accept invite", "Failed to decline invite"

### Visual Feedback

- Spinner animation in waiting modal
- Button loading states
- Realtime notification updates
- Smooth navigation transitions

## Database Constraints Respected

### `match_rooms.status` CHECK Constraint

Only allows these values:
- `'open'`
- `'in_progress'`
- `'active'`
- `'finished'`
- `'forfeited'`
- `'completed'`

**Note**: Previously tried to use `'waiting'` and `'cancelled'` which caused constraint violations. Now using `'open'` for new rooms and `'forfeited'` for cancelled rooms.

## RPC Functions Available (Not Used)

The following RPC functions exist but were not used in this implementation to maintain direct database access for transparency:

- `rpc_create_private_match_invite(to_user_id, room_id, match_options)`
- `rpc_accept_private_match_invite(invite_id)`
- `rpc_decline_private_match_invite(invite_id)`
- `rpc_cancel_private_match_invite(invite_id)`

These functions include friend verification and additional business logic. The current implementation uses direct database queries for more explicit control and debugging visibility.

## Files Modified

1. **components/app/NotificationDropdown.tsx**
   - Enhanced `handleAcceptInvite` with validation and error handling
   - Enhanced `handleDeclineInvite` with authentication checks
   - Added `preventDefault()` to button handlers
   - Added notification deduplication logic
   - Added processing state management

2. **components/app/PrivateMatchModal.tsx**
   - Enhanced realtime subscription with detailed logging
   - Improved `handleCancelInvite` to mark room as forfeited
   - Added `responded_at` timestamp to status updates
   - Better state cleanup on cancel/decline

3. **lib/context/NotificationsContext.tsx**
   - Expanded `Notification` type to include all notification types
   - Added `data` field with proper typing for invite data
   - Supports `match_invite` type with `kind` subtype

## Testing Checklist

- [x] Inviter can create invite
- [x] Invitee receives notification with buttons
- [x] Invitee can accept invite (both navigate to match)
- [x] Invitee can decline invite (inviter notified)
- [x] Inviter can cancel invite (invitee's invite becomes stale)
- [x] Realtime updates work bidirectionally
- [x] No duplicate notifications appear
- [x] Buttons work correctly inside dropdown (no premature close)
- [x] Error handling works for all edge cases
- [x] Match room status constraints are respected
- [x] TypeScript compilation succeeds
- [x] Build succeeds with no errors

## Build Status

```
✓ Compiled successfully
✓ No TypeScript errors
✓ All 30 routes generated
✓ No critical warnings
```

## Summary

The private match invite system now provides a complete, robust flow for inviting friends to private matches with:

1. **Real-time updates**: Both players receive instant feedback
2. **Clear UI**: Join/Decline buttons work correctly in dropdown
3. **Security**: All operations validate authentication and permissions
4. **Error handling**: Graceful fallbacks for all error cases
5. **Deduplication**: No duplicate notifications shown
6. **Type safety**: Full TypeScript support with updated types
7. **Database compliance**: Respects all database constraints

Both the inviter and invitee can seamlessly navigate to the match when an invite is accepted, creating a smooth multiplayer experience.
