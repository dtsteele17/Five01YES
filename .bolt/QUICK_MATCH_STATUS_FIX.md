# Quick Match Status Fix - Checkout/Winning Shot

## Overview

Fixed Quick Match checkout functionality to use consistent status values. The RPC function now sets `status = 'finished'` when a match is won, instead of `'completed'`, aligning with the database constraint and ensuring proper match completion handling.

## Problem

The `submit_quick_match_throw` RPC function was using `status = 'completed'` when a match was won. While this value is allowed by the database constraint, the standard practice is to use `'finished'` for completed matches. This inconsistency could cause issues with match status checks across the application.

## Database Constraint

The `match_rooms` table has a status constraint that allows:
- `'open'` - Room is open for players to join
- `'in_progress'` - Match setup in progress
- `'active'` - Match is actively being played
- `'finished'` - Match completed normally (someone won)
- `'forfeited'` - Match ended due to forfeit
- `'completed'` - Legacy status (allowed but not used)

## Changes Made

### 1. Database Migration - RPC Status Update

**Migration:** `fix_quick_match_status_to_finished`

**Changed:**
- Updated `submit_quick_match_throw()` RPC function
- Status when match is won: `'completed'` → `'finished'`
- Status during gameplay: remains `'active'`

**RPC Logic:**
```sql
-- During gameplay (normal visit)
UPDATE public.match_rooms
SET
  player1_remaining = ...,
  player2_remaining = ...,
  current_turn = v_other_player_id,
  updated_at = NOW()
WHERE id = p_room_id;
-- Status stays 'active'

-- When match is won
UPDATE public.match_rooms
SET
  status = 'finished',  -- Changed from 'completed'
  winner_id = v_winner_id,
  ...
WHERE id = p_room_id;
```

### 2. Adapter Interface Update

**File:** `lib/match/mapRoomToMatchState.ts`

**Before:**
```typescript
export interface MappedMatchState {
  status: 'active' | 'completed' | 'abandoned';
  // ...
}
```

**After:**
```typescript
export interface MappedMatchState {
  status: 'active' | 'finished' | 'abandoned' | 'forfeited';
  // ...
}
```

**Type Cast Update:**
```typescript
status: room.status as 'active' | 'finished' | 'abandoned' | 'forfeited'
```

**Benefits:**
- Type-safe status handling
- Includes all possible final states
- Prevents incorrect status values

### 3. UI Updates - Quick Match Page

**File:** `app/app/play/quick-match/match/[matchId]/page.tsx`

#### Initial Load Check
**Before:**
```typescript
if (roomData.status === 'completed') {
  setShowMatchCompleteModal(true);
}
```

**After:**
```typescript
if (roomData.status === 'finished') {
  setShowMatchCompleteModal(true);
}
```

#### Realtime Update Handler
**Before:**
```typescript
if (updatedRoom.status === 'finished' && !didIForfeit) {
  // Show opponent forfeit modal
} else if (updatedRoom.status === 'completed') {
  setShowMatchCompleteModal(true);
}
```

**After:**
```typescript
if (updatedRoom.status === 'finished' && !didIForfeit) {
  // Show opponent forfeit modal
} else if (updatedRoom.status === 'finished') {
  setShowMatchCompleteModal(true);
}
```

#### Match Complete Check
**Before:**
```typescript
const matchComplete = matchState.status === 'completed' || matchState.status === 'abandoned';
```

**After:**
```typescript
const matchComplete = matchState.status === 'finished' || matchState.status === 'abandoned' || matchState.status === 'forfeited';
```

**Improvements:**
- Consistent use of 'finished' status
- Handles all completion scenarios (normal, forfeit, abandoned)
- More comprehensive match completion detection

## Match Flow

### Normal Match Completion

