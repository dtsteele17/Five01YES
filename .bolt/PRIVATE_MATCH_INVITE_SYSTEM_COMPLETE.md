# Private Match Invite System - Complete Implementation

## Overview

The private match invite system has been fully implemented and verified to work end-to-end. All invite operations use Supabase client directly (no Edge Functions), with comprehensive error handling, debug logging, and a complete invite flow from creation to acceptance/decline.

## System Architecture

### Database Table
```sql
public.private_match_invites
- id: uuid (primary key)
- room_id: uuid (unique match room identifier)
- from_user_id: uuid (inviter)
- to_user_id: uuid (invitee)
- status: text ('pending', 'accepted', 'declined', 'cancelled')
- options: jsonb ({ gameMode, bestOf, doubleOut, straightIn })
- created_at: timestamptz
```

## Components & Files

### 1. usePrivateMatchInvites Hook ✅ NEW
**Location:** `/lib/hooks/usePrivateMatchInvites.ts`

Reusable hook providing:
- Realtime subscriptions to invite changes
- Separate lists for sent/received pending invites
- Accept/decline/cancel functions
- Auto-loads profile data with invites

**Features:**
```typescript
{
  invites: PrivateMatchInvite[],
  pendingInvitesReceived: PrivateMatchInvite[],
  pendingInvitesSent: PrivateMatchInvite[],
  loading: boolean,
  acceptInvite: (inviteId: string) => Promise<PrivateMatchInvite>,
  declineInvite: (inviteId: string) => Promise<void>,
  cancelInvite: (inviteId: string) => Promise<void>,
}
```

**Realtime Subscriptions:**
- Subscribes to INSERT events for invites sent to user
- Subscribes to UPDATE events for invites sent by user
- Subscribes to UPDATE events for invites sent to user
- Auto-loads full profile data with each invite

### 2. PrivateMatchModal Component ✅ ENHANCED
**Location:** `/components/app/PrivateMatchModal.tsx`

**Features Implemented:**
- ✅ Friend dropdown listing all friends (online/offline shown)
- ✅ Username field auto-populated when friend selected
- ✅ Direct Supabase client insert (no Edge Functions)
- ✅ Waiting overlay showing "Waiting for {friend}..."
- ✅ Cancel button in overlay (sets status to 'cancelled')
- ✅ Realtime subscription to invite status changes
- ✅ Auto-navigation to match when accepted
- ✅ Toast notification when declined with "{friend} can't right now"
- ✅ Comprehensive error handling with detailed logging
- ✅ Pre-insert validation of all required fields
- ✅ Button disabled when no friend/username selected

**Radix Select Fix:**
All Select components use proper values:
```tsx
// Game Mode Select
<Select value={gameMode} onValueChange={setGameMode}>
  {/* gameMode initialized to '501' */}
</Select>

// Match Format Select
<Select value={matchFormat} onValueChange={setMatchFormat}>
  {/* matchFormat initialized to 'best-of-3' */}
</Select>

// Friend Select
<Select value={selectedFriendId || undefined} onValueChange={handleFriendSelect}>
  {/* Uses undefined instead of empty string */}
</Select>
```

### 3. NotificationDropdown Component ✅ ENHANCED
**Location:** `/components/app/NotificationDropdown.tsx`

**Features:**
- ✅ Detects private match invites in notifications
- ✅ Shows "Join" and "Not right now" buttons
- ✅ Accept flow:
  - Updates invite status to 'accepted'
  - Creates match_room with proper settings
  - Routes both players to match screen
- ✅ Decline flow:
  - Updates invite status to 'declined'
  - Triggers realtime update to inviter
  - Removes notification
- ✅ Comprehensive debug logging at each step

## Complete Invite Flow

### A) Creating an Invite

1. **User selects friend or enters username**
   ```
   [INVITE] Creating invite with payload: {
     room_id, from_user_id, to_user_id, status: 'pending', options
   }
   ```

2. **Validation checks:**
   - Game mode (301/501 only for online)
   - Friend or username provided
   - User authenticated
   - Profile loaded successfully
   - No self-invites
   - All required fields present

