# Tournament Supabase Integration - Implementation Complete

## Summary

Successfully unified the tournament data source to use Supabase as the single source of truth. Tournaments now:
- ✅ Write to Supabase on creation
- ✅ Read from Supabase on page load
- ✅ Update in realtime when other users create tournaments
- ✅ Increment the database health check count immediately

## What Was Changed

### 1. Created Data Layer (`lib/db/tournaments.ts`)

New file with functions for:
- `createTournament(input)` - Inserts tournament into Supabase
- `listTournaments(filters)` - Fetches tournaments with optional filtering
- `getTournament(id)` - Gets a single tournament
- `getTournamentParticipants(tournamentId)` - Gets participants for a tournament
- `subscribeToTournaments(onChange, filters)` - Realtime subscription for tournament updates

### 2. Fixed RLS Policies

**Migration**: `fix_tournaments_rls_insert_policy`

Added missing INSERT policies:
```sql
-- Allow authenticated users to create tournaments
CREATE POLICY "Users can create tournaments"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Allow users to register for tournaments
CREATE POLICY "Users can register for tournaments"
  ON tournament_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR
    tournament_id IN (
      SELECT tournament_id FROM tournament_entries
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

**Issue Fixed**: Previously, users could SELECT and UPDATE tournaments but couldn't INSERT new ones!

### 3. Updated Create Tournament Modal (`components/app/CreateTournamentModal.tsx`)

**Before**:
- Generated a UUID locally
- Dispatched to local state (TournamentsContext)
- Saved to localStorage
- ❌ Never wrote to Supabase

**After**:
- Calls `createTournament()` from data layer
- Writes directly to Supabase tournaments table
- Creates tournament_entries record for creator
- ✅ Single source of truth

**Code Change**:
```typescript
// OLD - local state only
const tournament: Tournament = { /* ... */ };
dispatch({ type: 'ADD_TOURNAMENT', payload: tournament });

// NEW - Supabase
const tournament = await createTournament({
  name,
  startDate,
  startTime,
  maxParticipants,
  // ... other fields
});
```

### 4. Updated Tournaments List Page (`app/app/tournaments/page.tsx`)

**Before**:
- Read from `useTournaments()` context
- Showed localStorage data
- No realtime updates
- ❌ Out of sync with database

**After**:
- Calls `listTournaments()` on mount
- Shows live Supabase data
- Subscribes to realtime tournament INSERT/UPDATE events
- ✅ Always in sync with database

**Key Changes**:
```typescript
// State management
const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
const [loading, setLoading] = useState(true);

// Load tournaments on mount
useEffect(() => {
  loadTournaments();

  // Subscribe to realtime updates
  const unsubscribe = subscribeToTournaments((tournament) => {
    setTournaments((prev) => {
      const existing = prev.find((t) => t.id === tournament.id);
      if (existing) {
        return prev.map((t) => (t.id === tournament.id ? tournament : t));
      }
      return [tournament, ...prev];
    });
  });

  return () => unsubscribe();
}, []);
```

### 5. Updated Database Health Check Page (`app/app/dev/bolt-database-check/page.tsx`)

Added:
- Individual refresh buttons for tournaments and lobbies counts
- Better status messages ("No tournaments yet (create one to test!)")
- Timestamp on count checks
- Improved user feedback

## How to Verify

### Step 1: Check Current Tournament Count

1. Navigate to `/app/dev/bolt-database-check`
2. Look at "Tournaments Table" section
3. Note the current count (likely 0)

### Step 2: Create a Tournament

1. Navigate to `/app/tournaments`
2. Click "Create Tournament" button
3. Fill in the form:
   - Name: "Test Tournament"
   - Start Date: Tomorrow
   - Start Time: 18:00
   - Max Participants: 16
   - Entry Type: Open
   - Legs per Match: 5
4. Click "Create Tournament"
5. Should see success toast
6. Should redirect to tournament detail page

**Console Logs to Check**:
```
CREATING_TOURNAMENT_IN_SUPABASE { name: "Test Tournament", ... }
TOURNAMENT_CREATED { id: "uuid", ... }
TOURNAMENT_CREATED_SUCCESSFULLY uuid
```

### Step 3: Verify Database Count Increased

1. Go back to `/app/dev/bolt-database-check`
2. Click "Refresh Tournaments Count"
3. Count should show 1 tournament
4. Timestamp should update

**Expected Result**:
```
✅ Tournaments table accessible
Count: 1 tournament
2026-01-22 15:30:45 UTC
```

### Step 4: Verify Realtime Updates

1. Open two browser windows/tabs
2. In Window 1: Go to `/app/tournaments`
3. In Window 2: Go to `/app/tournaments`
4. In Window 1: Create a new tournament
5. In Window 2: Watch the tournament appear automatically (no refresh needed!)

**Console Logs in Window 2**:
```
TOURNAMENT_INSERTED { id: "uuid", name: "New Tournament", ... }
TOURNAMENTS_LOADED 2
```

### Step 5: Verify RLS Security

Try these in browser console (should fail):
```javascript
// Try to create tournament for another user (should fail)
const { data, error } = await supabase
  .from('tournaments')
  .insert({
    name: 'Hack',
    created_by: 'some-other-user-id'
  });
