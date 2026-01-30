# Debugging Tournaments - Enhanced Logging Guide

## Summary of Changes

Enhanced the tournament system with comprehensive debugging logs to identify why tournaments aren't appearing in the UI.

## What Was Added

### 1. Enhanced Data Layer Logging (`lib/db/tournaments.ts`)

**listTournaments()** now logs:
- `LIST_TOURNAMENTS_CALLED` - When function is invoked
- `LIST_TOURNAMENTS_USER` - Current authenticated user info
- `LIST_TOURNAMENTS_ERROR` - Detailed error info (message, details, hint, code)
- `TOURNAMENTS_FETCHED_SUCCESS` - Count and list of tournaments returned

**subscribeToTournaments()** now logs:
- `SUBSCRIBING_TO_TOURNAMENTS` - When subscription starts
- `REALTIME_SUBSCRIPTION_STATUS` - Subscription status changes
- `REALTIME_CHANNEL_CREATED` - Channel info
- `REALTIME_TOURNAMENT_INSERTED` - When a tournament is inserted
- `REALTIME_TOURNAMENT_UPDATED` - When a tournament is updated
- `UNSUBSCRIBING_FROM_TOURNAMENTS` - When cleanup happens

### 2. Enhanced Page Component Logging (`app/app/tournaments/page.tsx`)

**loadTournaments()** now logs:
- `LOADING_TOURNAMENTS_START` - When fetch begins
- `TOURNAMENTS_LOADED_INTO_STATE` - Count and tournament list set in state
- `LOAD_TOURNAMENTS_ERROR` - Detailed error with stack trace

**handleTournamentCreated()** now logs:
- `TOURNAMENT_CREATED_CALLBACK` - When callback is invoked
- `NAVIGATING_TO_TOURNAMENT` - Before navigation

## How to Debug the Issue

### Step 1: Open Browser Console

1. Navigate to `/app/tournaments`
2. Open browser DevTools (F12)
3. Go to Console tab
4. Clear console

### Step 2: Check Initial Load

Look for this sequence:
```
LOADING_TOURNAMENTS_START
LIST_TOURNAMENTS_CALLED { filters: undefined }
LIST_TOURNAMENTS_USER { id: "...", email: "..." } or NOT_AUTHENTICATED
TOURNAMENTS_FETCHED_SUCCESS { count: 0, tournaments: [] }
TOURNAMENTS_LOADED_INTO_STATE { count: 0, tournaments: [] }
SUBSCRIBING_TO_TOURNAMENTS { filters: undefined }
REALTIME_SUBSCRIPTION_STATUS "SUBSCRIBED"
REALTIME_CHANNEL_CREATED [Object]
```

### Step 3: Create a Tournament

1. Click "Create Tournament"
2. Fill in form
3. Click "Create Tournament"

Expected logs:
```
CREATING_TOURNAMENT_IN_SUPABASE { name: "...", ... }
TOURNAMENT_CREATED { id: "...", name: "...", ... }
TOURNAMENT_CREATED_SUCCESSFULLY "uuid-here"
TOURNAMENT_CREATED_CALLBACK "uuid-here"
LOADING_TOURNAMENTS_START
LIST_TOURNAMENTS_CALLED { filters: undefined }
TOURNAMENTS_FETCHED_SUCCESS { count: 1, tournaments: [...] }
TOURNAMENTS_LOADED_INTO_STATE { count: 1, tournaments: [...] }
NAVIGATING_TO_TOURNAMENT "uuid-here"
```

### Step 4: Check Realtime Updates

Open two browser windows:
- Window 1: Keep on `/app/tournaments` with console open
- Window 2: Create a new tournament

Window 1 should show:
```
REALTIME_TOURNAMENT_INSERTED { id: "...", name: "...", fullPayload: {...} }
```

## Common Issues and Solutions

### Issue 1: User Not Authenticated

**Symptom**:
```
LIST_TOURNAMENTS_USER NOT_AUTHENTICATED
```

**Solution**:
- User must be logged in to view tournaments
- RLS policies require authentication
- Redirect to `/login` if not authenticated

### Issue 2: RLS Permission Denied

**Symptom**:
```
LIST_TOURNAMENTS_ERROR {
  message: "permission denied for table tournaments",
  code: "42501"
}
```

**Solution**:
Check RLS policies allow SELECT:
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'tournaments' AND cmd = 'SELECT';
```

Should have at least one policy with `qual = 'true'` for authenticated users.

### Issue 3: Tournaments Fetched But Not Displayed

**Symptom**:
```
TOURNAMENTS_FETCHED_SUCCESS { count: 1, tournaments: [...] }
TOURNAMENTS_LOADED_INTO_STATE { count: 1, tournaments: [...] }
```
But UI shows "No tournaments available"

**Cause**: Filtering logic removing tournaments

**Check**:
1. `statusFilter` state value
2. `maxParticipantsFilter` state value
3. `searchQuery` state value

**Debug in console**:
```javascript
// Check current filters
console.log('Status filter:', statusFilter);
console.log('Max participants filter:', maxParticipantsFilter);
console.log('Search query:', searchQuery);

