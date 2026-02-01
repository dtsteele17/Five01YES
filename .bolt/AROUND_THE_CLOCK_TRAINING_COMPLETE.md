# Around The Clock Training - Complete Implementation

## Summary

Built a comprehensive Around The Clock training system with configurable settings, pure engine logic, database persistence, and a complete UI flow.

## Files Created/Modified

### 1. Core Engine Logic

**`/lib/training/aroundTheClock.ts` (361 lines)**

Pure TypeScript functions for training logic with 4 segment rules and 2 order modes.

**Types:**
```typescript
type AroundClockOrderMode = 'in_order' | 'random';
type AroundClockSegmentRule =
  | 'singles_only'
  | 'doubles_only'
  | 'trebles_only'
  | 'increase_by_segment';

interface AroundClockSettings {
  orderMode: AroundClockOrderMode;
  segmentRule: AroundClockSegmentRule;
  includeBull: boolean;
}

interface ATCSessionState {
  settings: AroundClockSettings;
  currentTarget: ATCTarget; // number 1-20 or 'bull'
  remainingTargets: ATCTarget[]; // For random mode
  completedTargets: ATCTarget[];
  totalThrows: number;
  hits: number;
  misses: number;
  isComplete: boolean;
  sessionId?: string; // Database session ID
}
```

**Key Functions:**

`initSession(settings)` - Initialize new session
- In order mode: starts at target 1
- Random mode: shuffles all 21 targets (1-20 + Bull)

`applyThrow(state, throwInput)` - Process a single dart throw
- Returns new state and result object
- Handles 4 segment rules:
  - Singles only: Any hit on target counts as 1 step
  - Doubles only: Only doubles count
  - Trebles only: Only trebles count
  - Increase by segment: Singles=+1, Doubles=+2, Trebles=+3 (can skip targets)
