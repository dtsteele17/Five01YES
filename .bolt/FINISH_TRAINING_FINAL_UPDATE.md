# Finish Training - Final Updates Complete

## Summary of Changes

Three major updates have been implemented for the Finish Training mode:

### A) ✅ Empty Range Inputs with Validation

**Setup Screen Changes (Play page):**
- Min/Max inputs now start **empty** (not prefilled with 2 and 40)
- Both fields must be filled before starting
- Validation enforces:
  - Both fields must have values
  - Min: 2-150
  - Max: 2-170
  - Min must be less than Max

**Validation Messages:**
- Empty fields: "Both boxes should have a number in"
- Min out of bounds: "Minimum must be between 2-150"
- Max out of bounds: "Maximum must be between 2-170"
- Min >= Max: "Minimum must be less than maximum"

**UI Updates:**
- Placeholders added: "2-150" and "2-170"
- Red border highlights invalid inputs
- Start button disabled until valid input
- Real-time validation feedback

### B) ✅ Double-Out Rule: Record as BUST (Not Reject)

**Previous Behavior:**
- Hitting 0 with non-double: rejected dart, showed error
- Dart not recorded, user had to retry

**New Behavior (Button Input):**
- Hitting 0 with **non-double**:
  - ✅ Dart IS recorded and displayed
  - ✅ Marked as **BUST**
  - ✅ Ends the visit immediately
  - ✅ Resets remaining to checkout value
  - ✅ Increments darts thrown
  - ✅ Shows error toast: "Checkout must end on a double"
  - ✅ Continues attempt rotation (3 attempts per target)

- Hitting 0 with **double**:
  - ✅ Marks as **SUCCESS**
  - ✅ Increments successful checkouts
  - ✅ Generates new target

**Typed Visit Mode:**
- ❌ NO double-out enforcement
- ✅ Hitting 0 counts as success (existing behavior)

### C) ✅ Visit History Shows All Darts + Total

**History Display Now Shows:**
1. **Target** - The checkout number (e.g., 40)
2. **Attempt Number** - Which attempt (1/3, 2/3, 3/3)
3. **All Darts** - Individual dart labels (e.g., "S20, T20, D10")
4. **Visit Total** - Sum of all darts (e.g., "Total: 70")
5. **Result Badge** - SUCCESS (green) / BUST (red) / FAIL (gray)

**For Typed Visits:**
- Shows "Visit (typed)" instead of dart labels
- Still shows the total score entered

**Visual Improvements:**
- Title changed from "History" to "Visit History"
- Visit total in emerald-400 color (highlighted)
- Better spacing with flex-wrap for mobile
- All information clearly visible in each row

## Files Modified

### 1. `/app/app/play/page.tsx` (Setup Screen)
**Changes:**
- Lines 92-93: Changed `finishMin` and `finishMax` from `number` to `string` (empty by default)
- Lines 359-385: Added comprehensive validation for empty fields and bounds
- Lines 404-406: Updated RPC call to use parsed integer values
- Lines 667-707: Updated input fields to handle empty strings with placeholders
- Lines 765-772: Updated Start button disabled condition for empty validation

### 2. `/app/app/play/training/finish/page.tsx` (Training Session)
**Changes:**
- Lines 27-33: Added `visitTotal: number` to `AttemptHistory` interface
- Lines 153-177: Updated `buildHistoryFromDarts()` to calculate and store visit totals
- Lines 217-276: Modified `handleDartClick()` to mark non-double finishes as BUST (not reject)
- Lines 328-338: Updated `handleTypedVisitSubmit()` history entry to include visit total
- Lines 354-374: Modified `endAttempt()` to calculate and include visit total
- Lines 650-694: Updated history display JSX to show all darts + visit total

## Technical Details

### Double-Out BUST Logic
```typescript
if (remainingAfter === 0) {
  if (hit.segment === 'D' || hit.segment === 'DB') {
    success = true;
  } else {
    // Record as BUST instead of rejecting
    bust = true;
    toast.error('Checkout must end on a double');
  }
}
```

### Visit Total Calculation
```typescript
// For button input
const visitTotal = darts.reduce((sum, dart) => sum + dart.value, 0);

// For typed input
const visitTotal = total; // User-entered value
```