// Check raw tournaments
console.log('All tournaments:', tournaments);

// Check filtered tournaments
console.log('Filtered tournaments:', filteredTournaments);
```

### Issue 4: Realtime Not Working

**Symptom**:
```
REALTIME_SUBSCRIPTION_STATUS "CLOSED"
```
or no `REALTIME_TOURNAMENT_INSERTED` logs appear

**Solutions**:

1. **Check Realtime is enabled in Supabase Dashboard**:
   - Go to Database → Replication
   - Ensure `tournaments` table has replication enabled

2. **Check RLS policies allow SELECT**:
   - Realtime uses same RLS policies as regular queries
   - If SELECT is denied, realtime won't work

3. **Check Supabase connection**:
```javascript
// In console
const supabase = createClient();
const { data, error } = await supabase.from('tournaments').select('count');
console.log('Direct query:', data, error);
```

### Issue 5: Empty Array Returned

**Symptom**:
```
TOURNAMENTS_FETCHED_SUCCESS { count: 0, tournaments: [] }
```
But database shows tournaments exist

**Possible causes**:

1. **Filters are too restrictive**:
   - Check if filters in `listTournaments()` are excluding results
   - Try calling without filters: `await listTournaments()`

2. **Status mismatch**:
   - Check tournament status in database
   - Verify it matches expected values ('open', 'active', etc.)

3. **RLS policy is filtering**:
   - Some policies only show tournaments with specific statuses
   - Check policy: "Anyone can view active tournaments" requires status IN ('open', 'locked', 'active', 'started', 'in_progress')
   - If tournament status is different, it won't be returned

## Verification Checklist

Run through this checklist:

- [ ] User is authenticated (check console for user ID)
- [ ] `listTournaments()` is being called on page load
- [ ] No errors in console
- [ ] Tournament count > 0 in database (`/app/dev/bolt-database-check`)
- [ ] Tournament count matches what's fetched (check console logs)
- [ ] Tournaments are loaded into state (check React DevTools)
- [ ] Filters aren't excluding all tournaments
- [ ] Realtime subscription is "SUBSCRIBED"
- [ ] Creating a tournament triggers refetch
- [ ] Tournament appears in UI after creation

## Quick Test Script

Run this in browser console on `/app/tournaments` page:

```javascript
// Test 1: Check authentication
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();
console.log('Auth test:', user ? '✅ Authenticated' : '❌ Not authenticated');

// Test 2: Check direct query
const { data, error } = await supabase
  .from('tournaments')
  .select('*')
  .order('created_at', { ascending: false });
console.log('Direct query test:', error ? `❌ ${error.message}` : `✅ ${data.length} tournaments`);

// Test 3: Check RLS
const { data: countData, error: countError } = await supabase
  .from('tournaments')
  .select('*', { count: 'exact', head: true });
console.log('RLS test:', countError ? `❌ ${countError.message}` : `✅ Can read ${countData} tournaments`);
```

## Database Verification

Run these SQL queries in Supabase SQL Editor:

```sql
-- Check tournament count
SELECT COUNT(*) FROM tournaments;

-- Check tournament statuses
SELECT id, name, status, created_at
FROM tournaments
ORDER BY created_at DESC
LIMIT 5;

-- Check RLS policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'tournaments'
ORDER BY cmd, policyname;

-- Test as specific user (replace with actual user ID)
SET ROLE authenticated;
SET request.jwt.claims.sub TO 'user-id-here';
SELECT * FROM tournaments;
RESET ROLE;
```

## Expected Behavior After Fix

### Scenario 1: Fresh Page Load (No Tournaments)
1. Page shows loading state
2. Console logs fetch attempt
3. Page shows "No tournaments available" message
4. Console shows count: 0

### Scenario 2: Fresh Page Load (With Tournaments)
1. Page shows loading state
2. Console logs fetch attempt with count > 0
3. Page renders tournament cards
4. Cards show correct info (name, date, participants, etc.)

### Scenario 3: Creating Tournament (Same User)
1. Modal submits
2. Console shows creation logs
3. Toast shows success message
4. Page refetches and shows new tournament
5. User navigates to tournament detail page

### Scenario 4: Creating Tournament (Different User)
1. User A creates tournament
2. User B's page shows realtime log
3. Tournament appears in User B's list without refresh
4. Both users see same tournament count

## Next Steps If Still Not Working

If tournaments still don't appear after all this:

1. **Share console logs**: Copy full console output when loading page
2. **Check network tab**: Look for failed requests to Supabase
3. **Verify environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` is set
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set
4. **Test with Supabase client directly** using the test script above
5. **Check browser storage**: Clear localStorage/cookies and try again

---

**Created**: 2026-01-22
**Purpose**: Debug why tournaments aren't appearing in UI despite being in database
**Status**: Enhanced logging active, awaiting test results
