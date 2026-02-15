# Fixes: Ranked Divisions Navigation & Match Recording

## 1. Ranked Divisions Navigation Arrows Fix

**Problem:**
The navigation arrows (left/right) in the Ranked Divisions page were not working when clicked to browse different tier pages.

**Root Cause:**
The navigation handlers had potential stale closure issues with React state, and the keyboard navigation effect was not properly handling state updates.

**Files Modified:**
- `app/app/ranked-divisions/page.tsx`

**Changes:**
1. Added `useCallback` and `useRef` imports
2. Used refs to track current page and total pages to avoid stale closures in event handlers
3. Wrapped `goToPrevious` and `goToNext` in `useCallback` for stable references
4. Simplified button onClick handlers - removed unnecessary `preventDefault` and `stopPropagation`
5. Added `type="button"` to prevent form submission behavior
6. Added `pointer-events-none` to icon elements to ensure clicks register on the button
7. Updated keyboard navigation effect to use refs internally and avoid dependency issues

**Before:**
```typescript
const goToPrevious = () => {
  if (currentPage === 0) return;
  setCurrentPage(prev => prev - 1);
};

// Keyboard navigation - problematic dependencies
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') goToPrevious();
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [currentPage, totalPages]);
```

**After:**
```typescript
// Use refs to avoid stale closures
const currentPageRef = useRef(currentPage);
const totalPagesRef = useRef(totalPages);

useEffect(() => {
  currentPageRef.current = currentPage;
  totalPagesRef.current = totalPages;
}, [currentPage, totalPages]);

const goToPrevious = useCallback(() => {
  setCurrentPage(prev => {
    if (prev <= 0) return prev;
    return prev - 1;
  });
}, []);

// Keyboard navigation - no dependencies needed
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setCurrentPage(prev => {
        if (prev <= 0) return prev;
        return prev - 1;
      });
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## 2. Match Recording for QuickMatch and DartBot

**Problem:**
QuickMatch and DartBot games were not appearing in the Recent Matches section on the play page.

**Root Cause:**
The database functions and table structure needed verification to ensure:
1. `match_history` table has all required columns (including opponent stats)
2. The RPC functions (`fn_update_player_match_stats` and `record_dartbot_match_completion`) are properly inserting records
3. The `useRecentMatches` hook can correctly query and display the data

**Files Modified:**
- `supabase/migrations/20260215000003_verify_and_fix_match_recording.sql` (NEW)

**SQL Migration Contents:**

### A. Verify and Add Missing Columns
The migration checks for and adds these columns to `match_history` if missing:
- `opponent_three_dart_avg` (DECIMAL)
- `opponent_first9_avg` (DECIMAL)
- `opponent_highest_checkout` (INTEGER)
- `opponent_checkout_percentage` (DECIMAL)
- `opponent_darts_thrown` (INTEGER)
- `opponent_visits_100_plus` (INTEGER)
- `opponent_visits_140_plus` (INTEGER)
- `opponent_visits_180` (INTEGER)
- `bot_level` (INTEGER)

### B. Unique Constraint
Ensures unique index on `(room_id, user_id)` to prevent duplicate entries.

### C. Updated `fn_update_player_match_stats` Function
This function is called by the quick-match page to record stats. It:
1. Calculates user stats from `quick_match_visits` table
2. Calculates opponent stats from the same table
3. Inserts/updates `match_history` with both user and opponent stats
4. Updates `player_stats` aggregate table

```sql
-- Key features:
-- - Uses ON CONFLICT (room_id, user_id) DO UPDATE for idempotency
-- - Stores opponent stats directly in the user's match_history row
-- - Calculates averages, checkouts, and visit milestones
```

### D. `record_dartbot_match_completion` Function
This function records DartBot match results:
1. Creates a unique room ID
2. Creates a `dartbot_match_rooms` entry
3. Inserts into `match_history` with `match_format = 'dartbot'`
4. Sets `bot_level` for proper display

### E. Recent Matches Query
The `useRecentMatches` hook queries:
```sql
SELECT * FROM match_history 
WHERE user_id = current_user 
ORDER BY played_at DESC 
LIMIT 3
```

For DartBot matches, it displays: `DartBot (Level X)`
For QuickMatch, it displays the opponent's username from the `profiles` table.

---

## Testing Instructions

### Test Ranked Divisions Navigation:
1. Go to `/app/ranked-divisions`
2. Click the left arrow to go to previous tier page
3. Click the right arrow to go to next tier page
4. Verify page counter updates (e.g., "Tier 1 / 4")
5. Test keyboard navigation with left/right arrow keys
6. Verify Grand Champion appears on its own dedicated page

### Test QuickMatch Recording:
1. Play a quick match against another player
2. Complete the match (win or lose)
3. Go to `/app/play` page
4. Verify the match appears in "Recent Matches" section
5. Check that opponent username and stats are displayed

### Test DartBot Recording:
1. Play a DartBot match (e.g., Training 501)
2. Complete the match
3. Go to `/app/play` page
4. Verify the match appears in "Recent Matches" section
5. Check that opponent shows as "DartBot (Level X)"

---

## Database Migration Deployment

Run this SQL file in Supabase SQL Editor:
```
supabase/migrations/20260215000003_verify_and_fix_match_recording.sql
```

This will:
1. Verify all required columns exist
2. Add any missing columns
3. Update/replace the RPC functions
4. Show recent match_history entries for verification
