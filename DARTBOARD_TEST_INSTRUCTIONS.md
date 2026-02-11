# Testing the Dartboard Calibration Fix

## Quick Test

1. **Start the development server**:
   ```bash
   npm run dev
   ```

2. **Open the DartBot training page**:
   - Navigate to: `http://localhost:3000/app/play/training/501`
   - Select a DartBot difficulty level
   - Start a match

3. **Watch the DartBot throw**:
   - Calibration rings are visible by default (debug mode is on)
   - Watch where each dart lands
   - Verify the score matches the ring:
     - **Yellow rings (TREBLE)**: Should score 3x (e.g., T20 = 60)
     - **Red rings (DOUBLE)**: Should score 2x (e.g., D20 = 40)
     - **Cyan center (BULL)**: Inner = 50, Outer = 25
     - **White/black areas (SINGLES)**: Face value (e.g., S20 = 20)

## What You Should See

### Correct Behavior
- ✅ Darts landing in the **yellow treble rings** score 3x the number
- ✅ Darts landing in the **red double rings** score 2x the number
- ✅ Darts landing in the **cyan bull** score 50 (inner) or 25 (outer)
- ✅ Each dart appears **one at a time** with delays
- ✅ The total score appears **after all 3 darts are thrown**
- ✅ The visible rings match where darts actually score

### Animation Timing
- First dart: 600ms thinking delay
- Next darts: 1200ms thinking delay + 400ms between throws
- Score display: After all darts shown
- Board clears: 1500ms after visit complete

## Visual Reference

The calibration rings overlay shows:
- **Green dashed**: Board edge (anything beyond = MISS)
- **Red circles**: Double ring (outer scoring ring) = 2x
- **Yellow circles**: Treble ring (inner scoring ring) = 3x
- **Cyan circles**: Bull rings (inner = 50, outer = 25)

## Technical Verification

Open the browser console while on the training page and you'll see:
```
[DARTBOARD CALIBRATION TEST - Updated to match actual dartboard dimensions]
  Standard dartboard: Bull (0-15.9mm) → Singles → TREBLE (99-107mm) → Singles → DOUBLE (162-170mm)
  Scaled to visible rings: R_BOARD = 0.4675 represents 170mm
  bull: DBull @ r=0.0000 (expected: DBull) ✓
  outerBull: SBull @ r=0.0306 (expected: SBull) ✓
  innerSingle: S20 @ r=0.1580 (expected: S20) ✓
  treble20: T20 @ r=0.2833 (expected: T20) ✓
  treble1: T1 @ r=0.2833 (expected: T1) ✓
  outerSingle: S20 @ r=0.3699 (expected: S20) ✓
  double20: D20 @ r=0.4565 (expected: D20) ✓
  double1: D1 @ r=0.4565 (expected: D1) ✓
  offBoard: MISS @ r=1.5000 (expected: MISS) ✓
```

All tests should show ✓ (passed).

## What Changed

### Before (Incorrect)
- Treble ring: 24.25% - 27.75% of radius
- Double ring: 42.25% - 46.75% of radius
- Bulls were too large
- **Problem**: Scoring didn't match visible rings

### After (Correct)
- Treble ring: 27.23% - 29.43% of radius (matches official 99-107mm)
- Double ring: 44.55% - 46.75% of radius (matches official 162-170mm)
- Bulls sized correctly (6.35mm and 15.9mm)
- **Result**: Scoring perfectly matches visible rings

## Ring Dimensions Match Official Specs

```
Ring Dimensions (in mm):
  Bullseye:      0mm - 6.36mm   ✓ (Target: 6.35mm)
  Outer Bull:    6.36mm - 15.89mm   ✓ (Target: 15.9mm)
  Treble Ring:   99.02mm - 107.02mm   ✓ (Target: 99-107mm)
  Double Ring:   162.00mm - 170.00mm   ✓ (Target: 162-170mm)

Ring Widths:
  Treble Ring:   8.00mm   ✓ (Target: 8mm)
  Double Ring:   8.00mm   ✓ (Target: 8mm)
```

---

## Summary

The DartBot now:
1. **Recognizes rings correctly** - scoring matches the visible calibration rings
2. **Uses official dartboard dimensions** - accurate to real tournament boards
3. **Shows darts individually** - each dart animated with proper timing
4. **Scores after throwing** - final visit total shown after all darts complete

The visible calibration rings were already perfect - the fix corrected the scoring engine to match them.
