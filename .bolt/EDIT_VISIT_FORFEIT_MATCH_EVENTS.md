# Edit Visit + Forfeit using match_events

## Summary
Implemented Edit Visit and Forfeit functionality using the match_events table and dedicated RPCs:
- `rpc_edit_quick_match_visit` for editing visits
- `rpc_forfeit_match` for forfeiting matches

Both features work with real-time synchronization via Supabase realtime subscriptions.

## Changes Made

### 1. Edit Visit Implementation

#### RPC Used: `rpc_edit_quick_match_visit`
**Parameters:**
- `p_room_id` (UUID) - The match room ID
- `p_visit_number` (INTEGER) - The visit number to edit (1-indexed)
- `p_new_score` (INTEGER) - The new score for the visit (0-180)

**Response:**
```json
{
  "ok": true,
  "new_remaining": 401,
  "leg_won": false,
  "match_won": false
}
```

Or on error:
```json
{
  "ok": false,
  "error": "This score would result in a bust (remaining < 0)"
}
```

#### Code Changes: `/app/app/play/quick-match/match/[matchId]/page.tsx`

**handleSaveEditedVisit function (L630-665):**
- Calls `rpc_edit_quick_match_visit` with room_id, visit_number, and new_score
- Checks for RPC-level errors (`data.ok === false`)
- Displays specific error message for "remaining below 0" scenario
- Allows exactly 0 (checkout)
- Refreshes match data after successful edit
- Both users' screens update via realtime subscription

**Error Handling:**
- ❌ Invalid score (< 0 or > 180): Shows "Score must be between 0 and 180"
- ❌ Would result in negative remaining: Shows "This score would result in a bust (remaining < 0)"
- ✅ Would result in exactly 0: Allowed (checkout)
- ✅ Valid score that doesn't bust: Updates successfully

### 2. Forfeit Implementation

#### RPC Used: `rpc_forfeit_match`
**Parameters:**
- `p_room_id` (UUID) - The match room ID

**Response:**
```json
{
  "ok": true,
  "winner_id": "uuid-of-opponent",
  "forfeiter_id": "uuid-of-current-user"
}
```

Or on error:
```json
{
  "ok": false,
  "error": "match_already_ended"
}
```

#### Code Changes: `/app/app/play/quick-match/match/[matchId]/page.tsx`

**forfeitMatch function (L556-603):**
- Calls `rpc_forfeit_match` with room_id
- Sets `didIForfeit` flag to prevent showing "Opponent Forfeited" modal to self
- Navigates forfeiting player to `/app/play` (not `/app/play/quick-match`)
- Cleans up match state before navigation
- Removes match_signals insert (not needed, RPC creates forfeit event)

**What the RPC Does:**
1. Creates a forfeit event in `match_events` table
2. Updates `match_rooms.status` to 'forfeited'
3. Sets `match_rooms.winner_id` to the opponent
4. Returns success with winner_id and forfeiter_id

### 3. Realtime Synchronization

#### match_events Subscription (L306-332)
Already configured to listen for:
- **INSERT events**: New visits and forfeit events
- **UPDATE events**: Edited visits

When a visit is edited:
1. Player A edits visit → calls `rpc_edit_quick_match_visit`
2. RPC updates `match_events` (score, remaining_after)
3. Both Player A and Player B receive UPDATE event via subscription
4. Both screens refresh with new data
5. Remaining scores recalculate for all subsequent visits

#### match_rooms Subscription (L271-305)
Listens for room status changes:
- When status changes to 'forfeited':
  - Forfeiting player: Already navigated away
  - Opponent: Shows "Opponent Forfeited" modal (L291)

### 4. Opponent Forfeit Detection

#### Detection Mechanism
The opponent knows someone forfeited via:
1. **Room status change**: `match_rooms.status` → 'forfeited'
2. **Realtime subscription** triggers (L286-303)
3. **Conditional modal display**: Only if `!didIForfeit` (L290)

#### Modal Display (L1107-1124)
Shows "Opponent Forfeited" modal when:
- `showOpponentForfeitModal === true`
- `matchState.endedReason === 'forfeit'`

The modal displays:
- Title: "Opponent Forfeited"
- Subtitle: "Match ended early"
- Match stats (if available)
- Trust rating options
- Return to app button

## Database Flow

### Edit Visit Flow
```
1. User clicks Edit on Visit #3
2. Client calls rpc_edit_quick_match_visit(room_id, 3, 45)
3. RPC finds event for user's 3rd visit in current leg
4. RPC calculates: previous_remaining - 45 = new_remaining
5. If new_remaining < 0: Return error
6. If new_remaining >= 0: Update match_events.score and remaining_after
7. RPC recalculates all subsequent visits in same leg
8. UPDATE event broadcast via realtime
9. Both users' UI refreshes with new data
```

### Forfeit Flow
```
1. User clicks Forfeit → Confirm dialog
2. Client calls rpc_forfeit_match(room_id)
3. RPC inserts forfeit event in match_events
4. RPC updates match_rooms.status = 'forfeited'
5. RPC updates match_rooms.winner_id = opponent_id
6. Forfeiter navigates to /app/play
7. UPDATE event broadcast for match_rooms
8. Opponent receives room status change
9. Opponent sees "Opponent Forfeited" modal
10. Opponent can rate trust and return to app
```

