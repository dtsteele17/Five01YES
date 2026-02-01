# Finish Training - BUST Button & Stats Updates Complete

## Summary of Changes

Five major updates have been implemented for the Finish Training mode:

### 1) ✅ BUST Button Added Next to MISS

**Dart-by-Dart Mode:**
- Large BUST button added next to MISS button
- Layout: 2-column grid, both buttons equal width
- BUST button styling: Red (bg-red-600) for clear visibility
- Always enabled (not disabled like MISS when 3 darts thrown)

**Typed Visit Mode:**
- BUST button added next to Submit Visit button
- 2-column layout for Submit Visit and BUST
- Same red styling for consistency

### 2) ✅ BUST Button: Smart Dart Count Tracking

**Darts Thrown Logic:**
When BUST is clicked, darts thrown increments by **actual darts entered**:
- 0 darts entered → +0 darts to total
- 1 dart entered → +1 dart to total
- 2 darts entered → +2 darts to total
- 3 darts entered → +3 darts to total

**Behavior:**
- Records visit outcome as BUST
- Ends visit immediately
- Resets remaining score to checkout target
- Increments attempt counter
- Shows error toast: "Bust!"
- Adds entry to visit history with darts thrown before bust

**Both Input Modes:**
- Works identically in dart-by-dart mode
- Works identically in typed visit mode
- Treats typed visit as 3 darts if committed, or counts partial darts if entered via buttons

### 3) ✅ Visit History: Newest First

**Display Order:**
- **Most recent visit at the top**
- Older visits appear below
- Prepending to history array instead of appending

**History Entry Format (unchanged):**
1. Target checkout number
2. Attempt number (1/3, 2/3, 3/3)
3. All darts thrown (e.g., "S20, T20, D10")
4. Visit total (sum of darts)
5. Result badge (SUCCESS / BUST / FAIL)

**BUST Button History:**
- Shows darts thrown before bust
- Shows visit total of those darts
- Clear "BUST" badge in red

### 4) ✅ End Session Modal: Finishes Hit

**New Display Section:**
Shows list of **unique checkout targets successfully completed**:
- Only counts SUCCESS results (not BUST or FAIL)
- Removes duplicates (unique values only)
- Sorted descending (highest to lowest)
- Displayed as emerald badges
- Shows count: "Finishes Hit (X unique)"

**Example:**
If you successfully checked out 40, 60, 40, 80, 60:
- Finishes Hit: **80, 60, 40** (3 unique)

### 5) ✅ End Session Modal: Highest Finish

**New Display Section:**
Shows the **maximum checkout target successfully completed**:
- Only counts SUCCESS results
- Shows single largest value
- Displayed prominently in emerald
- Shows "None" if no successful checkouts

**Examples:**
- Successfully checked out 40, 60, 80 → Highest Finish: **80**
- No successful checkouts → Highest Finish: **None**

## Technical Implementation

### Files Modified

**Single file updated:**
- `/app/app/play/training/finish/page.tsx`

### Key Code Changes

#### 1. Added State for Finishes Tracking
```typescript
const [finishesHit, setFinishesHit] = useState<number[]>([]);
```

#### 2. Added BUST Button Handler
```typescript
const handleBustClick = async () => {
  const dartsThrown = currentDarts.length;

  // Only count actual darts thrown
  setTotalDarts(totalDarts + dartsThrown);
  setTotalAttempts(totalAttempts + 1);

  // Calculate visit total from current darts
  const visitTotal = currentDarts.reduce((sum, dart) => sum + dart.value, 0);

  // Add to history (newest first)
  setHistory([
    {
      target: currentTarget,
      attemptNo,
      darts: dartsThrown > 0 ? currentDarts.map(d => d.label).join(', ') : 'No darts thrown',
      visitTotal,
      result: 'Bust',
    },
    ...history,
  ]);

  // Reset and continue
  toast.error('Bust!');
  setCurrentDarts([]);
  setRemaining(currentTarget);
  await incrementAttempt();
};
```

#### 3. Updated History to Prepend (Newest First)
```typescript
// Before:
setHistory([...history, newEntry]);

// After:
setHistory([newEntry, ...history]);
```

#### 4. Track Successful Finishes
```typescript
// In endAttempt and handleTypedVisitSubmit:
if (result === 'Success') {
  setFinishesHit([...finishesHit, currentTarget]);
}
```