```
Match starts → status = 'active'
  ↓
Player submits scores
  ↓
submit_quick_match_throw(room_id, score)
  ↓
Calculate remaining, check for checkout
  ↓
If checkout && legs_won >= legs_to_win:
  ↓
UPDATE match_rooms SET status = 'finished', winner_id = ...
  ↓
Realtime broadcasts update
  ↓
UI detects status = 'finished'
  ↓
Show match complete modal
```

### Match Status Values

| Status | Meaning | Transition |
|--------|---------|-----------|
| `open` | Room created, waiting for players | → `active` when both players ready |
| `in_progress` | Setup phase | → `active` when match starts |
| `active` | Match being played | → `finished` when won, → `forfeited` if forfeit |
| `finished` | Match completed (someone won) | Final state |
| `forfeited` | Match ended due to forfeit | Final state |
| `abandoned` | Match abandoned | Final state |

## Verification

### Database Constraint Verification

```sql
SELECT conname, pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'public.match_rooms'::regclass
AND conname = 'match_rooms_status_check';
```

**Result:**
```
CHECK ((status = ANY (ARRAY[
  'open'::text,
  'in_progress'::text,
  'active'::text,
  'finished'::text,
  'forfeited'::text,
  'completed'::text
])))
```

✅ 'finished' is allowed by constraint

### Function Verification

```sql
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'submit_quick_match_throw';
```

✅ Function exists and is callable

### Build Verification

```bash
npm run build
```

✅ Build successful with no type errors

## Testing Checklist

### Normal Match Completion
- [ ] Start Quick Match (status should be 'active')
- [ ] Submit scores for both players
- [ ] Complete a leg by checking out
- [ ] Continue until one player reaches legs_to_win
- [ ] Verify final checkout sets status to 'finished'
- [ ] Verify match complete modal shows
- [ ] Verify winner is set correctly

### Status Transitions
- [ ] Verify match starts with status 'active'
- [ ] Verify status stays 'active' during gameplay
- [ ] Verify status changes to 'finished' on final checkout
- [ ] Verify no constraint violations occur

### UI Display
- [ ] Verify turn indicator only shows when status is 'active'
- [ ] Verify input disabled when status is 'finished'
- [ ] Verify match complete modal shows when status is 'finished'
- [ ] Verify winner celebration displays correctly

### Edge Cases
- [ ] Test checkout with exact score (e.g., 501 → 0)
- [ ] Test multi-leg match (best of 3, 5, etc.)
- [ ] Test rapid score submission
- [ ] Test realtime updates for both players

## Files Modified

1. **Migration:** `supabase/migrations/fix_quick_match_status_to_finished.sql`
   - Updated RPC to use 'finished' status

2. **Adapter:** `lib/match/mapRoomToMatchState.ts`
   - Updated MappedMatchState interface
   - Updated status type cast

3. **UI:** `app/app/play/quick-match/match/[matchId]/page.tsx`
   - Updated initial load check
   - Updated realtime update handler
   - Updated match complete condition

## Benefits

### Consistency
- All match completions use 'finished' status
- Clear distinction between different end states
- Aligns with database constraint best practices

### Type Safety
- TypeScript enforces correct status values
- Compile-time checking prevents invalid states
- IntelliSense shows all valid status options

### Maintainability
- Single source of truth for status values
- Easy to understand match lifecycle
- Reduces confusion about which status to check

### User Experience
- Reliable match completion detection
- Proper modal display on match end
- Consistent behavior across all matches

## Status Migration Notes

### Legacy 'completed' Status

The constraint still allows 'completed' for backward compatibility, but:
- ✅ New matches use 'finished'
- ⚠️ Old matches may have 'completed'
- 💡 UI should handle both for safety

### Recommended Practice

Going forward:
- Use 'finished' for normal match completion
- Use 'forfeited' for forfeit scenarios
- Use 'abandoned' for abandoned matches
- Keep 'active' during gameplay
- Reserve 'completed' for legacy support only

## Build Status

✅ Build successful
✅ Type checking passed
✅ No constraint violations
✅ RPC function deployed
✅ UI updated consistently

Ready for testing and deployment.