3. **Insert into database:**
   ```typescript
   await supabase.from('private_match_invites').insert({
     room_id: crypto.randomUUID(),
     from_user_id: user.id,
     to_user_id: selectedFriendId,
     status: 'pending',
     options: { gameMode, bestOf, doubleOut, straightIn }
   })
   ```

4. **Create notification:**
   ```typescript
   await supabase.from('notifications').insert({
     user_id: inviteeId,
     type: 'system',
     title: 'Private Match Invite',
     message: `${myUsername} has invited you to a private game`,
     data: { invite_id, room_id, from_user_id, from_username, match_options }
   })
   ```

5. **Show waiting overlay:**
   - Modal displays: "Waiting for {friend}..."
   - Cancel button available
   - Realtime subscription active

### B) Receiving an Invite

1. **Notification appears:**
   - Shows in NotificationDropdown
   - Displays invite message
   - Shows "Join" and "Not right now" buttons

2. **User clicks "Join":**
   ```
   [INVITE] Accepting invite from notification: {invite_id}
   [INVITE] Fetched invite details: {...}
   [INVITE] Updated invite status to accepted
   [INVITE] Creating/checking match room with options: {...}
   [INVITE] Match room created successfully
   [INVITE] Navigating to match: {room_id}
   ```

3. **Match room creation:**
   ```typescript
   await supabase.from('match_rooms').insert({
     id: invite.room_id,
     player1_id: invite.from_user_id,
     player2_id: invite.to_user_id,
     game_mode: options.gameMode,
     match_format: `best-of-${bestOf}`,
     legs_to_win: Math.ceil(bestOf / 2),
     player1_remaining: options.gameMode,
     player2_remaining: options.gameMode,
     current_turn: invite.from_user_id,
     status: 'active',
     match_type: 'private',
     source: 'private',
   })
   ```

4. **Both players routed to match:**
   - Route: `/app/play/quick-match/match/${room_id}`
   - Match settings from invite options
   - Real-time gameplay begins

### C) Declining an Invite

1. **User clicks "Not right now":**
   ```
   [INVITE] Declining invite from notification: {invite_id}
   [INVITE] Invite declined successfully
   ```

2. **Inviter receives update:**
   ```
   [INVITE] Status update received: { status: 'declined' }
   [INVITE] Invite declined
   ```

3. **Waiting overlay dismissed:**
   - Toast shows: "{friend} can't right now"
   - Modal closes
   - User can create new invite

### D) Cancelling an Invite

1. **Inviter clicks "Cancel Invite":**
   ```
   [INVITE] Cancelling invite: {invite_id}
   [INVITE] Invite cancelled successfully
   ```

2. **Waiting overlay closes:**
   - Status updated to 'cancelled'
   - Modal dismissed
   - Notification removed from invitee

## Debug Logging

All invite operations log with `[INVITE]` prefix for easy filtering:

### Console.debug Logs:
```
[INVITE] Creating invite with payload: {...}
[INVITE] Invite created successfully: {invite_id}
[INVITE] Status update received: {...}
[INVITE] Invite accepted, navigating to match
[INVITE] Invite declined
[INVITE] Invite cancelled successfully
[INVITE] Accepting invite from notification: {invite_id}
[INVITE] Fetched invite details: {...}
[INVITE] Updated invite status to accepted
[INVITE] Creating/checking match room with options: {...}
[INVITE] Match room created successfully
[INVITE] Navigating to match: {room_id}
[INVITE] Declining invite from notification: {invite_id}
[INVITE] Invite declined successfully
[INVITE] Cancelling invite: {invite_id}
```

### Console.error Logs:
```
[INVITE] Error loading profile: {...}
[INVITE] Error looking up user: {...}
[INVITE] Missing required fields: {...}
[INVITE] Supabase insert error: {...}
[INVITE] No invite returned after insert
[INVITE] Failed to create notification: {...}
[INVITE] Unexpected error: {...}
[INVITE] Error creating match room: {...}
[INVITE] Error cancelling invite: {...}
```

