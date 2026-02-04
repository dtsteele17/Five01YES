# Visit History Editing System - Complete Implementation

**Date:** 2026-02-04
**Status:** ✅ Complete

## Overview

Implemented a comprehensive visit history editing and deletion system for quick matches with full dart-level detail, automatic recalculation, and double-out validation.

## Database Changes

### Migration: `create_visit_editing_system.sql`

**RLS Policies:**
- `Players can update own visits in active matches`: Players can only edit their own visits when match is active
- `Players can delete own visits in active matches`: Players can only delete their own visits when match is active

**Validation Trigger:**
- `validate_visit_checkout()`: Automatically validates that checkout visits (remaining = 0) must finish on a double when double-out is enabled
- Triggers on INSERT and UPDATE of `quick_match_visits`

**RPC Functions:**

1. **`rpc_edit_visit_with_darts()`**
   - Parameters:
     - `p_visit_id` (UUID): Visit to edit
     - `p_darts` (JSONB): Array of dart objects `[{n: number, mult: string}]`
     - `p_score` (INTEGER): New score
     - `p_darts_thrown` (INTEGER): Number of darts thrown (1-3)
     - `p_darts_at_double` (INTEGER): Darts at double (0-3)
   - Validates:
     - User owns the visit
     - Match is active
     - Bust conditions (below zero, left on 1)
     - Double-out requirement for checkout
   - Automatically recalculates all subsequent visits in that leg for that player
   - Updates match room's current remaining score

2. **`rpc_delete_visit()`**
   - Parameters:
     - `p_visit_id` (UUID): Visit to delete
   - Validates:
     - User owns the visit
     - Match is active
   - Automatically recalculates all subsequent visits
   - Updates match room's current remaining score
   - Resets to starting score if no visits remain

## Frontend Components

### 1. EditVisitWithDartsModal Component

**Location:** `/components/app/EditVisitWithDartsModal.tsx`

**Features:**
- Full dart-by-dart editing with score and multiplier inputs
- Real-time score calculation and remaining preview
- Visual indicators for bust conditions (below zero, left on 1)
- Checkout validation with double-out requirement
- Delete functionality with confirmation
- Add/remove darts (up to 3)
- Multiplier options: Single, Double, Triple, Single Bull, Double Bull
- Display format: T20, D10, SB, DB, etc.

**Validation:**
- Dart numbers: 0-25
- Score range: 0-180
- Cannot leave 1 remaining
- Checkout must finish on double (when double-out enabled and remaining ≤ 50)

### 2. QuickMatchVisitHistoryPanel Updates

**Location:** `/components/match/QuickMatchVisitHistoryPanel.tsx`

**New Features:**
- Displays dart details for each visit (e.g., "T20, 5, D10")
- Shows BUST and CHECKOUT badges
- Edit button opens comprehensive edit modal
- Delete functionality with automatic recalculation
- Real-time updates via Supabase subscriptions
- Subscribe to DELETE events for immediate UI updates

**Data Structure:**
```typescript
interface Visit {
  id: string;
  visitNumber: number;
  score: number;
  remaining: number;
  remainingBefore: number;
  isBust: boolean;
  isCheckout: boolean;
  darts: Dart[];        // Array of dart objects
  dartsThrown: number;
  dartsAtDouble: number;
}
```

### 3. Quick Match Page Updates

**Location:** `/app/app/play/quick-match/match/[matchId]/page.tsx`

**Changes:**
- Added `double_out` field to `MatchRoom` interface
- Passed `doubleOutEnabled` prop to `QuickMatchVisitHistoryPanel`

## Security Features

### RLS (Row Level Security)

**UPDATE Policy:**
```sql
USING (
  player_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM match_rooms
    WHERE match_rooms.id = quick_match_visits.room_id
    AND match_rooms.status = 'active'
  )
)
```

**DELETE Policy:**
```sql
USING (
  player_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM match_rooms
    WHERE match_rooms.id = quick_match_visits.room_id
    AND match_rooms.status = 'active'
  )
)
```

### Validation Trigger

**Double-Out Validation:**
- Automatically validates checkout visits
- Checks last dart is a double (D) or double bull (DB)
- Marks as bust if validation fails
- Sets `bust_reason` to `'double_out_required'`
- Only enforces when `remaining_before <= 50`

## User Workflow

### Editing a Visit

