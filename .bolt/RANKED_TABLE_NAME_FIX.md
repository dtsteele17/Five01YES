# Ranked Match Table Name Fix

## Problem
After fixing the RPC enqueue/poll logic, matchmaking was returning the correct match room ID but the app was failing with:
```
GET /rest/v1/match_rooms?... 406 (Not Acceptable)
```

The frontend was querying `match_rooms` table, but ranked matches are stored in `public.ranked_match_rooms`.

## Root Cause
Two issues:
1. **Wrong table name**: Queries used `.from('match_rooms')` instead of `.from('ranked_match_rooms')`
2. **Race condition**: Match rooms might not be immediately visible after matchmaking due to database replication delays

## Changes Made

### 1. `/app/app/match/ranked/[matchRoomId]/page.tsx`

#### Changed Table Name
```typescript
// ❌ BEFORE
const { data: roomData, error: roomError } = await supabase
  .from('match_rooms')  // Wrong table
  .select('*')
  .eq('id', matchRoomId)
  .single();  // Also problematic - throws error if not found

// ✅ AFTER
const { data: roomData, error: roomError } = await supabase
  .from('ranked_match_rooms')  // Correct table
  .select('*')
  .eq('id', matchRoomId)
  .maybeSingle();  // Returns null instead of throwing
```

#### Added Retry Logic
```typescript
// Retry up to 5 times with progressive delays (total ~2s)
let roomData: any = null;
let lastError: any = null;
const maxRetries = 5;
const retryDelays = [0, 200, 400, 600, 800]; // Total ~2 seconds

for (let attempt = 0; attempt < maxRetries; attempt++) {
  if (attempt > 0) {
    console.log(`[RankedMatch] Retry ${attempt}/${maxRetries - 1} after ${retryDelays[attempt]}ms`);
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
  }

  const { data, error } = await supabase
    .from('ranked_match_rooms')
    .select('*')
    .eq('id', matchRoomId)
    .maybeSingle();

  if (error) {
    console.error(`[RankedMatch] Error loading room (attempt ${attempt + 1}):`, error);
    lastError = error;
    continue;
  }

  if (data) {
    roomData = data;
    console.log('[RankedMatch] Room loaded successfully:', { id: data.id, status: data.status });
    break;
  }

  console.log(`[RankedMatch] Room not found yet (attempt ${attempt + 1})`);
}

if (!roomData) {
  console.error('[RankedMatch] Failed to load room after retries:', lastError);
  toast.error('Match room not found');
  router.push('/app/ranked');
  return;
}
```

#### Updated Realtime Subscription
```typescript
// ❌ BEFORE
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'match_rooms',  // Wrong table
  filter: `id=eq.${matchRoomId}`,
}, ...)

// ✅ AFTER
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'ranked_match_rooms',  // Correct table
  filter: `id=eq.${matchRoomId}`,
}, (payload) => {
  console.log('[RankedMatch] Room update received:', payload.new);
  setRoom(payload.new as MatchRoom);
})
```

### 2. `/app/app/ranked/match/[roomId]/page.tsx`

Applied the same fixes:
- Changed table from `match_rooms` to `ranked_match_rooms`
- Already used `.maybeSingle()` (good!)
- Added same retry logic with progressive delays
- Added console logging for debugging

## Why Retry Logic is Needed

When matchmaking finds a match:
1. `rpc_ranked_poll()` returns `{ status: 'matched', match_room_id: 'abc-123' }`
2. Frontend navigates to `/app/match/ranked/abc-123`
3. The page tries to load the room from database

**Problem**: There can be a small delay between:
- The RPC creating the match room row
- The row becoming visible to subsequent queries (database replication, transaction commits, etc.)

**Solution**: Retry with progressive delays:
- Attempt 1: Immediate (0ms)
- Attempt 2: After 200ms
- Attempt 3: After 400ms more
- Attempt 4: After 600ms more
- Attempt 5: After 800ms more
- **Total wait time**: ~2 seconds

This gives the database time to catch up while still being fast for the common case where the row is immediately available.

## Navigation Flow After Fix

1. **User clicks "Find Match"**
   - Calls `rpc_ranked_enqueue()` → Gets queue ID
   - Starts polling with that ID

2. **Polling detects match**
   ```typescript
   const { data } = await supabase.rpc('rpc_ranked_poll', { p_queue_id: queueId });
   // data = { ok: true, status: 'matched', match_room_id: 'abc-123' }
   ```

3. **Navigate to match room**
   ```typescript
   router.push(`/app/match/ranked/${data.match_room_id}`);
   ```

4. **Match room page loads**
   - Tries to load from `ranked_match_rooms` table
   - Retries if not found immediately
   - Shows match interface once loaded

5. **Players play the match**
   - Real-time updates via subscriptions
   - Score submissions
   - Leg/match completion

6. **Match finishes**
   - Calls `rpc_ranked_finalize_match()`
   - Shows ranked points gained/lost
   - Updates division/rank

## Console Logs to Expect

### Successful immediate load:
```
[RankedMatch] Room loaded successfully: { id: 'abc-123', status: 'in_progress' }
```

### With retry:
```
[RankedMatch] Room not found yet (attempt 1)
[RankedMatch] Retry 1/4 after 200ms
[RankedMatch] Room loaded successfully: { id: 'abc-123', status: 'in_progress' }
```

### Failed after retries:
```
[RankedMatch] Room not found yet (attempt 1)
[RankedMatch] Retry 1/4 after 200ms
[RankedMatch] Room not found yet (attempt 2)
[RankedMatch] Retry 2/4 after 400ms
...
[RankedMatch] Failed to load room after retries: <error>
```

## Testing Checklist

- [x] Build passes
- [x] Correct table name used (`ranked_match_rooms`)
- [x] Retry logic implemented with progressive delays
- [x] `.maybeSingle()` used instead of `.single()`
- [x] Realtime subscriptions updated to correct table
- [x] Console logs added for debugging
- [ ] Test in deployed environment - verify no 406 errors
- [ ] Verify match room loads after matchmaking
- [ ] Verify realtime updates work during match
- [ ] Test retry logic with slow database

## Files Modified
- `/app/app/match/ranked/[matchRoomId]/page.tsx` - Main ranked match page
- `/app/app/ranked/match/[roomId]/page.tsx` - Alternative ranked match room page
