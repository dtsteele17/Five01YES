# Quick Match Visit History Update

## Overview

Updated Quick Match adapter to render Visit History exactly like private matches, with proper turn numbering and consistent event type handling.

## Changes Made

### 1. Database Migration - Event Type Standardization

**Migration:** `change_quick_match_event_type_to_visit`

**Changed:**
- Updated `submit_quick_match_throw()` RPC function
- Event type changed from `'throw'` back to `'visit'`
- Aligns with private match event types for consistency

**Impact:**
- All new Quick Match visits will use `event_type = 'visit'`
- Makes adapter compatible with both quick match and private match formats
- Simplifies event filtering logic

### 2. Adapter Updates - `lib/match/mapRoomToMatchState.ts`

#### Interface Updates

**MatchEvent Interface:**
```typescript
interface MatchEvent {
  id: string;
  player_id: string;
  seq: number;
  event_type: string;
  score?: number;              // Added: direct score field
  remaining_after?: number;    // Added: direct remaining field
  payload: {
    score?: number;            // Made optional
    remaining?: number;        // Made optional
    is_bust?: boolean;         // Made optional
    is_checkout?: boolean;     // Made optional
    leg?: number;              // Made optional
  };
  created_at: string;
}
```

**MatchStateVisit Interface:**
```typescript
export interface MatchStateVisit {
  id: string;
  playerId: string;
  playerName: string;
  by: 'you' | 'opponent';
  label: string;
  score: number;
  remainingAfter: number;
  leg: number;                 // Added
  turnNumberInLeg: number;     // Added
  isBust: boolean;
  isCheckout: boolean;
  createdAt: string;
}
```

#### Event Filtering

**Before:**
```typescript
const currentLegEvents = events.filter(e => {
  return e.event_type === 'throw' && e.payload.leg === room.current_leg;
});
```

**After:**
```typescript
const currentLegEvents = events.filter(e => {
  return e.event_type === 'visit' &&
    (e.payload.leg === room.current_leg ||
     (!e.payload.leg && room.current_leg === 1));
});
```

**Improvements:**
- Filters for `'visit'` event type
- Handles events without leg field (defaults to leg 1)
- More robust filtering logic

#### Turn Number Computation

**Implementation:**
```typescript
// Compute turnNumberInLeg for each player by counting visits per player per leg
const playerTurnCounts: { [playerId: string]: number } = {};

const visitHistory: MatchStateVisit[] = currentLegEvents.map(e => {
  // Increment turn count for this player
  if (!playerTurnCounts[e.player_id]) {
    playerTurnCounts[e.player_id] = 0;
  }
  playerTurnCounts[e.player_id]++;
  const turnNumberInLeg = playerTurnCounts[e.player_id];

  // ... rest of mapping
});
```

**How It Works:**
1. Maintains a counter per player ID
2. Increments counter for each visit by that player
3. Turn number represents "which turn for this player in this leg"
4. Resets automatically when leg changes (new filter on current leg)

#### Flexible Field Access

**Score Handling:**
```typescript
const score = e.score ?? e.payload.score ?? 0;
```

**Remaining Handling:**
```typescript
const remainingAfter = e.remaining_after ?? e.payload.remaining ?? 0;
```

**Leg Handling:**
```typescript
const leg = e.payload.leg ?? room.current_leg;
```

**Benefits:**
- Works with events that have direct fields
- Falls back to payload fields for compatibility
- Provides sensible defaults (0 for scores, current leg for leg)

#### Label Formatting

**Before:**
```typescript
label: isCurrentUser ? 'YOU' : playerName,
```

**After:**
```typescript
label: isCurrentUser ? 'YOU' : playerName.toUpperCase(),
```

**Change:**
- Opponent names are now uppercase
- Matches private match format exactly
- Consistent badge styling

### 3. UI Updates - Quick Match Page

**Visit Display Update:**

**Before:**
```typescript
<span className="text-gray-500 text-xs">
  #{matchState.visitHistory.length - idx}
</span>
```

**After:**
```typescript
<span className="text-gray-500 text-xs">
  #{visit.turnNumberInLeg}
</span>
```

**Improvement:**
- Uses computed turnNumberInLeg from adapter
- Shows per-player turn number (not global index)
- Matches private match format: "YOU #2" or "OPPONENT #3"

## Visit History Format

### Display Format

Each visit displays:
```
[BADGE: YOU/OPPONENT] #N  SCORE → REMAINING  [BUST/CHECKOUT]
```

**Example:**
```
YOU #1        39 → 462
OPPONENT #1   45 → 456
YOU #2        80 → 382
OPPONENT #2   100 → 356  BUST
YOU #3        60 → 322
OPPONENT #3   81 → 275  CHECKOUT
```