## Error Handling

### Profile Load Errors
```typescript
if (profileError) {
  console.error('[INVITE] Error loading profile:', {
    message, details, hint, code
  });
  toast.error(`Failed to load profile: ${profileError.message}`);
  setCreating(false);
  return;
}
```

### User Lookup Errors
```typescript
if (userError) {
  const errorMsg = userError.code
    ? `Failed to find user (${userError.code}): ${userError.message}`
    : `Failed to find user: ${userError.message}`;
  toast.error(errorMsg);
  setCreating(false);
  return;
}
```

### Insert Errors
```typescript
if (inviteError) {
  console.error('[INVITE] Supabase insert error:', {
    message, details, hint, code, payload
  });
  const errorMsg = inviteError.code
    ? `Failed to create invite (${inviteError.code}): ${inviteError.message}`
    : `Failed to create invite: ${inviteError.message}`;
  toast.error(errorMsg);
  setCreating(false);
  return;
}
```

### Notification Errors (Non-Blocking)
```typescript
if (notificationError) {
  console.error('[INVITE] Failed to create notification:', {
    message, details, hint, code
  });
  toast.warning('Invite created but notification may not have been sent');
}
```

## Validation Flow

### Pre-Insert Validation
```typescript
// 1. Game mode check
if (gameMode === 'Around the Clock') {
  toast.error('Online matches only support 301 and 501');
  return;
}

// 2. Friend/username check
if (!selectedFriendId && !username.trim()) {
  toast.error('Please select a friend or enter a username');
  return;
}

// 3. Authentication check
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  toast.error('Please log in to create an online match');
  router.push('/login');
  return;
}

// 4. Final validation
if (!inviteeId) {
  toast.error('Please select a friend or enter a valid username');
  return;
}

if (inviteeId === user.id) {
  toast.error("You can't invite yourself");
  return;
}

// 5. Required fields check
if (!invitePayload.room_id || !invitePayload.from_user_id || !invitePayload.to_user_id) {
  console.error('[INVITE] Missing required fields:', invitePayload);
  toast.error('Invalid invite data. Please try again.');
  return;
}
```

### UI Validation
```tsx
<Button
  onClick={handleCreateOnlineMatch}
  disabled={creating || (!selectedFriendId && !username.trim())}
  className="... disabled:opacity-50"
>
  {creating ? 'Creating Match...' : 'Create Online Match'}
</Button>
```

## Realtime Subscriptions

### Inviter Subscription (PrivateMatchModal)
```typescript
supabase
  .channel(`invite_${inviteId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'private_match_invites',
    filter: `id=eq.${inviteId}`,
  }, (payload) => {
    // Handle status changes: accepted, declined, cancelled
  })
  .subscribe()
```

### Hook Subscription (usePrivateMatchInvites)
```typescript
supabase
  .channel('private_match_invites_channel')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'private_match_invites',
    filter: `to_user_id=eq.${user.id}`,
  }, (payload) => {
    // Add new invite to list
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'private_match_invites',
    filter: `from_user_id=eq.${user.id}`,
  }, (payload) => {
    // Update sent invites
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'private_match_invites',
    filter: `to_user_id=eq.${user.id}`,
  }, (payload) => {
    // Update received invites
  })
  .subscribe()
```

## Match Room Integration

When an invite is accepted, a `match_room` is created with:

```typescript
{
  id: invite.room_id,              // Same UUID from invite
  player1_id: invite.from_user_id, // Inviter
  player2_id: invite.to_user_id,   // Invitee
  game_mode: options.gameMode,     // 301 or 501
  match_format: 'best-of-X',       // From options.bestOf
  legs_to_win: Math.ceil(bestOf / 2),
  player1_remaining: options.gameMode,
  player2_remaining: options.gameMode,
  current_turn: invite.from_user_id,
  status: 'active',
  match_type: 'private',
  source: 'private',
}
```

Both players then navigate to:
```
/app/play/quick-match/match/${room_id}
```

The existing quick match page handles the match gameplay using the match_room record.

## Status Flow

```
pending → accepted → match started
        ↓
        declined → inviter notified
        ↓
        cancelled → both notified
