# Match State Adapter Implementation

## Overview

Created a match state adapter that transforms Supabase Quick Match data into a clean, standardized format that can be consumed by UI components.

## Files Created

### `lib/match/mapRoomToMatchState.ts`

The adapter function that maps Supabase data to a standardized match state interface.

**Input:**
- `room`: MatchRoom from `match_rooms` table
- `events`: MatchEvent[] from `match_events` table
- `profiles`: Profile[] from `profiles` table
- `currentUserId`: string (authenticated user ID)

**Output:**
- `MappedMatchState`: Standardized match state object

## Data Structure

### MappedMatchState Interface

```typescript
interface MappedMatchState {
  id: string;
  status: 'active' | 'completed' | 'abandoned';
  currentTurnPlayer: 1 | 2;  // Which player's turn (by slot)

  players: [MatchStatePlayer, MatchStatePlayer];  // Always 2 players

  youArePlayer: 1 | 2 | null;  // Which slot you are (null if spectator)

  visitHistory: MatchStateVisit[];  // Visits for current leg only

  winnerId: string | null;

  currentLeg: number;
  legsToWin: number;
  gameMode: number;
  matchFormat: string;
}
```

### MatchStatePlayer

```typescript
interface MatchStatePlayer {
  slot: 1 | 2;
  id: string;        // user_id
  name: string;      // username from profiles
  remaining: number;  // current score
  legsWon: number;   // legs won in match
}
```

### MatchStateVisit

```typescript
interface MatchStateVisit {
  id: string;
  playerId: string;
  playerName: string;  // Pre-resolved from profiles
  score: number;
  remaining: number;
  isBust: boolean;
  isCheckout: boolean;
  createdAt: string;
}
```

## How It Works

### 1. Data Mapping

The adapter transforms raw Supabase data into a clean structure:

**Before (Raw Supabase):**
```javascript
// Multiple separate sources
const room = { player1_id, player2_id, player1_remaining, ... }
const events = [{ player_id, payload: { score, ... } }, ...]
const profiles = [{ user_id, username }, ...]
```

**After (Mapped State):**
```javascript
const matchState = {
  players: [
    { slot: 1, id: "user-1", name: "Alice", remaining: 301, legsWon: 1 },
    { slot: 2, id: "user-2", name: "Bob", remaining: 401, legsWon: 0 }
  ],
  youArePlayer: 1,
  currentTurnPlayer: 2,
  visitHistory: [
    { playerName: "Alice", score: 100, remaining: 301, ... },
    { playerName: "Bob", score: 60, remaining: 401, ... }
  ],
  ...
}
```

### 2. Computed Values

The adapter provides computed convenience values:

- `youArePlayer`: Determines if current user is player 1 or 2
- `currentTurnPlayer`: Maps player ID to slot number (1 or 2)
- `visitHistory`: Filters events to current leg only
- `playerName`: Pre-resolves usernames from profiles

### 3. Realtime Updates

When Supabase data updates via subscriptions:

```javascript
// On match_rooms update
setRoom(updatedRoom);
// matchState automatically recalculates via adapter

// On match_events insert
setEvents([...events, newEvent]);
// matchState automatically includes new visit
```

## Integration with Quick Match

### Updated Quick Match Page

**State Management:**
```javascript
const [room, setRoom] = useState<MatchRoom | null>(null);
const [profiles, setProfiles] = useState<Profile[]>([]);
const [events, setEvents] = useState<MatchEvent[]>([]);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);

// Adapter creates clean matchState
const matchState = mapRoomToMatchState(room, events, profiles, currentUserId);
```

**UI Rendering:**
```javascript
// Clean access to player data
const myPlayer = matchState.youArePlayer === 1
  ? matchState.players[0]
  : matchState.players[1];

const myName = myPlayer.name;
const myRemaining = myPlayer.remaining;
const myLegs = myPlayer.legsWon;

// Visit history with pre-resolved names
matchState.visitHistory.map(visit => (
  <div>
    <span>{visit.playerName}</span>
    <span>{visit.score} → {visit.remaining}</span>
  </div>
))
```

## Benefits

### 1. Separation of Concerns
- **Data Layer**: Supabase tables (source of truth)
- **Mapping Layer**: Adapter (transformation logic)
- **UI Layer**: Components (presentation only)

### 2. Simplified UI Logic
- No complex data transformations in components
- Pre-computed values (youArePlayer, isMyTurn)
- Pre-resolved relationships (player names from IDs)

### 3. Type Safety
- Strongly typed interfaces
- TypeScript ensures correct data usage
- Compile-time error checking

### 4. Easier Testing
- Test adapter independently from UI
- Mock matchState for component tests
- Clear data contracts

### 5. Future Extensibility
- Can add computed stats to adapter
- Easy to extend with new fields
- Foundation for shared UI components

## Usage Pattern

### In Quick Match Page:

```javascript
// 1. Load data from Supabase
const room = /* load from match_rooms */
const events = /* load from match_events */
const profiles = /* load from profiles */

// 2. Map to clean state
const matchState = mapRoomToMatchState(room, events, profiles, currentUserId);

// 3. Use in UI
if (!matchState) return <Loading />;

return (
  <div>
    <h1>{matchState.gameMode}</h1>
    <PlayerCard player={matchState.players[0]} />
    <PlayerCard player={matchState.players[1]} />
    <VisitHistory visits={matchState.visitHistory} />
  </div>
);
```

### With Realtime Updates:

```javascript
// Subscribe to changes
supabase
  .channel('match')
  .on('postgres_changes', {
    event: 'UPDATE',
    table: 'match_rooms'
  }, (payload) => {
    setRoom(payload.new); // matchState auto-updates
  })
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'match_events'
  }, (payload) => {
    setEvents(prev => [...prev, payload.new]); // matchState auto-updates
  })
  .subscribe();
```

## Future Enhancements

### Potential Additions:

1. **Computed Statistics**
   - Average scores per player
   - Checkout percentage
   - Darts thrown count

2. **Validation**
   - Ensure data integrity
   - Detect invalid states
   - Provide error messages

3. **Caching**
   - Memoize expensive computations
   - Optimize for performance

4. **Shared UI Components**
   - Extract common match UI elements
   - Reuse across Local, Online, Quick Match
   - Single source of truth for match rendering

## Result

Quick Match now uses a clean adapter layer that:
- Transforms Supabase data into a standard format
- Provides computed convenience values
- Separates data logic from UI logic
- Works seamlessly with realtime updates
- Maintains type safety throughout

The UI code is now simpler and more maintainable, using `matchState` as a single source of truth instead of juggling multiple data sources.