## Technical Details

### match_events Table Structure
The visit events stored in match_events have:
```sql
- id (uuid, primary key)
- room_id (uuid)
- player_id (uuid)
- seq (integer, event sequence)
- event_type (text: 'visit', 'forfeit', etc.)
- score (integer, 0-180)
- remaining_after (integer)
- leg (integer)
- payload (jsonb)
- created_at (timestamptz)
```

### Edit Visit RPC Logic
1. Validates score (0-180)
2. Finds the event by:
   - Filtering by room_id, player_id, leg, event_type='visit'
   - Using ROW_NUMBER() to get the Nth visit
3. Calculates new remaining from previous event
4. Rejects if would go negative (unless exactly 0)
5. Updates the edited event
6. Recalculates all subsequent events in same leg
7. Updates room state (player1_remaining, player2_remaining)
8. Checks for leg win (remaining = 0)
9. Handles match win if legs_to_win reached

### Forfeit RPC Logic
1. Validates user is authenticated and is a player
2. Checks match isn't already ended
3. Determines opponent (winner)
4. Inserts forfeit event in match_events
5. Updates room status to 'forfeited'
6. Sets winner_id to opponent
7. Returns success with winner_id and forfeiter_id

## Acceptance Criteria

### ✅ Edit Visit
- [x] Calls `rpc_edit_quick_match_visit` with p_room_id, p_visit_number, p_new_score
- [x] Updates both users' screens via realtime subscription
- [x] Remaining recalculates correctly for all subsequent visits
- [x] Rejects scores that would make remaining < 0
- [x] Allows exactly 0 (checkout)
- [x] Shows error toast: "This score would result in a bust (remaining < 0)"
- [x] Shows success toast on valid edit
- [x] Modal closes after successful save

### ✅ Forfeit
- [x] Forfeit button opens confirm dialog
- [x] On confirm, calls `rpc_forfeit_match` with p_room_id
- [x] On success, forfeiting player navigates to /app/play
- [x] Other player sees "Opponent forfeited" modal
- [x] Modal triggered by match_rooms.status='forfeited'
- [x] Forfeit event created in match_events
- [x] Winner determined correctly (opponent)
- [x] Shows success toast to forfeiter
- [x] Cleans up match state before navigation

## Testing Notes

### Edit Visit Test Cases
1. **Valid edit (no bust):**
   - Edit visit with score that doesn't bust
   - Expected: Success toast, both screens update

2. **Edit to exactly 0 (checkout):**
   - Edit visit to score that results in remaining=0
   - Expected: Success, leg won, screens update

3. **Edit that would bust:**
   - Edit visit with score > current remaining
   - Expected: Error toast "This score would result in a bust (remaining < 0)"

4. **Invalid score:**
   - Try score > 180 or < 0
   - Expected: Error toast from validation

### Forfeit Test Cases
1. **User forfeits:**
   - Confirm forfeit dialog
   - Expected: User goes to /app/play, opponent sees modal

2. **Receive forfeit:**
   - Opponent forfeits
   - Expected: See "Opponent Forfeited" modal, can rate and return

## Files Modified

1. **`/app/app/play/quick-match/match/[matchId]/page.tsx`**
   - L630-665: Updated `handleSaveEditedVisit` with proper error handling
   - L556-603: Updated `forfeitMatch` to navigate to /app/play and remove unnecessary signal

2. **Database RPCs (already implemented):**
   - `/supabase/migrations/20260204041148_update_edit_visit_rpc_parameters.sql`
   - `/supabase/migrations/20260202235834_create_rpc_forfeit_match.sql`

3. **Existing Infrastructure Used:**
   - `/lib/match/mapRoomToMatchState.ts`: Detects forfeit events and endedReason
   - Realtime subscriptions for match_events and match_rooms

## Benefits

### 1. Real-time Synchronization
- No polling required
- Both players see updates instantly
- Uses Supabase realtime subscriptions

### 2. Data Integrity
- Edits validated at database level
- Can't edit visits to invalid states
- Remaining recalculated for all subsequent visits

### 3. Atomic Operations
- RPC functions ensure all-or-nothing updates
- No race conditions
- Server-side validation

### 4. Clean State Management
- Visit data stored in match_events (not separate tables)
- Forfeit creates event and updates room status
- Single source of truth

## Result

Edit Visit and Forfeit now work correctly with match_events:

✅ **Edit Visit:**
- Updates both users' screens instantly
- Validates scores properly
- Rejects negative remaining
- Allows checkouts (0 remaining)
- Shows appropriate error/success messages

✅ **Forfeit:**
- Forfeiter navigates to /app/play
- Opponent sees "Opponent Forfeited" modal
- Match status updated correctly
- Winner determined properly
- No orphaned state

Both features use the match_events table as the source of truth and leverage Supabase realtime for instant synchronization.