### Turn Numbering

**Per-Player Counting:**
- Each player has their own turn count
- Turn #1 = first visit by that player in this leg
- Turn #2 = second visit by that player in this leg
- Continues until leg completes

**Leg Reset:**
- When a new leg starts, turn counters reset
- Events filtered to current leg only
- Previous leg history not shown (matches local behavior)

### Sorting

**Display Order:**
- Newest visits first (`.reverse()`)
- Shows chronological progression from top to bottom
- Latest visit at top of list

## Data Flow

### Submit Score Flow

```
User submits score
  ↓
RPC: submit_quick_match_throw(room_id, score)
  ↓
Server validates and calculates
  ↓
Insert event with event_type = 'visit'
  ↓
Event payload includes:
  - score
  - remaining
  - is_bust
  - is_checkout
  - leg
  ↓
Realtime broadcasts to both users
  ↓
Adapter receives event
  ↓
Adapter filters for 'visit' events in current leg
  ↓
Adapter computes turnNumberInLeg
  ↓
Adapter maps to MatchStateVisit objects
  ↓
UI displays with badges and turn numbers
```

### Adapter Processing

```
mapRoomToMatchState(room, events, profiles, currentUserId)
  ↓
Filter events: event_type === 'visit' AND leg === current_leg
  ↓
Sort by seq (implicit from query order)
  ↓
For each event:
  1. Increment player turn counter
  2. Get score (event.score || payload.score)
  3. Get remaining (event.remaining_after || payload.remaining)
  4. Get leg (payload.leg || current_leg)
  5. Determine label (YOU vs OPPONENT)
  6. Map to MatchStateVisit
  ↓
Return visitHistory array
```

## Compatibility

### Works With

**Direct Fields:**
- `event.score` (if present)
- `event.remaining_after` (if present)

**Payload Fields:**
- `event.payload.score` (fallback)
- `event.payload.remaining` (fallback)
- `event.payload.leg` (fallback)
- `event.payload.is_bust`
- `event.payload.is_checkout`

**Default Handling:**
- Missing score → 0
- Missing remaining → 0
- Missing leg → current room leg
- Missing bust/checkout → false

### Event Types Supported

**Primary:**
- `event_type === 'visit'` (main data source)

**Ignored:**
- System events (forfeit, etc.)
- Other event types
- Events from other legs

## Testing Checklist

### Visit Display
- [ ] Start Quick Match
- [ ] Submit multiple scores
- [ ] Verify both players see all visits
- [ ] Verify turn numbers increment correctly
- [ ] Verify format matches: "YOU #2 45 → 456"

### Turn Numbering
- [ ] Player 1 submits scores
- [ ] Verify Player 1's turns show: #1, #2, #3, etc.
- [ ] Player 2 submits scores
- [ ] Verify Player 2's turns show: #1, #2, #3, etc.
- [ ] Verify turn numbers are independent per player

### Leg Transitions
- [ ] Complete a leg (checkout)
- [ ] Start new leg
- [ ] Verify visit history clears
- [ ] Verify turn numbers reset to #1 for both players

### Labels
- [ ] Verify your visits show "YOU" badge
- [ ] Verify opponent visits show opponent name (uppercase)
- [ ] Verify badge colors: teal for YOU, slate for opponent

### Special Cases
- [ ] Verify BUST badge shows on bust visits
- [ ] Verify CHECKOUT badge shows on checkout visits
- [ ] Verify busts maintain correct remaining value
- [ ] Verify visits display newest first

## Files Modified

1. **Migration:** `supabase/migrations/change_quick_match_event_type_to_visit.sql`
   - Changed RPC to insert 'visit' events

2. **Adapter:** `lib/match/mapRoomToMatchState.ts`
   - Updated MatchEvent interface
   - Updated MatchStateVisit interface
   - Added turnNumberInLeg computation
   - Added flexible field access (score, remaining_after)
   - Fixed label formatting (uppercase opponent names)

3. **UI:** `app/app/play/quick-match/match/[matchId]/page.tsx`
   - Updated turn number display to use visit.turnNumberInLeg

## Benefits

### Consistency
- Quick Match now matches private match format exactly
- Same event types across game modes
- Unified adapter logic

### Clarity
- Turn numbers show per-player progression
- Clear indication of whose turn it is
- Easy to track game flow

### Maintainability
- Single event type to handle ('visit')
- Flexible field access for compatibility
- Type-safe with proper interfaces

### User Experience
- Professional, consistent UI
- Clear visit history
- Real-time updates for both players

## Build Status

✅ Build successful
✅ Type checking passed
✅ No errors or warnings (except browserslist deprecation)

Ready for testing and deployment.