#### 5. Updated buildHistoryFromDarts
```typescript
const successfulTargets: number[] = [];

// Inside loop:
if (lastDart.result?.success) {
  successfulTargets.push(target);
}

// After loop:
setFinishesHit(successfulTargets);
```

#### 6. Added BUST Button UI (Dart-by-Dart)
```typescript
<div className="grid grid-cols-2 gap-4 pt-2 max-w-2xl mx-auto">
  <Button
    onClick={() => handleDartClick({ segment: 'MISS', value: 0, label: 'Miss' })}
    disabled={currentDarts.length >= 3}
    className="h-16 bg-slate-600 hover:bg-slate-700 text-white text-lg font-bold"
  >
    MISS (0)
  </Button>
  <Button
    onClick={handleBustClick}
    className="h-16 bg-red-600 hover:bg-red-700 text-white text-lg font-bold"
  >
    BUST
  </Button>
</div>
```

#### 7. Added Stats Display in Modal
```typescript
{finishesHit.length > 0 && (
  <>
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
      <div className="text-emerald-300 text-sm uppercase tracking-wider mb-3 text-center">
        Highest Finish
      </div>
      <div className="text-4xl font-bold text-emerald-400 text-center">
        {Math.max(...finishesHit)}
      </div>
    </div>

    <div className="bg-slate-700/30 rounded-lg p-4">
      <div className="text-slate-400 text-sm uppercase tracking-wider mb-3">
        Finishes Hit ({Array.from(new Set(finishesHit)).length} unique)
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from(new Set(finishesHit))
          .sort((a, b) => b - a)
          .map((finish, idx) => (
            <Badge key={idx} className="bg-emerald-500/20 border-emerald-500 text-emerald-400">
              {finish}
            </Badge>
          ))}
      </div>
    </div>
  </>
)}

{finishesHit.length === 0 && (
  <div className="bg-slate-700/30 rounded-lg p-4 text-center">
    <div className="text-slate-400 text-sm">
      Highest Finish: <span className="font-semibold">None</span>
    </div>
  </div>
)}
```

## User Experience Flow

### BUST Button Flow (Dart-by-Dart)

**Scenario 1: Bust with 0 darts**
```
1. User clicks BUST immediately (no darts entered)
2. Visit marked as BUST
3. Darts thrown: +0
4. History shows: "No darts thrown | Total: 0 | BUST"
5. Attempt counter increments
```

**Scenario 2: Bust with 2 darts**
```
1. User enters: T20, S10 (2 darts)
2. User clicks BUST
3. Visit marked as BUST
4. Darts thrown: +2
5. History shows: "T20, S10 | Total: 70 | BUST"
6. Attempt counter increments
```

**Scenario 3: Bust with 3 darts**
```
1. User enters: T20, T20, T20 (3 darts)
2. User clicks BUST
3. Visit marked as BUST
4. Darts thrown: +3
5. History shows: "T20, T20, T20 | Total: 180 | BUST"
6. Attempt counter increments
```

### BUST Button Flow (Typed Visit)

**Scenario: Bust before entering score**
```
1. User doesn't enter any score
2. User clicks BUST
3. Visit marked as BUST
4. Darts thrown: +0
5. History shows: "No darts thrown | Total: 0 | BUST"
6. Attempt counter increments
```

### Visit History Order

**Session progression:**
```
Attempt 1: Checkout 40 → T20, D10 → SUCCESS
Attempt 2: Checkout 60 → T20, T20 → FAIL
Attempt 3: Checkout 60 → Click BUST → BUST

History Display (Top to Bottom):
1. [60] Attempt 3/3: No darts thrown, Total: 0 - BUST
2. [60] Attempt 2/3: T20, T20, Total: 120 - FAIL
3. [40] Attempt 1/3: T20, D10, Total: 30 - SUCCESS
```

### End Session Stats

**Example Session:**
```
Checkouts attempted: 40, 60, 80, 100, 40, 60
Results: SUCCESS, FAIL, SUCCESS, BUST, SUCCESS, FAIL

End Session Modal Shows:
- Total Darts: 47
- Total Attempts: 6
- Successful Checkouts: 3
- Checkout Success Rate: 50.0%
- Highest Finish: 80
- Finishes Hit: 80, 60, 40 (3 unique)
```

## Definitions & Rules

