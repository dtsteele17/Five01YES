# Private Match Invite Error Handling Improvements

## Overview

Enhanced error handling in the CreatePrivateMatch flow with detailed logging, specific error messages, and proper validation. Errors are no longer swallowed, and users receive clear feedback about what went wrong.

## Problems Addressed

### 1. Generic Error Messages

**Before:**
```typescript
if (inviteError) {
  console.error('Error creating invite:', inviteError);
  toast.error('Failed to create invite');
  return;
}
```

User sees: "Failed to create invite" (no details)
Developer sees: Limited error info in console

**After:**
```typescript
if (inviteError) {
  console.error('[INVITE] Supabase insert error:', {
    message: inviteError.message,
    details: inviteError.details,
    hint: inviteError.hint,
    code: inviteError.code,
    payload: invitePayload,
  });

  const errorMsg = inviteError.code
    ? `Failed to create invite (${inviteError.code}): ${inviteError.message}`
    : `Failed to create invite: ${inviteError.message}`;

  toast.error(errorMsg);
  setCreating(false);
  return;
}
```

User sees: "Failed to create invite (23505): duplicate key value violates unique constraint"
Developer sees: Full error object with message, details, hint, code, and the payload that caused the error

### 2. Missing Error Logging

**Before:**
- Only error message logged
- No context about what operation failed
- No details about the data involved

**After:**
- All errors prefixed with `[INVITE]` for easy filtering
- Full error object logged with all fields
- Payload logged when insert fails
- Stack traces logged for unexpected errors

### 3. Swallowed Errors

**Before:**
- Generic catch block hid specific errors
- Users saw "Failed to create match" for all errors
- Hard to debug production issues

**After:**
- Specific error messages for each operation
- Clear distinction between expected and unexpected errors
- All errors bubble up with context

### 4. Missing Validation

**Before:**
- Button could be clicked without friend selected
- No validation of required fields before insert
- Users had to wait for DB error

**After:**
- Button disabled when no friend or username provided
- Pre-insert validation of all required fields
- Immediate feedback to users

## Detailed Improvements

### A) Profile Loading Error Handling

```typescript
const { data: myProfile, error: profileError } = await supabase
  .from('profiles')
  .select('username')
  .eq('id', user.id)
  .maybeSingle();

if (profileError) {
  console.error('[INVITE] Error loading profile:', {
    message: profileError.message,
    details: profileError.details,
    hint: profileError.hint,
    code: profileError.code,
  });
  toast.error(`Failed to load profile: ${profileError.message}`);
  setCreating(false);
  return;
}
```

**Benefits:**
- User knows profile load failed (not generic error)
- Developer sees full error details
- Function stops early, doesn't attempt invite

### B) User Lookup Error Handling

```typescript
const { data: targetUser, error: userError } = await supabase
  .from('profiles')
  .select('id, username')
  .eq('username', username.trim())
  .maybeSingle();

if (userError) {
  console.error('[INVITE] Error looking up user:', {
    message: userError.message,
    details: userError.details,
    hint: userError.hint,
    code: userError.code,
  });
  const errorMsg = userError.code
    ? `Failed to find user (${userError.code}): ${userError.message}`
    : `Failed to find user: ${userError.message}`;
  toast.error(errorMsg);
  setCreating(false);
  return;
}
```

**Benefits:**
- Distinguishes between user not found and DB error
- Shows error code when available
- Clear error message to user

### C) Pre-Insert Validation

```typescript
// Validate all required fields before insert
const invitePayload = {
  room_id: roomId,
  from_user_id: user.id,
  to_user_id: inviteeId,
  status: 'pending' as const,
  options: matchOptions,
};

// Log payload for debugging
console.log('[INVITE] Creating invite with payload:', {
  room_id: invitePayload.room_id,
  from_user_id: invitePayload.from_user_id,
  to_user_id: invitePayload.to_user_id,
  status: invitePayload.status,
  options: invitePayload.options,
});

// Ensure all required fields are present
if (!invitePayload.room_id || !invitePayload.from_user_id || !invitePayload.to_user_id) {
  console.error('[INVITE] Missing required fields:', invitePayload);
  toast.error('Invalid invite data. Please try again.');
  setCreating(false);
  return;
}
```