1. User clicks Edit button on their visit
2. Modal opens showing current darts and score
3. User modifies individual darts (number + multiplier)
4. Real-time preview shows new score and remaining
5. Validation checks:
   - Score range (0-180)
   - Bust conditions
   - Double-out requirement for checkout
6. User clicks Save
7. Backend recalculates all subsequent visits
8. UI updates via realtime subscription

### Deleting a Visit

1. User clicks Delete button in edit modal
2. Confirmation prompt appears
3. User confirms deletion
4. Backend recalculates all subsequent visits
5. Visit removed from UI via realtime subscription

## Automatic Recalculation

When a visit is edited or deleted:

1. **Visit Updated/Deleted:**
   - New `remaining_after` is calculated

2. **Subsequent Visits Recalculated:**
   - For each subsequent visit in order:
     - `remaining_before` = previous visit's `remaining_after`
     - `remaining_after` = `remaining_before - score`
     - Bust conditions checked and applied
     - If bust: remaining reverts, `is_bust` = true

3. **Match Room Updated:**
   - Player's current remaining score updated
   - Based on latest visit in current leg
   - Resets to starting score if no visits remain

## Validation Rules

### Score Validation
- Must be between 0-180
- Calculated from individual darts
- T20 + T20 + T20 = 180 (maximum)

### Bust Conditions
1. **Below Zero:** `remaining_after < 0`
2. **Left on One:** `remaining_after = 1`
3. **Double-Out Required:** Checkout without double on last dart (when enabled and remaining ≤ 50)

### Checkout Validation
- `remaining_after = 0` AND NOT bust
- If double-out enabled AND `remaining_before <= 50`:
  - Last dart must be `mult = 'D'` or `mult = 'DB'`
  - Otherwise marked as bust

## Testing Checklist

- [x] Can edit own visits in active matches
- [x] Cannot edit other players' visits
- [x] Cannot edit in completed matches
- [x] Dart input validation (0-25, multipliers)
- [x] Score calculation accuracy
- [x] Bust detection (below zero, left on 1)
- [x] Double-out validation on checkout
- [x] Subsequent visit recalculation
- [x] Match room remaining score update
- [x] Delete visit functionality
- [x] Delete confirmation prompt
- [x] Realtime updates for both players
- [x] UI updates on edit/delete
- [x] Error handling and toast notifications

## Database Schema

### quick_match_visits Table

```sql
- id (uuid, PK)
- room_id (uuid, FK -> match_rooms)
- leg (integer)
- turn_no (integer) -- Sequential visit number
- player_id (uuid, FK -> auth.users)
- score (integer) -- 0-180
- darts (jsonb) -- Array of {n: number, mult: string}
- remaining_before (integer)
- remaining_after (integer)
- is_bust (boolean)
- bust_reason (text)
- is_checkout (boolean)
- darts_thrown (integer) -- 1-3
- darts_at_double (integer) -- 0-3
- created_at (timestamptz)
- updated_at (timestamptz)
```

## API Usage Examples

### Edit Visit
```typescript
const { data, error } = await supabase.rpc('rpc_edit_visit_with_darts', {
  p_visit_id: 'uuid',
  p_darts: [
    { n: 20, mult: 'T' },
    { n: 5, mult: 'S' },
    { n: 10, mult: 'D' }
  ],
  p_score: 75,
  p_darts_thrown: 3,
  p_darts_at_double: 1,
});
```

### Delete Visit
```typescript
const { data, error } = await supabase.rpc('rpc_delete_visit', {
  p_visit_id: 'uuid',
});
```

## Success Criteria

✅ Users can click Edit on their previous visits
✅ Edit modal shows input fields for each dart
✅ Checkout validation enforces double-out rule
✅ Save button updates visit in database
✅ Delete button removes visit
✅ Automatic recalculation of subsequent visits
✅ RLS prevents editing other players' visits
✅ Trigger validates double-out on checkout
✅ Real-time updates for both players
✅ Error handling with user feedback

## Notes

- Only works for quick matches (can be extended to other match types)
- Edits/deletes only allowed in active matches
- Both players see updates in real-time
- Backend handles all recalculation logic
- Frontend provides immediate validation feedback
- Comprehensive error messages guide users

## Build Status

✅ Build successful
✅ TypeScript compilation passed
✅ All components properly typed
✅ No linting errors
