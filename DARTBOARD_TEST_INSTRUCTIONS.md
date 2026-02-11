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
- Used raw dartboard dimensions without PNG scaling
- Treble ring: 27.23% - 29.43% of radius (too small for PNG)
- Double ring: 44.55% - 46.75% of radius (too small for PNG)
- **Problem**: Bot threw darts too close to center (trebles way too far in)

### After (Correct - PNG Scaled)
- All constants scaled by 1.818x to account for PNG's black number ring
- Treble ring: 49.5% - 53.5% of PNG radius ✓ (matches visible yellow rings)
- Double ring: 81% - 85% of PNG radius ✓ (matches visible red rings)
- Bulls scaled correctly
- **Result**: Bot throws to positions matching visible calibration rings

## PNG Scaling Explained

The PNG dartboard has a **black decorative number ring** around the playable area:

```
PNG Structure:
  0% - 85%:    Playable dartboard (scoring area)
  85% - 100%:  Black number ring (decorative, not scoring)

Scale Factor: 1.818
  = 0.85 / 0.4675
  = Converts real dartboard (170mm) to PNG coordinates (85%)
```

All constants are scaled to match the PNG:

```
Ring Positions in PNG (as % of PNG radius):
  Bullseye:      0% - 3.18%      (50 points)
  Outer Bull:    3.18% - 7.94%   (25 points)
  Inner Singles: 7.94% - 49.5%   (face value)
  TREBLE RING:   49.5% - 53.5%   (3x multiplier) ← Yellow rings
  Outer Singles: 53.5% - 81%     (face value)
  DOUBLE RING:   81% - 85%       (2x multiplier) ← Red rings
  Black Ring:    85% - 100%      (decorative only)
```

---

## Summary

The DartBot now:
1. **Throws to correct positions** - darts land where the visible calibration rings show
2. **Accounts for PNG padding** - all constants scaled by 1.818x for the black number ring
3. **Uses official dartboard proportions** - based on real tournament board dimensions (170mm)
4. **Shows darts individually** - each dart animated with proper timing
5. **Scores after throwing** - final visit total shown after all darts complete

**The Key Fix**: The PNG has a decorative black number ring (85%-100%), and all constants are now scaled to account for this padding. The visible calibration rings were already correct - the fix scaled the throwing constants to match them.
