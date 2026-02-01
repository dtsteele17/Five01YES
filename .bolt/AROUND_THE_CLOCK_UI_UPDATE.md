# Around The Clock Training - UI Update

## Summary

Updated the Around The Clock training system with dropdown settings, mode-specific throw buttons, 3-dart visit tracking, and full visit history display.

## Changes Made

### 1. Settings UI - Dropdowns Instead of Radio Groups

**File:** `/app/app/play/page.tsx`

**Before:** Large radio button cards with full descriptions
**After:** Compact Select dropdowns with explanations above

```tsx
// Target Order Dropdown
<label className="text-sm font-medium text-white mb-2 block">Target order</label>
<p className="text-xs text-gray-400 mb-2">Choose how the targets are presented during the session.</p>
<Select value={atcOrderMode} onValueChange={(v) => setAtcOrderMode(v as 'in_order' | 'random')}>
  <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
    <SelectValue />
  </SelectTrigger>
  <SelectContent className="bg-slate-800 border-emerald-500/30">
    <SelectItem value="in_order">In order (1–20 + Bull)</SelectItem>
    <SelectItem value="random">Random (1–20 + Bull)</SelectItem>
  </SelectContent>
</Select>

// Segment Rule Dropdown
<label className="text-sm font-medium text-white mb-2 block">Segment rule</label>
<p className="text-xs text-gray-400 mb-2">Choose what counts as a valid hit and how progress advances.</p>
<Select value={atcSegmentRule} onValueChange={(v) => setAtcSegmentRule(v as any)}>
  <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
    <SelectValue />
  </SelectTrigger>
  <SelectContent className="bg-slate-800 border-emerald-500/30">
    <SelectItem value="singles_only">Singles only</SelectItem>
    <SelectItem value="doubles_only">Doubles only</SelectItem>
    <SelectItem value="trebles_only">Trebles only</SelectItem>
    <SelectItem value="increase_by_segment">Increase by segment</SelectItem>
  </SelectContent>
</Select>
```

**Benefits:**
- More compact UI
- Easier to scan settings
- Consistent with other dropdowns in the app
- Explanation text still visible above each dropdown

### 2. Mode-Specific Throw Buttons

**File:** `/app/app/play/training/around-the-clock/page.tsx`

Implemented `renderThrowButtons()` function that shows only valid buttons based on:
- Current target (1-20 or Bull)
- Selected segment rule

#### Singles Only Mode

**For number targets (1-20):**
```tsx
<Button onClick={() => handleDart('S', targetNumber)}>S{targetNumber}</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

**For Bull:**
```tsx
<Button onClick={() => handleDart('SB')}>SBull</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

#### Doubles Only Mode

**For number targets (1-20):**
```tsx
<Button onClick={() => handleDart('D', targetNumber)}>D{targetNumber}</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

**For Bull:**
```tsx
<Button onClick={() => handleDart('DB')}>DBull</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

#### Trebles Only Mode

**For number targets (1-20):**
```tsx
<Button onClick={() => handleDart('T', targetNumber)}>T{targetNumber}</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

**For Bull (treble bull doesn't exist):**
```tsx
<Button onClick={() => handleDart('SB')}>SBull</Button>
<Button onClick={() => handleDart('DB')}>DBull</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

#### Increase by Segment Mode

**For number targets (1-20):**
```tsx
<Button onClick={() => handleDart('S', targetNumber)}>S{targetNumber}</Button>
<Button onClick={() => handleDart('D', targetNumber)}>D{targetNumber}</Button>
<Button onClick={() => handleDart('T', targetNumber)}>T{targetNumber}</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

**For Bull:**
```tsx
<Button onClick={() => handleDart('SB')}>SBull</Button>
<Button onClick={() => handleDart('DB')}>DBull</Button>
<Button onClick={() => handleDart('MISS')}>Miss</Button>
```

**Key Features:**
- Only shows buttons valid for current segment rule
- No confusion about which button to press
- Prevents invalid throws
- Clean, focused UI

### 3. Current Visit (3-Dart) Tracking

Added state variables:
```tsx
const [currentVisit, setCurrentVisit] = useState<DartThrow[]>([]);
const [dartNumberInVisit, setDartNumberInVisit] = useState<number>(1);
```

**Interface:**
```tsx
interface DartThrow {
  segment: ATCSegment;
  number?: number;
  label: string;  // Display label like "S5", "DBull", "Miss"
}
```

**Logic in `handleDart()`:**
```tsx
// Create dart throw with label
const dartThrow: DartThrow = { segment, number, label };

// Add to current visit
const newCurrentVisit = [...currentVisit, dartThrow];
setCurrentVisit(newCurrentVisit);