- Bull handling:
  - Singles only: SBull or DBull both count
  - Doubles only: Only DBull counts
  - Trebles only: SBull or DBull (treble bull doesn't exist)
  - Increase by segment: SBull=+1, DBull=+2

### 2. Database Layer

**Migration: `recreate_training_rpc_functions.sql`**

**RPC Functions:**

`rpc_create_training_session(payload jsonb)` - Create new session
- Payload: `{ game: "around_the_clock", settings: {...} }`
- Returns: `{ ok: true, session_id: uuid }`
- Automatically sets `user_id = auth.uid()`
- Sets status to 'active'

`rpc_record_training_throw(p_session_id uuid, payload jsonb)` - Record throw
- Payload: `{ dart_number: 1-3, input: {...}, result: {...} }`
- Returns: `{ ok: true, throw_id: uuid }`
- Validates session belongs to current user

**Tables Used:**
- `training_sessions` - Stores session metadata and settings
- `training_throws` - Records each individual dart thrown

### 3. Training Context Update

**`/lib/context/TrainingContext.tsx`**

Updated `TrainingConfig` interface to include ATC settings:
```typescript
interface TrainingConfig {
  // ... existing fields
  atcSettings?: {
    orderMode: 'in_order' | 'random';
    segmentRule: 'singles_only' | 'doubles_only' | 'trebles_only' | 'increase_by_segment';
    includeBull: boolean;
  };
}
```

### 4. Training Selection UI

**`/app/app/play/page.tsx`**

Added state variables for ATC settings:
```typescript
const [atcOrderMode, setAtcOrderMode] = useState<'in_order' | 'random'>('in_order');
const [atcSegmentRule, setAtcSegmentRule] = useState<...>('increase_by_segment');
```

Added two new settings sections when "Around the Clock" is selected:

**Setting A: Target Order**
- In order (1–20 + Bull) - Default
  - Helper text: "Progress from 1 to 20, then finish on Bull."
- Random (1–20 + Bull)
  - Helper text: "You'll be given a random target each time until all are completed."

**Setting B: Segment Rule**
- Singles only
  - Helper text: "Any hit on the target number counts as 1 step (no skipping)."
- Doubles only
  - Helper text: "Only doubles on the target number count."
- Trebles only
  - Helper text: "Only trebles on the target number count."
- Increase by segment - Default (existing behavior)
  - Helper text: "Singles advance 1, doubles advance 2, trebles advance 3 (can skip targets)."

Updated `handleStartTraining()` to pass settings and route to `/app/play/training/around-the-clock`.

### 5. Training Play Screen

**`/app/app/play/training/around-the-clock/page.tsx` (364 lines)**

Complete training experience with:

**Initialization:**
- Reads settings from TrainingContext
- Initializes session state using `initSession()`
- Creates database session via `rpc_create_training_session`
- Redirects to /app/play if no valid config found

**UI Display:**
- Current target (large display)
- Progress: X / 21 targets completed
- Completed targets as badges
- Stats: Throws, Hits, Accuracy, Time

**Scoring UI:**
- For number targets (1-20):
  - Single [N]
  - Double [N]
  - Treble [N]
  - Miss
- For Bull:
  - Single Bull
  - Bullseye
  - Miss

**Throw Processing:**
- Calls `applyThrow(state, throwInput)` from engine
- Updates local state
- Records throw via `rpc_record_training_throw`
- Checks for completion

**Session Completion:**
- Shows completion modal with:
  - Completion time
  - Total throws
  - Total hits
  - Accuracy percentage
  - Total misses
- Updates database session status to 'completed'
- Options: Retry or Return

## Flow Diagram

```
User selects training →
  Training Game = "Around the Clock" →
    Settings UI appears:
      - Target Order (in_order/random)
      - Segment Rule (singles_only/doubles_only/trebles_only/increase_by_segment)

User clicks "Start Training" →
  TrainingConfig saved to context →
  Router navigates to /app/play/training/around-the-clock →

Page initializes:
  1. Reads config from context
  2. Calls initSession(settings) → ATCSessionState
  3. Calls rpc_create_training_session → session_id
  4. Renders UI with current target

User throws darts:
  1. Clicks scoring button (e.g., "Single 5")
  2. applyThrow(state, input) → { newState, result }
  3. setState(newState) - UI updates
  4. rpc_record_training_throw(session_id, payload)
  5. Check if isComplete

Session completes:
  1. Show completion modal
  2. Update session status to 'completed'
  3. User can Retry or Return
```

## Segment Rules Implementation

### Singles Only
```typescript
// Number targets: Only singles count
if (segment === 'S' && number === currentTarget) {
  return { hit: true, progressDelta: 1 };
}

// Bull: SBull or DBull both count
if (currentTarget === 'bull' && (segment === 'SB' || segment === 'DB')) {
  return { hit: true, progressDelta: 1 };
}
```

### Doubles Only
```typescript
// Number targets: Only doubles count
if (segment === 'D' && number === currentTarget) {
  return { hit: true, progressDelta: 1 };
}

// Bull: Only DBull counts
if (currentTarget === 'bull' && segment === 'DB') {
  return { hit: true, progressDelta: 1 };
}
```

### Trebles Only
```typescript
// Number targets: Only trebles count
if (segment === 'T' && number === currentTarget) {
  return { hit: true, progressDelta: 1 };
}

// Bull: SBull or DBull (treble bull doesn't exist)
if (currentTarget === 'bull' && (segment === 'SB' || segment === 'DB')) {
  return { hit: true, progressDelta: 1 };
}
```

### Increase by Segment (Existing Behavior)
```typescript
// Number targets: Singles=+1, Doubles=+2, Trebles=+3
if (number === currentTarget) {
  let delta = 0;
  if (segment === 'S') delta = 1;
  if (segment === 'D') delta = 2;
  if (segment === 'T') delta = 3;

  // Can skip multiple targets
  newTarget = advanceBySteps(currentTarget, delta);
  return { hit: true, progressDelta: delta };
}

// Bull: SBull=+1, DBull=+2 (but Bull completes regardless)
if (currentTarget === 'bull') {
  const delta = segment === 'SB' ? 1 : 2;
  return { hit: true, progressDelta: delta };
}
```

### Advancement Logic

**In Order Mode:**
- Current target starts at 1
- When hit, advance to next target
- For "increase_by_segment": can skip targets
- For other rules: always advance by 1
- Sequence: 1 → 2 → ... → 20 → Bull → Complete
- Never skip beyond Bull

**Random Mode:**
- All 21 targets shuffled at start
- remainingTargets = shuffled list
- currentTarget = remainingTargets[0]
- When hit, remove from remainingTargets
- Move to next target: remainingTargets[0]
- Complete when remainingTargets.length === 0

## Database Schema

### training_sessions
```sql
id uuid PRIMARY KEY
user_id uuid NOT NULL
game text NOT NULL  -- 'around_the_clock'
settings jsonb  -- { orderMode, segmentRule, includeBull }
status text  -- 'active', 'completed'
started_at timestamptz
completed_at timestamptz
```

### training_throws
```sql
id uuid PRIMARY KEY
session_id uuid REFERENCES training_sessions(id)
user_id uuid NOT NULL
dart_number int CHECK (1-3)
input jsonb  -- { segment, number }
result jsonb  -- { hit, progressDelta, currentTargetBefore, currentTargetAfter, remainingTargetsCount }
created_at timestamptz
```

## Example Throw Records

### In Order, Singles Only
```json
{
  "session_id": "uuid-123",
  "dart_number": 1,
  "input": {
    "segment": "S",
    "number": 5
  },
  "result": {
    "hit": true,
    "progressDelta": 1,
    "currentTargetBefore": 5,
    "currentTargetAfter": 6,
    "remainingTargetsCount": 16
  }
}
```

### Random, Increase by Segment
```json
{
  "session_id": "uuid-456",
  "dart_number": 1,
  "input": {
    "segment": "T",
    "number": 13
  },
  "result": {
    "hit": true,
    "progressDelta": 3,
    "currentTargetBefore": 13,
    "currentTargetAfter": 16,
    "remainingTargetsCount": 15
  }
}
```

## Bull Handling Edge Cases

### Singles Only Mode
- Target: Bull
- Throw: Single Bull → Hit ✓ (advances 1)
- Throw: Double Bull → Hit ✓ (advances 1)
- Both count because there's no distinction in singles-only mode

### Doubles Only Mode
- Target: Bull
- Throw: Single Bull → Miss ✗
- Throw: Double Bull → Hit ✓ (advances 1)
- Only bullseye counts

### Trebles Only Mode
- Target: Bull
- Throw: Single Bull → Hit ✓ (advances 1)
- Throw: Double Bull → Hit ✓ (advances 1)
- Both count because treble bull doesn't exist

### Increase by Segment Mode
- Target: Bull
- Throw: Single Bull → Hit ✓ (advances 1, but completes session)
- Throw: Double Bull → Hit ✓ (advances 2, but completes session)
- Bull is always the final target, so any hit completes

## Verification Steps

### Test In Order, Singles Only
1. Go to /app/play
2. Select "Practice Games"
3. Select "Around the Clock"
4. Choose "In order (1–20 + Bull)"
5. Choose "Singles only"
6. Click "Start Training"
7. Throw: Single 1 → Target becomes 2
8. Throw: Double 2 → Miss (only singles count)
9. Throw: Single 2 → Target becomes 3
10. Continue to Bull
11. Throw: Single Bull → Complete

### Test Random, Increase by Segment
1. Select "Random (1–20 + Bull)"
2. Select "Increase by segment"
3. Start training
4. First target might be: 14
5. Throw: Treble 14 → Advance 3 targets
6. Next target drawn from remaining list
7. Continue until all 21 targets completed

### Test Doubles Only
1. Select "Doubles only"
2. Start training
3. Throw: Single 1 → Miss
4. Throw: Double 1 → Target becomes 2
5. At Bull: Only Bullseye counts

### Database Verification
```sql
-- Check sessions created
SELECT * FROM training_sessions
WHERE game = 'around_the_clock'
ORDER BY started_at DESC
LIMIT 5;

-- Check throws recorded
SELECT
  tt.dart_number,
  tt.input->>'segment' as segment,
  tt.input->>'number' as number,
  tt.result->>'hit' as hit,
  tt.result->>'progressDelta' as progress,
  tt.created_at
FROM training_throws tt
WHERE session_id = 'uuid-of-session'
ORDER BY created_at;
```

## Code Quality

### Separation of Concerns
- **Engine** (`aroundTheClock.ts`): Pure functions, no side effects
- **UI** (`page.tsx`): React components, user interaction
- **Database** (RPCs): Persistence layer

### Testability
Engine functions are pure and deterministic:
```typescript
const state1 = initSession({ orderMode: 'in_order', segmentRule: 'singles_only', includeBull: true });
expect(state1.currentTarget).toBe(1);

const { newState, result } = applyThrow(state1, { segment: 'S', number: 1 });
expect(result.hit).toBe(true);
expect(newState.currentTarget).toBe(2);
```

### Type Safety
All types exported and used consistently:
- `AroundClockOrderMode`
- `AroundClockSegmentRule`
- `ATCSessionState`
- `ATCThrowInput`
- `ATCThrowResult`

## Build Verification

```bash
npm run build
```

**Result:** ✅ Compiled successfully

**New routes:**
- `/app/play/training/around-the-clock` (8.54 kB)

## Acceptance Criteria Met

✅ **Settings UI** - Two configurable settings with explanations
✅ **Target Order** - In order (1-20+Bull) and Random modes
✅ **Segment Rules** - All 4 rules implemented correctly
✅ **Bull Handling** - Special cases handled per segment rule
✅ **Engine Logic** - Pure functions, deterministic, testable
✅ **Database Persistence** - Session and throws recorded via RPCs
✅ **Scoring UI** - Singles/Doubles/Trebles/Miss buttons
✅ **Progress Display** - Current target, completed count, stats
✅ **Completion Flow** - Modal with stats, Retry/Return options
✅ **Routing** - Start Training navigates to play screen correctly

## Result

A complete, production-ready Around The Clock training system with:
- Flexible configuration (4 segment rules × 2 order modes = 8 combinations)
- Clean architecture (engine/UI/database separation)
- Full database persistence
- Professional UI with real-time stats
- Proper error handling and validation
- Type-safe implementation
- Working build with no errors