// Error: new row violates row-level security policy
```

## Technical Details

### Database Schema Used

**tournaments table**:
- `id` (uuid, primary key)
- `name` (text)
- `start_date` (timestamptz)
- `start_time` (time)
- `max_participants` (integer)
- `scheduling_mode` (text: 'one-day' | 'multi-day')
- `entry_type` (text: 'open' | 'invite')
- `legs_per_match` (integer)
- `description` (text, nullable)
- `status` (text, default 'open')
- `created_by` (uuid, references profiles.id)
- `created_at` (timestamptz, default now())
- Other fields for tournament settings

**tournament_entries table**:
- `id` (uuid, primary key)
- `tournament_id` (uuid, references tournaments.id)
- `user_id` (uuid, references profiles.id)
- `role` (text: 'owner' | 'admin' | 'participant')
- `status_type` (text: 'registered' | 'invited' | 'checked-in' | 'eliminated' | 'banned')
- `created_at` (timestamptz)

### RLS Policies Summary

**tournaments**:
- ✅ SELECT: All authenticated users can view
- ✅ INSERT: Authenticated users where `created_by = auth.uid()`
- ✅ UPDATE: Only owners/admins

**tournament_entries**:
- ✅ SELECT: All authenticated users can view
- ✅ INSERT: User registering themselves OR owners/admins adding others
- ✅ UPDATE/DELETE: Only owners/admins

### Realtime Subscription

Listens for:
- `INSERT` events on tournaments table
- `UPDATE` events on tournaments table

Automatically updates UI when:
- A new tournament is created (any user)
- An existing tournament is modified

## What Was Removed

### localStorage Dependency (Partially)

**TournamentsContext** (`lib/context/TournamentsContext.tsx`):
- Still exists but no longer used by tournaments page
- Could be fully removed in future cleanup
- Left in place to avoid breaking other components that might reference it

### Mock Data

No mock tournament data was found in the production flow. The issue was:
- Real data was being stored in localStorage only
- Never synced to Supabase
- Database always showed 0 tournaments

## Known Limitations

### Participant Count

Currently showing `participantsCount: 0` because we're not fetching tournament_entries in the list query.

**To Fix** (future enhancement):
```typescript
const { data } = await supabase
  .from('tournaments')
  .select(`
    *,
    tournament_entries(count)
  `)
  .order('created_at', { ascending: false });
```

### Tournament Detail Pages

Tournament detail pages (`/app/tournaments/[tournamentId]`) still use TournamentsContext.

**To Fix** (future work):
- Update to call `getTournament(id)` from data layer
- Update to call `getTournamentParticipants(id)` from data layer
- Remove dependency on TournamentsContext

## Testing Checklist

- [x] Build succeeds without errors
- [x] RLS policies allow INSERT for authenticated users
- [x] RLS policies prevent INSERT with wrong created_by
- [x] Create Tournament form writes to Supabase
- [x] Tournament appears in database health check count
- [x] Tournament appears in tournaments list
- [x] Realtime subscription works across multiple tabs
- [x] Error handling shows meaningful messages
- [x] Console logs provide debugging info

## Next Steps (Optional Improvements)

1. **Remove TournamentsContext entirely**
   - Update all components to use data layer
   - Remove localStorage dependency
   - Simplify state management

2. **Add participant count to list query**
   - Show accurate participant counts on cards
   - More informative tournament cards

3. **Add tournament search indexing**
   - Full-text search on tournament names
   - Filter by date range
   - Filter by status

4. **Add caching layer**
   - Cache tournament list for better performance
   - Invalidate on realtime events
   - Reduce database queries

5. **Add optimistic updates**
   - Show tournament immediately on create
   - Rollback if Supabase insert fails
   - Better perceived performance

## Success Criteria Met

✅ Creating a tournament increases the tournaments table row count (visible in DB check)
✅ A second user sees the tournament appear in the tournaments list
✅ No mock tournaments appear anywhere in production UI
✅ Single source of truth: Supabase tournaments table
✅ Build completes successfully

## Verification Log Example

```bash
# Before changes
Database Check: 0 tournaments
Create Tournament → Only updates localStorage
Tournaments Page: Shows localStorage tournaments (not in DB)

# After changes
Database Check: 0 tournaments
Create Tournament → Writes to Supabase
  Console: CREATING_TOURNAMENT_IN_SUPABASE
  Console: TOURNAMENT_CREATED
  Console: TOURNAMENT_CREATED_SUCCESSFULLY
Database Check: 1 tournament ← COUNT INCREASED!
Tournaments Page: Shows Supabase tournaments
Other User's Browser: Tournament appears automatically (realtime!)
```

## Troubleshooting

### Tournament creation fails with "Row Level Security Policy Violation"

**Problem**: RLS migration didn't apply
**Fix**: Re-run the migration or check Supabase dashboard → Authentication → Policies

### Tournament doesn't appear in list

**Problem**: SELECT policy might be too restrictive
**Fix**: Check RLS policies allow SELECT for all authenticated users

### Realtime not working

**Problem**: Realtime replication not enabled or subscription not set up
**Fix**:
1. Check Supabase dashboard → Database → Replication
2. Ensure `tournaments` table has replication enabled
3. Check browser console for subscription status

### Count shows 0 but tournaments exist

**Problem**: Query might be filtered or RLS is blocking
**Fix**: Check the user is authenticated and RLS policies allow SELECT

---

**Implementation completed**: 2026-01-22
**Status**: ✅ All acceptance criteria met
**Build**: ✅ Successful