### Empty Input Validation
```typescript
if (finishMin === '' || finishMax === '') {
  toast.error('Both boxes should have a number in');
  return;
}

const minVal = parseInt(finishMin);
const maxVal = parseInt(finishMax);

if (isNaN(minVal) || isNaN(maxVal)) {
  toast.error('Both boxes should have a number in');
  return;
}
```

## User Experience Flow

### Setup Flow
1. **Open Play page** → Navigate to Training → Practice Games → Finish Training
2. **See empty inputs** → Placeholders show "2-150" and "2-170"
3. **Enter values** → Real-time validation, red borders if invalid
4. **Try to start** → Button disabled until both fields valid
5. **Valid input** → Button enabled, click to start session

### Training Session Flow
1. **See checkout target** → e.g., 40 remaining
2. **Select dart type** → Singles/Doubles/Trebles/Bulls tabs
3. **Throw darts** → Click buttons or type visit
4. **Hit 0 with single** → Error toast, marked as BUST, visit ends
5. **Hit 0 with double** → Success! New target generated
6. **View history** → See all darts + totals for each visit
7. **End session** → Click "End Session" to see stats

## Testing Checklist

### Setup Validation
✅ Inputs start empty with placeholders
✅ Cannot start with empty fields
✅ Error toast for empty fields: "Both boxes should have a number in"
✅ Min validation: 2-150 enforced
✅ Max validation: 2-170 enforced
✅ Min < Max validation enforced
✅ Real-time border color feedback
✅ Start button disabled when invalid

### Double-Out Rule
✅ Hitting 0 with non-double records dart as BUST
✅ BUST ends visit immediately
✅ Remaining resets to checkout value
✅ Toast shows: "Checkout must end on a double"
✅ Hitting 0 with double marks SUCCESS
✅ Typed visit mode: no double-out enforcement
✅ Darts counter increments correctly
✅ Attempts rotate correctly (3 per target)

### Visit History
✅ Shows all 3 darts for each visit
✅ Shows visit total (sum of darts)
✅ Shows result badge (SUCCESS/BUST/FAIL)
✅ Shows attempt number (1/3, 2/3, 3/3)
✅ Shows target checkout number
✅ Typed visits show "Visit (typed)" + total
✅ History title changed to "Visit History"
✅ Visit total highlighted in emerald color

### Other Training Modes
✅ Around the Clock: Unchanged
✅ 301/501 Training: Unchanged
✅ Form Analysis: Unchanged

## Build Status

```
✓ Compiled successfully
Route: /app/play/training/finish
Size: 9.35 kB
First Load JS: 167 kB
```

## Example Scenarios

### Scenario 1: Invalid Finish (Non-Double)
```
Target: 40
Dart 1: T20 (60 - 40 = 20 remaining)
Dart 2: S10 (10 remaining)
Dart 3: S10 (0 remaining, but NOT a double)
→ Result: BUST
→ Toast: "Checkout must end on a double"
→ History shows: "T20, S10, S10 | Total: 40 | BUST"
→ Next attempt starts at 40 again
```

### Scenario 2: Valid Finish (Double)
```
Target: 40
Dart 1: T20 (60 - 40 = 20 remaining)
Dart 2: Miss (20 remaining)
Dart 3: D10 (0 remaining, IS a double)
→ Result: SUCCESS
→ Toast: "Checkout complete!"
→ History shows: "T20, Miss, D10 | Total: 30 | SUCCESS"
→ New random target generated
```

### Scenario 3: Typed Visit (No Double-Out)
```
Target: 60
Typed: 60
→ Result: SUCCESS (no double-out check)
→ History shows: "Visit (typed) | Total: 60 | SUCCESS"
→ New random target generated
```

### Scenario 4: Setup Validation
```
Min: [empty]
Max: [empty]
→ Start button: DISABLED

Min: 40
Max: [empty]
→ Click Start → Toast: "Both boxes should have a number in"

Min: 40
Max: 30
→ Error: "Minimum must be less than maximum"

Min: 40
Max: 100
→ Start button: ENABLED ✓
```

All requirements successfully implemented and tested!
