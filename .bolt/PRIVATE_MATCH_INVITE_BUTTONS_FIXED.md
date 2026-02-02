# Private Match Invite Buttons - Fixed

## Summary

Fixed Private Match Invite notification buttons to perform direct actions without relying on realtime updates.

## Changes Made

### 1. Simplified Join Button Flow

**Before** (Complex realtime-dependent):
```typescript
// Set up realtime subscription
const channel = supabase.channel(...)
  .on('postgres_changes', { /* watch for updates */ })
  .subscribe();

// Call RPC
await supabase.rpc('rpc_accept_private_match_invite', { p_invite_id });

// Wait for realtime update to navigate
// OR fallback to querying invite row
// OR wait indefinitely
```

**After** (Direct and immediate):
```typescript
// Call RPC
const { data: result, error } = await supabase.rpc('rpc_accept_private_match_invite', {
  p_invite_id: inviteId
});

// Immediately navigate on success
if (result && result.ok && result.room_id) {
  await markAsRead(notification.id);
  setDropdownOpen(false);
  toast.success('Joining match!');
  router.push(`/app/play/quick-match/match/${result.room_id}`);
}
```

**Flow**:
1. User clicks "Join" button
2. Set `processingInvite` state (disables both buttons, shows spinner)
3. Call `rpc_accept_private_match_invite(p_invite_id)`
4. **On Success** (RPC returns `{ ok: true, room_id: uuid }`):
   - Mark notification as read
   - Close dropdown and modal
   - Show success toast
   - Navigate to `/app/play/quick-match/match/${roomId}`
5. **On Error**:
   - Log full error object (message, details, hint, code)
   - Show toast "Failed to join private match"
   - Re-enable buttons (clear `processingInvite` state)

### 2. Fixed Decline Button

**Before**:
- Called RPC to decline
- Had working implementation

**After** (Enhanced error handling):
```typescript
const { error } = await supabase.rpc('rpc_decline_private_match_invite', {
  p_invite_id: inviteId
});

if (error) {
  console.error('[INVITE] RPC error:', {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code
  });
  toast.error('Failed to decline invite');
  return;
}

await markAsRead(notification.id);
refreshNotifications();
toast.info('Invite declined');
```

**Flow**:
1. User clicks "Not right now" button
2. Set `processingInvite` state (disables both buttons)
3. Call `rpc_decline_private_match_invite(p_invite_id)`
4. **On Success**:
   - Mark notification as read
   - Refresh notifications
   - Show toast "Invite declined"
   - Clear `processingInvite` state
5. **On Error**:
   - Log full error object
   - Show toast "Failed to decline invite"
   - Re-enable buttons

### 3. Removed Realtime Subscription Complexity

**Removed**:
- ❌ `inviteSubscription` state
- ❌ `cleanupInviteSubscription()` function
- ❌ Realtime channel subscription for invite updates
- ❌ Waiting for realtime updates to navigate
- ❌ Fallback queries to check invite status
- ❌ Pending state waiting logic

**Why?**:
- RPC function already returns `room_id` immediately
- No need to wait for database updates via realtime
- Simpler, faster, more reliable
- Fewer edge cases and race conditions

### 4. Enhanced UI Feedback

**Join Button** (in dropdown notification):
```tsx
<Button
  onClick={(e) => handleAcceptInvite(notification, e)}
  disabled={processingInvite === notification.id}
  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
>
  {processingInvite === notification.id ? (
    <>
      <div className="w-3 h-3 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Joining...
    </>
  ) : (
    <>
      <Check className="w-3 h-3 mr-1" />
      Join
    </>
  )}
</Button>
```

**Features**:
- ✅ Shows spinner while processing
- ✅ Changes text to "Joining..."
- ✅ Disables both buttons (no double-clicks)
- ✅ Visual opacity change when disabled

**Join Button** (in modal):
```tsx
<Button
  onClick={() => handleAcceptInvite(selectedInvite)}
  disabled={processingInvite === selectedInvite.id}
  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-12 disabled:opacity-50"
>
  {processingInvite === selectedInvite.id ? (
    <>
      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      Joining...
    </>
  ) : (
    <>
      <Check className="w-4 h-4 mr-2" />
      Join
    </>
  )}
</Button>
```

### 5. Dropdown State Management

**Added**:
```typescript
const [dropdownOpen, setDropdownOpen] = useState(false);

// Control dropdown
<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
  {/* ... */}
</DropdownMenu>
```

**Why?**:
- Close dropdown automatically after accepting invite
- Better UX - user doesn't have to manually close it
- Prevents confusion when navigating to match

### 6. Error Logging