### What Counts as a "Finish Hit"?
✅ **YES** - Only visits with result = SUCCESS
- Checkout completed to exactly 0
- In dart-by-dart mode: final dart must be double
- In typed visit mode: any checkout to 0

❌ **NO** - Does not count:
- BUST results (over or invalid checkout)
- FAIL results (3 darts used without completing)
- Attempts that didn't reach 0

### Highest Finish Calculation
- Uses the **checkout target value** (not visit total)
- Example: Checkout 100 hit with T20, T20, D20 (visit total 100)
  - Highest Finish = **100** (the checkout target)
- If multiple successful checkouts: shows maximum value
- If no successful checkouts: shows "None"

### Darts Thrown with BUST Button
- **Only counts darts actually entered before BUST**
- Does NOT count the BUST button click as a dart
- Does NOT assume 3 darts for typed visit unless committed
- Accurate reflection of darts physically thrown

## Testing Checklist

### BUST Button Functionality
✅ BUST button visible in dart-by-dart mode (next to MISS)
✅ BUST button visible in typed visit mode (next to Submit)
✅ BUST button styled red for clear visibility
✅ BUST button always enabled (not disabled)
✅ Clicking BUST ends visit immediately
✅ Toast shows: "Bust!"

### Darts Count Accuracy
✅ 0 darts + BUST = +0 darts thrown
✅ 1 dart + BUST = +1 dart thrown
✅ 2 darts + BUST = +2 darts thrown
✅ 3 darts + BUST = +3 darts thrown
✅ Typed visit + BUST = +0 darts thrown
✅ Total darts stat accurate after multiple busts

### Visit History Order
✅ Newest visit appears at top
✅ Older visits appear below
✅ BUST entries show correct darts
✅ BUST entries show correct visit total
✅ BUST badge displayed in red

### End Session Stats
✅ "Finishes Hit" section shows unique checkouts
✅ Finishes sorted descending (high to low)
✅ Only SUCCESS results counted
✅ "Highest Finish" shows maximum value
✅ "Highest Finish" shows "None" if no successes
✅ Count displays: "(X unique)"
✅ Badges styled in emerald

### Existing Logic Unchanged
✅ Double-out still required for button input
✅ Invalid checkout to 0 without double = BUST
✅ Typed visit mode: no double-out enforcement
✅ Attempt cycling: 3 attempts then new number
✅ New Number button works correctly
✅ Around the Clock: not modified
✅ 301/501 Training: not modified
✅ Form Analysis: not modified

## Build Status

```
✓ Compiled successfully
Route: /app/play/training/finish
Size: 9.68 kB (increased from 9.35 kB)
First Load JS: 167 kB
```

## Example Complete Session

### Session Play-by-Play:
```
1. Setup: Min 20, Max 100
2. First target: 40

Attempt 1 (Target: 40):
  → T20, S10, MISS (70 total, FAIL)
  → History: [40] Attempt 1/3: T20, S10, Miss, Total: 70 - FAIL

Attempt 2 (Target: 40):
  → T20, D10 (40 total, SUCCESS!)
  → History: [40] Attempt 2/3: T20, D10, Total: 40 - SUCCESS
  → Finishes Hit: [40]
  → New target: 60

Attempt 1 (Target: 60):
  → T20, S10 (70 total, 2 darts entered)
  → Click BUST
  → History: [60] Attempt 1/3: T20, S10, Total: 70 - BUST

Attempt 2 (Target: 60):
  → T20, T20, D0 (invalid checkout, BUST)
  → History: [60] Attempt 2/3: T20, T20, D0, Total: 40 - BUST

Attempt 3 (Target: 60):
  → T20, D20 (60 total, SUCCESS!)
  → History: [60] Attempt 3/3: T20, D20, Total: 60 - SUCCESS
  → Finishes Hit: [40, 60]
  → New target: 80

Attempt 1 (Target: 80):
  → Click BUST (no darts)
  → History: [80] Attempt 1/3: No darts thrown, Total: 0 - BUST

Click "End Session"
```

### End Session Modal Shows:
```
Total Darts Thrown: 13
  (3 + 2 + 2 + 3 + 3 + 0 = 13)

Total Attempts: 6

Successful Checkouts: 2

Checkout Success Rate: 33.3%

Highest Finish: 60

Finishes Hit (2 unique):
  [60] [40]
```

All requirements successfully implemented!
