# Match Redirect Logic Fix

## Problem

After adding the trust rating system with cleanup/redirect logic, the app could not enter any match (quick match, private match, training vs bot, ranked). It always returned to `/play` immediately.

**Root Cause:** The code was triggering cleanup + redirect when ANY Supabase query errored, not just when the match was truly ended. This included errors like:
- Failing to fetch `match_events`
- Failing to fetch trust rating
- Failing to fetch recent matches
- Failing to fetch signals
- Failing to fetch lobby data
- Network errors on `match_rooms` query

As a result, match pages instantly redirected back to `/play`.

## Solution

Created a single source of truth for redirecting: **Only redirect when match_rooms status is 'finished' or 'forfeited', OR when match_rooms doesn't exist.**

### Key Principles

1. **Never redirect due to query errors** - If any auxiliary query fails (events, trust rating, signals, etc.), log the error and show a message, but keep the user in the match page

2. **Only redirect on match end** - Redirect ONLY when:
   - `match_rooms` fetch returns no row (match doesn't exist)
   - `match_rooms.status` is 'finished' or 'forfeited'

3. **Don't filter by status on initial load** - Load the match room regardless of status, then check if it's ended

4. **Use hasRedirectedRef guard** - Prevent multiple redirects or cleanup loops from repeated renders

## Files Modified

### 1. Quick Match Page
**File:** `app/app/play/quick-match/match/[matchId]/page.tsx`

**Changes:**
- Added `hasRedirectedRef` using `useRef` (was incorrectly defined as plain object)
- Removed `.eq('status', 'in_progress')` filter from initial query
- Changed error handling to NOT redirect on query errors
- Only redirect when:
  - `!roomData` (match doesn't exist)
  - `roomData.status === 'finished' || roomData.status === 'forfeited'`
- Added `hasRedirectedRef.current` guard to all redirect points
- Profiles and events errors don't cause redirects (already correct)

**Before:**
```typescript
const { data: roomData, error: roomError } = await supabase
  .from('match_rooms')
  .select('*')
  .eq('id', matchId)
  .eq('status', 'in_progress')  // ❌ Filtered by status
  .maybeSingle();

if (roomError) {
  // ❌ Redirected on ANY error
  clearMatchStorage();
  router.push('/app/play');
  return;
}

if (!roomData) {
  // Redirected if not found
  clearMatchStorage();
  router.push('/app/play');
  return;
}
```

**After:**
```typescript
const { data: roomData, error: roomError } = await supabase
  .from('match_rooms')
  .select('*')
  .eq('id', matchId)  // ✅ No status filter
  .maybeSingle();

// ✅ Don't redirect on query error
if (roomError) {
  console.error('[MATCH_ROOM_LOAD] Failed to load room:', roomError);
  toast.error(`Failed to load match room: ${roomError.message}`);
  setLoading(false);
  return;
}

// ✅ Only redirect if match doesn't exist
if (!roomData) {
  if (hasRedirectedRef.current) return;
  hasRedirectedRef.current = true;
  clearMatchStorage();
  router.push('/app/play');
  return;
}

// ✅ Check status and redirect only if ended
if (roomData.status === 'finished' || roomData.status === 'forfeited') {
  if (hasRedirectedRef.current) return;
  hasRedirectedRef.current = true;
  clearMatchStorage();
  router.push('/app/play');
  return;
}
```

### 2. Ranked Match Page
**File:** `app/app/ranked/match/[roomId]/page.tsx`

**Changes:**
- Added `hasRedirectedRef` using `useRef`
- Removed retry logic (was retrying 8 times on errors, causing delays)
- Removed `.eq('status', 'in_progress')` filter from query
- Changed error handling to NOT redirect on query errors
- Only redirect when:
  - `!roomData` (match doesn't exist)
  - `roomData.status === 'finished' || roomData.status === 'forfeited'`
  - `roomData.match_type !== 'ranked'` (wrong match type)
- Added `hasRedirectedRef.current` guard to all redirect points
- Profiles and events errors don't cause redirects (already correct)

**Before:**
```typescript
// Retry logic: try loading room up to 8 times
for (let attempt = 0; attempt < maxRetries; attempt++) {
  const { data, error } = await supabase
    .from('ranked_match_rooms')
    .select('*')
    .eq('id', roomId)
    .eq('status', 'in_progress')  // ❌ Filtered by status
    .maybeSingle();

  if (error) {
    // ❌ Continued retrying on error
    lastError = error;
    continue;
  }

  if (data) {
    roomData = data;
    break;
  }
}

if (!roomData) {
  // ❌ Redirected after all retries failed
  clearMatchStorage();
  router.push('/app/ranked');
  return;
}
```

**After:**
```typescript
const { data: roomData, error: roomError } = await supabase
  .from('ranked_match_rooms')
  .select('*')
  .eq('id', roomId)  // ✅ No status filter
  .maybeSingle();

// ✅ Don't redirect on query error
if (roomError) {
  console.error('[RankedMatch] Failed to load room:', roomError);
  toast.error(`Failed to load match room: ${roomError.message}`);
  setLoading(false);
  return;
}

// ✅ Only redirect if match doesn't exist
if (!roomData) {
  if (hasRedirectedRef.current) return;
  hasRedirectedRef.current = true;
  clearMatchStorage();
  router.push('/app/ranked');
  return;
}

// ✅ Check status and redirect only if ended
if (roomData.status === 'finished' || roomData.status === 'forfeited') {
  if (hasRedirectedRef.current) return;
  hasRedirectedRef.current = true;
  clearMatchStorage();
  router.push('/app/ranked');
  return;
}
```

### 3. Private/Online Match Page
**File:** `app/app/match/online/[matchId]/page.tsx`

**Status:** ✅ Already correct - no changes needed

This page was already handling errors correctly:
- Uses RPC to load match data
- On RPC error, logs and shows toast but does NOT redirect
- Only shows "Match not found" UI when data is null
- User can manually click "Back to Play" button

### 4. Training Matches
**Files:**
- `app/app/play/training/501/page.tsx`
- `app/app/play/training/around-the-clock/page.tsx`
- `app/app/play/training/finish/page.tsx`
- etc.

**Status:** ✅ Not affected

Training matches don't use `match_rooms` at all - they're local state-based games. No redirect issues.

## Redirect Guard Pattern

All redirect points now use the `hasRedirectedRef` guard:

```typescript
const hasRedirectedRef = useRef(false);

// In redirect logic:
if (hasRedirectedRef.current) return;
hasRedirectedRef.current = true;
// ... perform redirect
```

This prevents:
- Multiple redirects from repeated renders
- Cleanup loops
- Race conditions between different redirect triggers

## Error Handling Strategy

### ✅ DO redirect when:
- `match_rooms` query returns no row (match doesn't exist)
- `match_rooms.status === 'finished'` (match ended normally)
- `match_rooms.status === 'forfeited'` (someone forfeited)
- `match_type` doesn't match expected type
- User explicitly forfeits and RPC returns `already_ended: true`

### ❌ DON'T redirect when:
- `match_rooms` query errors (network issue, permission error, etc.)
- `match_events` query fails
- `profiles` query fails
- `trust_ratings` query fails
- `match_signals` query fails
- Any auxiliary data fetch fails

**Instead:** Log the error, show a toast message, and keep the user on the match page.

## Testing Checklist

### ✅ Can Enter Matches
- [x] Quick match can be entered
- [x] Ranked match can be entered
- [x] Private match can be entered
- [x] Training vs bot can be entered

### ✅ Proper Exit Conditions
- [x] Match ends normally → trust modal → game over → can exit
- [x] Opponent forfeits → trust modal → game over → can exit
- [x] User forfeits → trust modal → game over → exits
- [x] Match already ended on load → redirects to /play
- [x] Match doesn't exist → redirects to /play

### ✅ Error Handling
- [x] Network error loading room → stays on page, shows error
- [x] Network error loading events → stays on page, continues
- [x] Network error loading profiles → stays on page, continues
- [x] Multiple redirect attempts → only redirects once

### ✅ Build
- [x] TypeScript compilation successful
- [x] No linting errors
- [x] All pages build correctly

## Summary

The match redirect logic has been fixed to only redirect when the match is truly ended or doesn't exist. Query errors on auxiliary data no longer cause redirects, allowing users to enter and play matches even if some non-critical data fails to load.

Key improvements:
1. Removed status filter from initial query (load room regardless of status)
2. Don't redirect on query errors (only on match end)
3. Added hasRedirectedRef guard (prevent double redirects)
4. Simplified retry logic (removed unnecessary retries)
5. Clear distinction between "match ended" and "query failed"

Users can now enter matches successfully, and the app will only exit a match when `match_rooms.status` is 'finished' or 'forfeited', or when `match_rooms` doesn't exist.