**Benefits:**
- Catches invalid data before DB insert
- Logs payload for debugging
- Validates all required fields exist

### D) Insert Error Handling

```typescript
const { data: invite, error: inviteError } = await supabase
  .from('private_match_invites')
  .insert(invitePayload)
  .select()
  .single();

if (inviteError) {
  console.error('[INVITE] Supabase insert error:', {
    message: inviteError.message,
    details: inviteError.details,
    hint: inviteError.hint,
    code: inviteError.code,
    payload: invitePayload,
  });

  const errorMsg = inviteError.code
    ? `Failed to create invite (${inviteError.code}): ${inviteError.message}`
    : `Failed to create invite: ${inviteError.message}`;

  toast.error(errorMsg);
  setCreating(false);
  return;
}

if (!invite) {
  console.error('[INVITE] No invite returned after insert');
  toast.error('Failed to create invite: No data returned');
  setCreating(false);
  return;
}

console.log('[INVITE] Invite created successfully:', invite.id);
```

**Benefits:**
- Full error logging with all Supabase error fields
- Error message includes code when available
- Checks for missing return data
- Success logging for debugging

### E) Notification Error Handling

```typescript
const { error: notificationError } = await supabase
  .from('notifications')
  .insert({
    user_id: inviteeId,
    type: 'system',
    title: 'Private Match Invite',
    message: `${myUsername} has invited you to a private game`,
    data: {
      invite_id: invite.id,
      room_id: roomId,
      from_user_id: user.id,
      from_username: myUsername,
      match_options: matchOptions,
    },
  });

if (notificationError) {
  console.error('[INVITE] Failed to create notification:', {
    message: notificationError.message,
    details: notificationError.details,
    hint: notificationError.hint,
    code: notificationError.code,
  });
  // Don't block the flow if notification fails, but warn user
  toast.warning('Invite created but notification may not have been sent');
}
```

**Benefits:**
- Notification failure doesn't block invite
- User warned if notification fails
- Developer sees full error details
- Invite still succeeds

### F) Unexpected Error Handling

```typescript
} catch (error: any) {
  console.error('[INVITE] Unexpected error:', {
    message: error?.message,
    stack: error?.stack,
    error,
  });
  const errorMsg = error?.message || 'An unexpected error occurred';
  toast.error(`Failed to create match: ${errorMsg}`);
  setCreating(false);
}
```

**Benefits:**
- Catches all unexpected errors
- Logs stack trace for debugging
- Shows error message to user
- Resets creating state

### G) Button Validation

**Before:**
```tsx
<Button
  onClick={handleCreateOnlineMatch}
  disabled={creating}
  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
>
  {creating ? 'Creating Match...' : 'Create Online Match'}
</Button>
```

**After:**
```tsx
<Button
  onClick={handleCreateOnlineMatch}
  disabled={creating || (!selectedFriendId && !username.trim())}
  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white disabled:opacity-50"
>
  {creating ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Creating Match...
    </>
  ) : (
    'Create Online Match'
  )}
</Button>
```

**Benefits:**
- Button disabled when no friend or username
- Visual feedback (opacity-50) when disabled
- Prevents unnecessary function calls
- Clear UX feedback

## Error Message Examples

### Success Case
```
Console: [INVITE] Creating invite with payload: { room_id: "...", from_user_id: "...", to_user_id: "...", status: "pending", options: {...} }
Console: [INVITE] Invite created successfully: abc-123-def-456
Toast: Invite sent to username123
```

### User Not Found
```
Toast: User "invaliduser" not found
```

### Database Constraint Violation
```
Console: [INVITE] Supabase insert error: { message: "duplicate key value", details: "...", hint: "...", code: "23505", payload: {...} }
Toast: Failed to create invite (23505): duplicate key value violates unique constraint
```

### RLS Policy Violation
```
Console: [INVITE] Supabase insert error: { message: "new row violates row-level security policy", details: "...", hint: "...", code: "42501", payload: {...} }
Toast: Failed to create invite (42501): new row violates row-level security policy
```

### Network Error
```
Console: [INVITE] Unexpected error: { message: "Failed to fetch", stack: "...", error: {...} }
Toast: Failed to create match: Failed to fetch
```