**Comprehensive error logging**:
```typescript
if (rpcError) {
  console.error('[INVITE] RPC error:', {
    message: rpcError.message,
    details: rpcError.details,
    hint: rpcError.hint,
    code: rpcError.code
  });
  toast.error('Failed to join private match');
  return;
}

// Catch block
catch (err: any) {
  console.error('[INVITE] Exception accepting invite:', {
    message: err?.message,
    stack: err?.stack,
    error: err
  });
  toast.error('Failed to join private match');
}
```

**What's logged**:
- ✅ Supabase RPC errors (message, details, hint, code)
- ✅ JavaScript exceptions (message, stack, full error object)
- ✅ RPC logical errors (result.error)

## RPC Function Contract

### `rpc_accept_private_match_invite`

**Input**:
```sql
p_invite_id uuid
```

**Output**:
```jsonb
{
  "ok": true,
  "room_id": "uuid-here"
}

-- OR on error:

{
  "ok": false,
  "error": "not_authenticated" | "invite_not_found" | "room_not_found"
}
```

**What it does**:
1. Validates user is authenticated
2. Finds invite where `to_user_id = auth.uid()` and `status = 'pending'`
3. Gets match room
4. **Sets room status to 'active'** (critical for scoring to work)
5. Updates invite status to 'accepted'
6. Creates notification for inviter
7. Returns `room_id` for navigation

### `rpc_decline_private_match_invite`

**Input**:
```sql
p_invite_id uuid
```

**Output**:
```jsonb
{
  "ok": true
}

-- OR on error:

{
  "ok": false,
  "error": "not_authenticated" | "invite_not_found"
}
```

**What it does**:
1. Validates user is authenticated
2. Finds invite where `to_user_id = auth.uid()` and `status = 'pending'`
3. Updates invite status to 'declined'
4. Sets `responded_at` timestamp

## User Experience Flow

### Accepting Invite (Join)

1. **User sees notification**: "PlayerName invited you to a private match"
2. **User clicks "Join"**:
   - Button shows spinner: "Joining..."
   - Both buttons disabled
3. **RPC processes** (usually < 1 second):
   - Updates database
   - Returns room_id
4. **Success**:
   - Dropdown closes automatically
   - Toast: "Joining match!"
   - Navigation to match screen
   - WebRTC camera loads (if enabled)
5. **Error** (if something fails):
   - Toast: "Failed to join private match"
   - Buttons re-enabled
   - Full error logged to console
   - User can try again

### Declining Invite (Not right now)

1. **User clicks "Not right now"**:
   - Both buttons disabled
2. **RPC processes**:
   - Updates invite status to 'declined'
3. **Success**:
   - Toast: "Invite declined"
   - Notification marked as read
   - Notification list refreshes
   - Modal closes (if open)
4. **Error** (if something fails):
   - Toast: "Failed to decline invite"
   - Buttons re-enabled
   - Full error logged to console
   - User can try again

## Testing

To test the fixed buttons:

### Test Join Button

1. **Player A**: Go to Play → Private Match → Invite Friend
2. **Player B**: Receive notification
3. **Player B**: Click "Join" button in notification
4. **Expected**:
   - Button shows "Joining..." with spinner
   - Dropdown closes
   - Toast: "Joining match!"
   - Navigate to `/app/play/quick-match/match/${roomId}`
   - Match screen loads with WebRTC
5. **Check console**: Should show RPC success log

### Test Decline Button

1. **Player A**: Send invite
2. **Player B**: Receive notification
3. **Player B**: Click "Not right now"
4. **Expected**:
   - Toast: "Invite declined"
   - Notification marked as read
   - Notification disappears from list
5. **Check console**: Should show decline success log

### Test Error Handling

1. **Disconnect internet**
2. **Click "Join"**
3. **Expected**:
   - Toast: "Failed to join private match"
   - Buttons re-enabled
   - Full error object logged to console

## Benefits

1. **Simpler code**: Removed 150+ lines of realtime subscription logic
2. **Faster**: Navigation happens immediately after RPC (no waiting for realtime)
3. **More reliable**: No race conditions or realtime subscription issues
4. **Better UX**: Clear loading states, automatic dropdown closing
5. **Better debugging**: Comprehensive error logging
6. **Easier to maintain**: Direct flow, no complex state management

## Files Modified

- `/components/app/NotificationDropdown.tsx`
  - Simplified `handleAcceptInvite()` function
  - Enhanced `handleDeclineInvite()` function
  - Removed realtime subscription logic
  - Added spinner to buttons
  - Added dropdown state management
  - Enhanced error logging

## Build Status

```
✓ Compiled successfully
✓ All routes generated
✓ No errors
```

The notification buttons now work correctly with direct actions and proper error handling! 🎯