// Record with cycling dart_number (1, 2, 3, 1, 2, 3, ...)
recordThrow(dartNumberInVisit, throwInput, result);

// Check if visit complete (3 darts)
if (newCurrentVisit.length === 3) {
  // Move to history
  setVisitHistory(prev => [...prev, { darts: newCurrentVisit }]);
  // Reset current visit
  setCurrentVisit([]);
  // Reset dart number back to 1
  setDartNumberInVisit(1);
} else {
  // Increment for next throw
  setDartNumberInVisit(dartNumberInVisit + 1);
}
```

**Display:**
```tsx
{currentVisit.length > 0 && (
  <Card className="bg-slate-800/50 border-slate-700 p-4">
    <div className="text-sm font-semibold text-white mb-2">Current Visit</div>
    <div className="flex gap-4">
      {currentVisit.map((dart, idx) => (
        <div key={idx} className="text-slate-300">
          <span className="text-slate-500">Dart {idx + 1}:</span> {formatThrowLabel(dart)}
        </div>
      ))}
    </div>
  </Card>
)}
```

**Example Display:**
```
Current Visit
Dart 1: S5   Dart 2: Miss   Dart 3: T10
```

After 3 darts, this card disappears and resets for the next visit.

### 4. Full Visit History

Added state variable:
```tsx
const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
```

**Interface:**
```tsx
interface Visit {
  darts: DartThrow[];  // Array of 3 darts
}
```

**Display:**
```tsx
{visitHistory.length > 0 && (
  <Card className="bg-slate-800/50 border-slate-700 p-4">
    <div className="text-sm font-semibold text-white mb-3">Visit History</div>
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {visitHistory.map((visit, visitIdx) => (
        <div key={visitIdx} className="text-slate-300 text-sm">
          <span className="text-slate-500">Visit {visitIdx + 1}:</span>{' '}
          {visit.darts.map((dart, dartIdx) => (
            <span key={dartIdx}>
              {formatThrowLabel(dart)}
              {dartIdx < visit.darts.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  </Card>
)}
```

**Example Display:**
```
Visit History
Visit 1: Miss, Miss, T10
Visit 2: S10, Miss, Miss
Visit 3: S11, D11, Miss
Visit 4: T12, S12, S12
```

**Features:**
- Scrollable list (max-height: 16rem / 256px)
- Shows all completed visits
- Chronological order (oldest first)
- Comma-separated darts within each visit

### 5. Database Recording

**Dart Number Cycling:**
- Darts recorded with `dart_number` cycling 1-3
- After 3 darts, resets back to 1
- Maintains proper visit grouping in database

**Example throws in database:**
```sql
-- Visit 1
dart_number: 1, input: {segment: 'MISS', ...}
dart_number: 2, input: {segment: 'MISS', ...}
dart_number: 3, input: {segment: 'T', number: 10, ...}

-- Visit 2
dart_number: 1, input: {segment: 'S', number: 10, ...}
dart_number: 2, input: {segment: 'MISS', ...}
dart_number: 3, input: {segment: 'MISS', ...}
```

**RPC Call:**
```tsx
const recordThrow = async (dartNumber: number, input: ATCThrowInput, result: any) => {
  if (!state?.sessionId) return;

  const supabase = createClient();

  try {
    const { error } = await supabase.rpc('rpc_record_training_throw', {
      p_session_id: state.sessionId,
      payload: {
        dart_number: dartNumber,  // 1, 2, or 3
        input: input,
        result: result,
      },
    });

    if (error) {
      console.error('[ATC] Failed to record throw:', error);
    }
  } catch (err) {
    console.error('[ATC] Exception recording throw:', err);
  }
};
```

### 6. Retry Functionality

Updated `handleRetry()` to reset all visit tracking:
```tsx
const handleRetry = () => {
  if (!config?.atcSettings) return;

  const initialState = initSession(config.atcSettings);
  setState(initialState);
  setStartTime(Date.now());
  setCurrentVisit([]);          // Reset current visit
  setVisitHistory([]);          // Clear visit history
  setDartNumberInVisit(1);      // Reset dart number
  createTrainingSession(config.atcSettings);
};
```

## UI Flow Examples

### Singles Only - Target 5

**Display:**
```
Current Target: 5
Progress: 4 / 21
Completed: 1, 2, 3, 4

[S5 Button] [Miss Button]
```

**After throwing S5, Miss, S5:**
```
Current Visit
Dart 1: S5   Dart 2: Miss   Dart 3: S5

Visit History
Visit 1: S5, Miss, S5
```

### Doubles Only - Target Bull

**Display:**
```
Current Target: BULL
Progress: 20 / 21
Completed: 1, 2, 3, ... 20

[DBull Button] [Miss Button]
```

**After throwing Miss, Miss, DBull:**
```
Current Visit
(empty - visit just completed)

Visit History
Visit 1: Miss, Miss, DBull
```

### Trebles Only - Target 13

**Display:**
```
Current Target: 13
Progress: 12 / 21

[T13 Button] [Miss Button]
```

### Increase by Segment - Target 7

**Display:**
```
Current Target: 7
Progress: 6 / 21

[S7] [D7] [T7] [Miss]
```

**After throwing T7 (hits and advances 3 targets to 10):**
```
Current Target: 10
Progress: 9 / 21
Completed: 1, 2, 3, 4, 5, 6, 7, 8, 9

Current Visit
Dart 1: T7
```

## Technical Details

### Color Scheme for Buttons

- **Singles (S):** `bg-blue-600 hover:bg-blue-700`
- **Doubles (D):** `bg-green-600 hover:bg-green-700`
- **Trebles (T):** `bg-purple-600 hover:bg-purple-700`
- **Miss:** `bg-slate-600 hover:bg-slate-700`
- **SBull:** `bg-blue-600 hover:bg-blue-700`
- **DBull:** `bg-green-600 hover:bg-green-700`

### Button Layouts

- **2 buttons:** Grid with 2 columns (Singles/Doubles/Trebles only modes)
- **3 buttons:** Grid with 3 columns (Trebles Bull mode, Increase Bull mode)
- **4 buttons:** Grid with 2 columns, 2 rows (Increase by segment for numbers)

### State Management

All state is local to the component:
- No global state for visit tracking
- Resets on retry
- Persists to database but doesn't reload from it (fresh start each time)

## Build Verification

```bash
npm run build
```

**Result:** ✅ Compiled successfully

**Route size:**
- `/app/play/training/around-the-clock` - 8.95 kB (slightly increased from 8.54 kB due to visit tracking)

## Testing Scenarios

### Test 1: Singles Only
1. Select "Singles only" rule
2. Start training
3. Target 1: Press S1 → Current visit shows "Dart 1: S1", advances to target 2
4. Target 2: Press Miss → Current visit shows "Dart 1: S1, Dart 2: Miss"
5. Press S2 → Current visit shows "Dart 1: S1, Dart 2: Miss, Dart 3: S2"
6. Visit history now shows "Visit 1: S1, Miss, S2", current visit resets
7. Continue to Bull

### Test 2: Doubles Only
1. Select "Doubles only" rule
2. Start training
3. Target 1: Only D1 and Miss buttons visible
4. Press Miss → Current visit shows "Dart 1: Miss"
5. Press Miss → Current visit shows "Dart 1: Miss, Dart 2: Miss"
6. Press D1 → Current visit shows "Dart 1: Miss, Dart 2: Miss, Dart 3: D1"
7. Advances to target 2, visit history shows "Visit 1: Miss, Miss, D1"

### Test 3: Trebles Only - Bull
1. Select "Trebles only" rule
2. Play through to Bull
3. At Bull: SBull, DBull, and Miss buttons visible (no treble bull)
4. Press SBull → Counts as hit, session completes

### Test 4: Increase by Segment - Skipping
1. Select "Increase by segment" rule
2. Target 1: Press T1 → Advances 3 targets to 4
3. Target 4: Press D4 → Advances 2 targets to 6
4. Target 6: Press S6 → Advances 1 target to 7
5. Visit history shows each dart with proper labels

### Test 5: Random Mode
1. Select "Random" order mode
2. Start training
3. First target might be: 14
4. Complete target 14 → Next random target (e.g., 7)
5. All 21 targets must be completed once
6. Visit history tracks all throws

## Completion Criteria

✅ **Dropdown settings** - Replaced radio groups with Select dropdowns
✅ **Mode-specific buttons** - Only valid buttons shown per segment rule
✅ **Current visit tracking** - 3-dart display that resets every visit
✅ **Visit history** - Scrollable list of all completed visits
✅ **Dart number cycling** - Records with dart_number 1-3 repeating
✅ **Database persistence** - All throws recorded via RPC
✅ **Clean UI** - No unused quick-match elements
✅ **Retry functionality** - Properly resets visit tracking
✅ **Build success** - No TypeScript errors

## Files Modified

1. `/app/app/play/page.tsx` - Settings UI with dropdowns
2. `/app/app/play/training/around-the-clock/page.tsx` - Complete rewrite with mode-specific buttons and visit tracking

## Result

A polished, user-friendly Around The Clock training experience with:
- Intuitive dropdown settings
- Clear, mode-specific throw buttons (no confusion)
- Live 3-dart visit display
- Complete visit history
- Proper database recording with cycling dart numbers
- Professional UI design