### Missing Required Fields
```
Console: [INVITE] Missing required fields: { room_id: null, from_user_id: "...", to_user_id: "...", status: "pending", options: {...} }
Toast: Invalid invite data. Please try again.
```

### Notification Failure (Non-Blocking)
```
Console: [INVITE] Invite created successfully: abc-123-def-456
Console: [INVITE] Failed to create notification: { message: "...", details: "...", hint: "...", code: "..." }
Toast: Invite created but notification may not have been sent
```

## Required Invite Payload Fields

All invites **must** include:

```typescript
{
  room_id: string (UUID),          // Generated via crypto.randomUUID()
  from_user_id: string (UUID),     // Current user (auth.uid())
  to_user_id: string (UUID),       // Selected friend or looked up user
  status: 'pending',               // Always 'pending' on creation
  options: {
    gameMode: number,              // 301 or 501
    bestOf: number,                // 1, 3, 5, or 7
    doubleOut: boolean,            // Must double out
    straightIn: boolean            // Straight in or double in
  }
}
```

## Validation Flow

```
1. Check game mode (no Around the Clock)
2. Check friend selected OR username entered
3. Check user authenticated
4. Load user profile
   └─ Error? → Show "Failed to load profile: {message}"
5. If username entered:
   └─ Look up user
      ├─ Error? → Show "Failed to find user ({code}): {message}"
      ├─ Not found? → Show "User '{username}' not found"
      └─ Self? → Show "You can't invite yourself"
6. Final validation:
   ├─ No inviteeId? → Show "Please select a friend or enter a valid username"
   └─ Self? → Show "You can't invite yourself"
7. Generate room_id
8. Build options payload
9. Create invite payload
10. Validate payload has all required fields
    └─ Missing? → Show "Invalid invite data. Please try again."
11. Insert into private_match_invites
    ├─ Error? → Show "Failed to create invite ({code}): {message}"
    └─ No data? → Show "Failed to create invite: No data returned"
12. Create notification
    └─ Error? → Show warning "Invite created but notification may not have been sent"
13. Success!
    └─ Show "Invite sent to {username}"
```

## Debugging Tips

### Finding Invite Errors in Console

All invite-related logs are prefixed with `[INVITE]`:

```
Filter console by: [INVITE]
```

### Common Error Codes

- `23505` - Duplicate key (invite already exists)
- `42501` - RLS policy violation (not authorized)
- `23503` - Foreign key violation (invalid user_id)
- `PGRST116` - No rows returned (user not found)

### Checking Payload

Every insert logs the full payload before attempting:

```javascript
[INVITE] Creating invite with payload: { room_id: "...", from_user_id: "...", to_user_id: "...", status: "pending", options: {...} }
```

If insert fails, payload is logged again with error:

```javascript
[INVITE] Supabase insert error: { message: "...", details: "...", hint: "...", code: "...", payload: {...} }
```

## Testing Checklist

- [x] Error logging includes message, details, hint, code
- [x] User sees error message with code
- [x] Button disabled when no friend/username
- [x] Pre-insert validation catches missing fields
- [x] Profile load error handled
- [x] User lookup error handled
- [x] Insert error handled
- [x] Notification error handled (non-blocking)
- [x] Unexpected errors caught
- [x] Success case logs invite ID
- [x] All required fields validated
- [x] Self-invite blocked
- [x] Build succeeds

## Build Status

```
✓ Compiled successfully
/app/play → 20.2 kB (+400 bytes for error handling)
All routes built without errors
```

## Summary

The Private Match invite flow now has:

1. **Detailed Error Logging**
   - Full Supabase error objects logged
   - All operations prefixed with `[INVITE]`
   - Payload logged on insert failures
   - Stack traces for unexpected errors

2. **Specific Error Messages**
   - Users see actual error message from Supabase
   - Error codes included when available
   - Different messages for different failure types
   - Clear validation messages

3. **No Swallowed Errors**
   - All errors handled explicitly
   - Unexpected errors caught and logged
   - Users always get feedback
   - Developers have debug info

4. **Proper Validation**
   - Button disabled when invalid
   - Pre-insert field validation
   - Required fields checked
   - Self-invites blocked

5. **Graceful Degradation**
   - Notification failure doesn't block invite
   - User warned about partial failures
   - Process continues when possible

The invite system is now production-ready with comprehensive error handling and clear user feedback!
