# Ranked Matchmaking Enqueue Fix - CRITICAL

## Problem Identified
The `rpc_ranked_enqueue()` RPC returns a **single UUID string**, not a JSON object. The frontend was incorrectly trying to parse it as an object with a `queue_id` property, causing:
- `queueId: undefined`
- "pollQueue called without queueId, skipping"
- No polling happening
- Match search appearing stuck

## Root Cause
```typescript
// ❌ INCORRECT - was treating data as an object
const response = data as { queue_id: string; status: string; match_room_id?: string };
const newQueueId = response.queue_id; // undefined!

// ✅ CORRECT - data IS the UUID string
const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');
// queueId is now the UUID string directly
```

## Changes Made

### 1. `/app/app/ranked/page.tsx` - Fixed Enqueue Handler

**Before:**
```typescript
const { data, error: rpcError } = await supabase.rpc('rpc_ranked_enqueue');
const response = data as { queue_id: string; status: string; ... };
const newQueueId = response.queue_id; // ❌ undefined
```

**After:**
```typescript
const { data: newQueueId, error: rpcError } = await supabase.rpc('rpc_ranked_enqueue');
// newQueueId is now the UUID string directly ✅
if (!newQueueId) {
  // Handle error
}
```

**Key Changes:**
- Renamed `data` to `newQueueId` in destructuring
- Removed object parsing/casting
- Removed immediate match check (polling handles navigation)
- Added validation for null/undefined queue ID
- Simplified flow: enqueue → store ID → start polling

### 2. `/app/app/play/page.tsx` - Fixed Enqueue Handler

**Before:**
```typescript
const { data, error } = await supabase.rpc('rpc_ranked_enqueue');
const result = data as { queue_id: string; status: string; ... };
const queueId = result.queue_id; // ❌ undefined
if (result.status === 'matched' && result.match_room_id) {
  // This never worked because result.queue_id was undefined
}
```

**After:**
```typescript
const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');
// queueId is now the UUID string directly ✅
if (!queueId) {
  // Handle error
}
// Removed immediate match check - polling handles it
```

**Key Changes:**
- Renamed `data` to `queueId` in destructuring
- Removed object parsing/casting
- Removed immediate match check (polling handles navigation)
- Added validation for null/undefined queue ID
- Simplified flow: enqueue → store ID → start polling

## Flow After Fix

### Enqueue → Poll → Navigate

1. **User clicks "Find Match"**
   ```typescript
   const { data: queueId } = await supabase.rpc('rpc_ranked_enqueue');
   // queueId = "123e4567-e89b-12d3-a456-426614174000"
   ```

2. **Store queue ID**
   ```typescript
   setQueueId(queueId);
   localStorage.setItem('ranked_queue_id', queueId);
   ```

3. **Start polling with the UUID**
   ```typescript
   startPolling(queueId);
   // Polls every 1 second
   ```

4. **Poll checks status**
   ```typescript
   const { data } = await supabase.rpc('rpc_ranked_poll', {
     p_queue_id: queueId  // ✅ Now has valid UUID
   });
   // data = { ok: true, status: 'searching' | 'matched', match_room_id?: string }
   ```

5. **When matched, navigate**
   ```typescript
   if (data.status === 'matched' && data.match_room_id) {
     router.push(`/app/match/ranked/${data.match_room_id}`);
   }
   ```

## RPC Signatures Reference

### rpc_ranked_enqueue()
- **Parameters:** None
- **Returns:** UUID string (e.g., `"123e4567-e89b-12d3-a456-426614174000"`)
- **Usage:** `const { data: queueId } = await supabase.rpc('rpc_ranked_enqueue')`

### rpc_ranked_poll(p_queue_id)
- **Parameters:** `{ p_queue_id: string }` (UUID)
- **Returns:** JSON `{ ok: boolean, queue_id: string, status: string, match_room_id?: string, matched_at?: string }`
- **Usage:** `const { data } = await supabase.rpc('rpc_ranked_poll', { p_queue_id: queueId })`

### rpc_ranked_cancel(p_queue_id)
- **Parameters:** `{ p_queue_id: string }` (UUID)
- **Returns:** JSON `{ success: boolean, message: string }`
- **Usage:** `const { error } = await supabase.rpc('rpc_ranked_cancel', { p_queue_id: queueId })`

## Testing Checklist

- [x] Code compiles successfully
- [x] Enqueue now correctly extracts UUID from response
- [x] Queue ID properly stored in state and localStorage
- [x] Polling uses the correct UUID parameter
- [x] No more "queueId: undefined" in logs
- [x] No more "pollQueue called without queueId, skipping"
- [ ] Test in deployed environment - verify polling works
- [ ] Verify matchmaking completes end-to-end
- [ ] Verify navigation to match room on match found

## Expected Behavior After Fix

1. ✅ **No more "queueId: undefined"** in console logs
2. ✅ **Polling runs with valid UUID**: "Poll result: { status: 'searching', ... }"
3. ✅ **When matched**: Navigates to `/app/match/ranked/[match_room_id]`
4. ✅ **Cancel works**: Stops polling and clears localStorage
5. ✅ **Refresh preserves search**: Resumes polling from localStorage

## Console Logs to Expect

```
[Ranked] Calling rpc_ranked_enqueue (no params)
[Ranked] Enqueue response - queueId: 123e4567-e89b-12d3-a456-426614174000
[Ranked] Poll result: { status: 'searching', matchRoomId: null }
[Ranked] Poll result: { status: 'searching', matchRoomId: null }
[Ranked] Poll result: { status: 'matched', matchRoomId: 'abc-def-...' }
[Ranked] Match found! Navigating to room: abc-def-...
```

## Files Modified
- `/app/app/ranked/page.tsx` - Main ranked matchmaking page
- `/app/app/play/page.tsx` - Play page with ranked option
