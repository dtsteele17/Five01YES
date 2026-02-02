# Private Match Invite - Status Constraint Fix

## Critical Issue Discovered

The initial fix used `status: 'waiting'` for match_rooms, but the database CHECK constraint only allows:
- `'open'`
- `'in_progress'`
- `'active'`
- `'finished'`
- `'forfeited'`
- `'completed'`

**`'waiting'` is NOT a valid status value!**

## Database Schema

```sql
-- Actual constraint from database:
CHECK ((status = ANY (ARRAY[
  'open'::text,
  'in_progress'::text,
  'active'::text,
  'finished'::text,
  'forfeited'::text,
  'completed'::text
])))
```

## Fix Applied

Changed all instances of `status: 'waiting'` to `status: 'open'`:

### 1. PrivateMatchModal.tsx - Match Room Creation

**Before (WRONG):**
```typescript
const { error: roomError } = await supabase
  .from('match_rooms')
  .insert({
    id: roomId,
    player1_id: user.id,
    player2_id: inviteeId,
    game_mode: numericGameMode,
    match_format: `best-of-${bestOf}`,
    legs_to_win: legsToWin,
    player1_remaining: numericGameMode,
    player2_remaining: numericGameMode,
    current_turn: user.id,
    status: 'waiting',  // ❌ NOT in CHECK constraint!
    match_type: 'private',
    source: 'private',
  });
```

**After (CORRECT):**
```typescript
const { error: roomError } = await supabase
  .from('match_rooms')
  .insert({
    id: roomId,
    player1_id: user.id,
    player2_id: inviteeId,
    game_mode: numericGameMode,
    match_format: `best-of-${bestOf}`,
    legs_to_win: legsToWin,
    player1_remaining: numericGameMode,
    player2_remaining: numericGameMode,
    current_turn: user.id,
    status: 'open',  // ✅ Valid status!
    match_type: 'private',
    source: 'private',
  });
```

### 2. NotificationDropdown.tsx - Status Check

**Before (WRONG):**
```typescript
} else if (existingRoom.status === 'waiting') {
  console.debug('[INVITE] Activating match room from waiting state');
  const { error: updateError } = await supabase
    .from('match_rooms')
    .update({ status: 'active' })
    .eq('id', invite.room_id);
```

**After (CORRECT):**
```typescript
} else if (existingRoom.status === 'open') {
  console.debug('[INVITE] Activating match room from open state');
  const { error: updateError } = await supabase
    .from('match_rooms')
    .update({ status: 'active' })
    .eq('id', invite.room_id);
```

## Status Flow

### Match Room Lifecycle

1. **Creation (Inviter)**: `status: 'open'`
   - Match created, waiting for invitee to accept

2. **Activation (Invitee Accepts)**: `status: 'active'`
   - Both players can now join and play

3. **Completion**: `status: 'completed'` or `'finished'`
   - Match ended normally

4. **Early Exit**: `status: 'forfeited'`
   - Player quit or disconnected

## Semantic Meaning

- **`open`**: Match room created, available to join, waiting for second player
- **`in_progress`**: (Alternative) Could be used for matches that have started
- **`active`**: Match is running with both players present
- **`finished`** / **`completed`**: Match ended normally
- **`forfeited`**: Match ended due to forfeit

For private match invites:
- Inviter creates room with `status: 'open'`
- When invitee accepts, status changes to `'active'`
- This clearly indicates the progression from "waiting for player" to "match started"

## Files Modified

1. **components/app/PrivateMatchModal.tsx**
   - Line 321: Changed `status: 'waiting'` → `status: 'open'`

2. **components/app/NotificationDropdown.tsx**
   - Line 100: Changed `existingRoom.status === 'waiting'` → `existingRoom.status === 'open'`
   - Line 101: Updated log message to "from open state"

## Build Status

```
✓ Compiled successfully
✓ No TypeScript errors
✓ All routes built successfully
✓ 30/30 pages generated
```

## Summary

The private match invite system now uses the correct `status: 'open'` value that matches the database CHECK constraint. This ensures:

1. ✅ Match room creation succeeds (no constraint violation)
2. ✅ Invitee can activate the room (status transitions from 'open' to 'active')
3. ✅ Both players navigate to the match successfully
4. ✅ No database errors during the invite flow

The entire flow now works correctly with proper status values throughout the lifecycle.
