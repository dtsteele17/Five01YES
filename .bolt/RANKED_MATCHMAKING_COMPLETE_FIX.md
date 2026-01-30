# Ranked Matchmaking - Complete Fix Summary

## Overview
Fixed two critical bugs preventing ranked matchmaking from working end-to-end:
1. **RPC Response Parsing**: Enqueue returns UUID string, not JSON object
2. **Database Table Name**: Must query `ranked_match_rooms`, not `match_rooms`

## Problem 1: RPC Enqueue Response Parsing

### Symptom
```
Console: "Calling rpc_ranked_enqueue (no params)"
Console: "Enqueue response has queueId: undefined"
Console: "pollQueue called without queueId, skipping"
UI: Shows "Searching..." but never finds match
```

### Root Cause
`rpc_ranked_enqueue()` returns a **single UUID string**, but code was treating it as a JSON object:

```typescript
// ❌ INCORRECT
const { data, error } = await supabase.rpc('rpc_ranked_enqueue');
const response = data as { queue_id: string };
const queueId = response.queue_id;  // undefined!
```

### Fix
Destructure the UUID string directly:

```typescript
// ✅ CORRECT
const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');
// queueId is now the UUID string
```

### Files Fixed
- `/app/app/ranked/page.tsx`
- `/app/app/play/page.tsx`

## Problem 2: Database Table Name + Race Condition

### Symptom
```
Error: GET /rest/v1/match_rooms?... 406 (Not Acceptable)
Console: "Match room not found"
```

### Root Cause
1. Querying wrong table: `match_rooms` instead of `ranked_match_rooms`
2. Using `.single()` which throws errors instead of `.maybeSingle()`
3. No retry logic for database replication delays

### Fix
1. Changed all queries to use `ranked_match_rooms` table
2. Changed `.single()` to `.maybeSingle()`
3. Added retry logic with progressive delays (0ms, 200ms, 400ms, 600ms, 800ms)

```typescript
// Retry up to 5 times with progressive delays
let roomData: any = null;
const maxRetries = 5;
const retryDelays = [0, 200, 400, 600, 800];

for (let attempt = 0; attempt < maxRetries; attempt++) {
  if (attempt > 0) {
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
  }

  const { data, error } = await supabase
    .from('ranked_match_rooms')  // Correct table
    .select('*')
    .eq('id', matchRoomId)
    .maybeSingle();  // Returns null instead of throwing

  if (data) {
    roomData = data;
    break;
  }
}
```

### Files Fixed
- `/app/app/match/ranked/[matchRoomId]/page.tsx`
- `/app/app/ranked/match/[roomId]/page.tsx`

## Complete Flow (After Fixes)

### 1. User Clicks "Find Match"
```typescript
// Enqueue for matchmaking
const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');
// queueId = "123e4567-e89b-12d3-a456-426614174000"

// Store and start polling
setQueueId(queueId);
localStorage.setItem('ranked_queue_id', queueId);
startPolling(queueId);
```

### 2. Polling Runs Every Second
```typescript
const { data } = await supabase.rpc('rpc_ranked_poll', {
  p_queue_id: queueId  // ✅ Now has valid UUID
});
// data = { ok: true, status: 'searching', match_room_id: null }
```

### 3. Match Found
```typescript
// Poll returns matched status
// data = { ok: true, status: 'matched', match_room_id: 'abc-def-...' }

if (data.status === 'matched' && data.match_room_id) {
  router.push(`/app/match/ranked/${data.match_room_id}`);
}
```

### 4. Load Match Room (With Retry)
```typescript
// Try loading from ranked_match_rooms with retries
for (let attempt = 0; attempt < 5; attempt++) {
  const { data } = await supabase
    .from('ranked_match_rooms')  // ✅ Correct table
    .select('*')
    .eq('id', matchRoomId)
    .maybeSingle();  // ✅ No error on not found

  if (data) {
    // Success!
    setRoom(data);
    break;
  }

  // Retry with delay
  await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
}
```

### 5. Play Match
- Real-time score updates via subscriptions to `ranked_match_rooms`
- Submit throws/visits
- Track legs won

### 6. Match Completes
```typescript
// Finalize and calculate ranked points
const { data: results } = await supabase.rpc('rpc_ranked_finalize_match', {
  p_match_room_id: matchRoomId,
  p_winner_id: winnerId,
  p_legs_p1: player1Legs,
  p_legs_p2: player2Legs,
});

// Show results with RP gained/lost
```

## RPC Signatures Reference

