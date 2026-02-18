# ATC Quick Match Scoring Fix

## Problem
The ATC (Around The Clock) quick match was automatically submitting each dart throw immediately, not allowing users to:
1. Enter all 3 darts before submitting
2. Review their darts before confirming
3. Undo a dart if they made a mistake

## Solution
Changed the scoring flow to a "Pending Darts" system:

### How It Works Now
1. **Enter Darts**: User clicks dart buttons to add up to 3 darts to a pending list
2. **Visual Feedback**: Darts appear in the "Current Visit" display as they're entered
3. **Undo**: User can click "Undo" to remove the last dart entered
4. **Submit**: User clicks "Submit Visit" to confirm and process all darts
5. **Turn Switch**: Only after submitting does the turn switch to the opponent

### Key Changes Made

#### 1. New State Variable
```typescript
const [pendingDarts, setPendingDarts] = useState<Array<{segment: string, number?: number, label: string}>>([]);
```

#### 2. Modified `handleDartThrow`
- Now adds darts to `pendingDarts` array
- Updates the display but does NOT submit to server
- Stops accepting darts after 3 are entered

#### 3. New `handleUndoLastDart` Function
```typescript
const handleUndoLastDart = () => {
  if (pendingDarts.length === 0) return;
  setPendingDarts(prev => prev.slice(0, -1));
  // Update display...
};
```

#### 4. New `handleSubmitVisit` Function
- Processes all pending darts
- Updates player stats and target progression
- Submits to Supabase
- Clears pending darts
- Ends turn

#### 5. Updated UI
- Shows dart count: "X/3 Darts"
- Input buttons disabled when 3 darts entered
- Shows "Undo" and "Submit" buttons when darts are pending
- Submit button shows number of darts: "Submit (2 darts)"

### Visual Flow
```
User's Turn
    ↓
Click S20 (adds to pending)
    ↓
Click D20 (adds to pending)
    ↓
Click Miss (adds to pending)
    ↓
[Current Visit shows: S20, D20, Miss]
    ↓
Click Submit Visit → Processes all 3 darts → Turn ends
```

### Files Changed
- `app/app/play/quick-match/atc-match/page.tsx`

### Testing Checklist
- [ ] Enter 1 dart and submit - works correctly
- [ ] Enter 3 darts and submit - works correctly
- [ ] Click Undo removes last dart
- [ ] Input buttons disabled after 3 darts
- [ ] Turn only switches after Submit
- [ ] Target progression works correctly (especially in "increase" mode)
- [ ] Winning the game still works correctly