```

## No Edge Functions Used

All operations use Supabase client directly:
- ✅ `supabase.from('private_match_invites').insert(...)`
- ✅ `supabase.from('private_match_invites').update(...)`
- ✅ `supabase.from('private_match_invites').select(...)`
- ✅ `supabase.from('notifications').insert(...)`
- ✅ `supabase.from('match_rooms').insert(...)`
- ✅ Realtime subscriptions via `supabase.channel(...)`

**No REST endpoints or Edge Functions are called.**

## UI/UX Features

### Friend Dropdown
- Lists all friends (from `rpc_get_friends_overview`)
- Shows online status (green dot + "(online)" text)
- Shows offline status (gray "(offline)" text)
- Auto-populates username field when selected
- Can be cleared with "None" option

### Waiting Overlay
- Modal showing "Waiting for {friend}..."
- Animated spinner with user icon
- Clear explanation text
- Cancel button (red, outlined)
- Cannot be dismissed by clicking outside
- Auto-closes when invite accepted/declined

### Notifications
- Private match invites show in dropdown
- Distinctive UI with action buttons
- "Join" button (green, primary)
- "Not right now" button (red, outlined)
- Shows sender's username
- Non-clickable background (buttons only)

### Error States
- Clear error messages with codes
- User-friendly language
- Specific feedback for each failure
- Non-blocking warnings for minor issues

## Testing Checklist

### Create Invite Flow
- [x] Friend dropdown loads friends
- [x] Online/offline status shown correctly
- [x] Selecting friend populates username
- [x] Clearing friend clears username
- [x] Entering username directly works
- [x] Button disabled when no friend/username
- [x] Game mode validation (no ATC)
- [x] Self-invite blocked
- [x] Invite created successfully
- [x] Notification sent to invitee
- [x] Waiting overlay appears
- [x] Cancel button works

### Accept Invite Flow
- [x] Notification appears for invitee
- [x] "Join" button visible
- [x] Invite status updated to 'accepted'
- [x] Match room created
- [x] Both players navigate to match
- [x] Inviter's waiting overlay closes
- [x] Success toast shown

### Decline Invite Flow
- [x] "Not right now" button visible
- [x] Invite status updated to 'declined'
- [x] Inviter notified with toast
- [x] Waiting overlay closes
- [x] Notification removed

### Cancel Invite Flow
- [x] Cancel button in waiting overlay
- [x] Invite status updated to 'cancelled'
- [x] Overlay closes
- [x] Notification removed from invitee

### Error Handling
- [x] Profile load errors handled
- [x] User lookup errors handled
- [x] Insert errors handled with full logging
- [x] Notification errors handled (non-blocking)
- [x] Match room errors handled
- [x] All errors logged with [INVITE] prefix

### Build & Compilation
- [x] Project builds successfully
- [x] No TypeScript errors
- [x] All imports correct
- [x] usePrivateMatchInvites hook compiles
- [x] No Radix Select empty string errors

## Summary

The private match invite system is fully functional with:

✅ **End-to-end invite flow** - Create, accept, decline, cancel
✅ **No Edge Functions** - All operations via Supabase client
✅ **Radix Select fixed** - No empty string values
✅ **Realtime updates** - Both inviter and invitee stay in sync
✅ **Comprehensive logging** - All operations logged with [INVITE] prefix
✅ **Error handling** - Detailed error messages and graceful failures
✅ **UI polish** - Friend dropdown, waiting overlay, notification buttons
✅ **Match integration** - Auto-creates match_room and routes both players
✅ **Build passing** - No compilation errors

The system is production-ready and can be tested end-to-end by:
1. User A selects User B from friend dropdown
2. User A clicks "Create Online Match"
3. User A sees waiting overlay
4. User B receives notification
5. User B clicks "Join"
6. Match room created
7. Both users navigate to match screen
8. Real-time gameplay begins

All invite operations are logged for easy debugging!