### `rpc_ranked_enqueue()`
- **Parameters**: None
- **Returns**: UUID string (e.g., `"123e4567-e89b-12d3-a456-426614174000"`)
- **Usage**:
  ```typescript
  const { data: queueId } = await supabase.rpc('rpc_ranked_enqueue');
  ```

### `rpc_ranked_poll(p_queue_id)`
- **Parameters**: `{ p_queue_id: string }` (UUID)
- **Returns**: JSON `{ ok: boolean, queue_id: string, status: string, match_room_id?: string, matched_at?: string }`
- **Statuses**: `'searching'`, `'matched'`, `'cancelled'`, `'not_found'`
- **Usage**:
  ```typescript
  const { data } = await supabase.rpc('rpc_ranked_poll', { p_queue_id: queueId });
  ```

### `rpc_ranked_cancel(p_queue_id)`
- **Parameters**: `{ p_queue_id: string }` (UUID)
- **Returns**: JSON `{ success: boolean, message: string }`
- **Usage**:
  ```typescript
  await supabase.rpc('rpc_ranked_cancel', { p_queue_id: queueId });
  ```

### `rpc_ranked_finalize_match(...)`
- **Parameters**:
  ```typescript
  {
    p_match_room_id: string,
    p_winner_id: string,
    p_legs_p1: number,
    p_legs_p2: number
  }
  ```
- **Returns**: JSON with ranking point changes and new divisions
- **Usage**: Called automatically when match ends

## Database Tables Reference

### `ranked_match_rooms`
- Stores active ranked matches
- Columns: `id`, `player1_id`, `player2_id`, `game_mode`, `match_format`, `match_type`, `status`, `current_leg`, `legs_to_win`, `player1_remaining`, `player2_remaining`, `current_turn`, `winner_id`, `summary`, `created_at`, `started_at`, `completed_at`
- **Always query this table for ranked matches**, not `match_rooms`

### `match_events`
- Stores throw/visit history for all match types
- Filter by `room_id` to get events for specific match

### `ranked_queue`
- Stores players waiting for matches
- Managed by RPCs, not queried directly by frontend

### `ranked_matches`
- Stores completed ranked match records with RP changes
- Linked to `ranked_match_rooms` via `ranked_room_id`

## Expected Console Logs (Success Path)

```
[Ranked] Calling rpc_ranked_enqueue (no params)
[Ranked] Enqueue response - queueId: 123e4567-e89b-12d3-a456-426614174000
[Ranked] Poll result: { status: 'searching', matchRoomId: null }
[Ranked] Poll result: { status: 'searching', matchRoomId: null }
[Ranked] Poll result: { status: 'matched', matchRoomId: 'abc-def-ghi-jkl' }
[Ranked] Match found! Navigating to room: abc-def-ghi-jkl
[RankedMatch] Room loaded successfully: { id: 'abc-def-ghi-jkl', status: 'in_progress' }
[RankedMatch] Room update received: { status: 'in_progress', current_turn: 'player1' }
[RankedMatch] New event received: { event_type: 'visit', score: 60, ... }
```

## Testing Checklist

### Enqueue Fix
- [x] Code compiles successfully
- [x] Enqueue correctly extracts UUID from response
- [x] Queue ID stored in state and localStorage
- [x] No more "queueId: undefined" logs
- [x] Polling runs with valid UUID
- [ ] Test in deployed environment

### Table Name Fix
- [x] All queries use `ranked_match_rooms`
- [x] Retry logic implemented
- [x] `.maybeSingle()` used instead of `.single()`
- [x] Realtime subscriptions updated
- [x] Console logs added
- [ ] Test match room loads after matchmaking
- [ ] Test realtime updates during match

### End-to-End
- [ ] User can find match successfully
- [ ] Navigation to match room works
- [ ] Match loads without 406 errors
- [ ] Scores can be submitted
- [ ] Match completes and shows results
- [ ] RP is updated correctly

## Files Modified Summary

### RPC Enqueue Fix
1. `/app/app/ranked/page.tsx` - Main ranked page enqueue handler
2. `/app/app/play/page.tsx` - Play page ranked option enqueue handler

### Table Name Fix
3. `/app/app/match/ranked/[matchRoomId]/page.tsx` - Match room page (main)
4. `/app/app/ranked/match/[roomId]/page.tsx` - Match room page (alternative)

### Documentation
5. `.bolt/RANKED_ENQUEUE_FIX.md` - Enqueue parsing fix details
6. `.bolt/RANKED_TABLE_NAME_FIX.md` - Table name + retry fix details
7. `.bolt/RANKED_MATCHMAKING_COMPLETE_FIX.md` - This complete summary
