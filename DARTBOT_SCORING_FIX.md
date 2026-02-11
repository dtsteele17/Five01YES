# DartBot Dartboard Scoring Calibration Fix

## Issue Summary

The dartbot was throwing darts to the wrong positions because the PNG dartboard has a decorative black number ring around it, and the scoring constants weren't accounting for this PNG padding. The visible calibration rings were correct, but the bot was using raw dartboard dimensions without the PNG scale factor.

## What Was Fixed

The PNG dartboard image has a **black decorative number ring** around it that takes up 15% of the radius. The playable dartboard only occupies **85% of the PNG radius**. All scoring constants needed to be scaled to match this PNG layout.

### PNG Layout Structure
- **0% - 85%**: Playable dartboard (scoring area)
- **85% - 100%**: Black number ring (decorative only, not scoring)

### Standard Dartboard Dimensions (Official)
- **Total radius**: 170mm from center to outer edge of doubles
- **Bullseye (inner red)**: 0-6.35mm = 50 points
- **Outer bull (green)**: 6.35-15.9mm = 25 points
- **Inner singles**: 15.9-99mm = face value
- **TREBLE ring (inner red/green)**: 99-107mm = 3x multiplier (8mm wide)
- **Outer singles**: 107-162mm = face value
- **DOUBLE ring (outer red/green)**: 162-170mm = 2x multiplier (8mm wide)
- **Black number ring**: 170mm+ (decorative, NOT scoring)

### PNG Scale Factor

**Scale = 1.818** (calculated as 0.85 / 0.4675)

This converts real dartboard proportions to PNG proportions where the 170mm dartboard edge appears at 85% of the PNG radius.

### Corrected Constants

| Ring | Old Value | New Value | PNG Position | Real Size |
|------|-----------|-----------|--------------|-----------|
| R_BOARD | 0.4675 | **0.85** | 85% | 170mm |
| R_DOUBLE_IN | 0.4455 | **0.81** | 81% | 162mm |
| R_DOUBLE_OUT | 0.4675 | **0.85** | 85% | 170mm |
| R_TREBLE_IN | 0.2723 | **0.495** | 49.5% | 99mm |
| R_TREBLE_OUT | 0.2943 | **0.535** | 53.5% | 107mm |
| R_BULL_IN | 0.0175 | **0.0318** | 3.18% | 6.35mm |
| R_BULL_OUT | 0.0437 | **0.0794** | 7.94% | 15.9mm |

## Impact

All constants are now **1.818x larger** to account for the PNG's black number ring padding. This means:

1. **Treble Ring**: Now at 49.5%-53.5% of PNG radius (matches visible yellow rings)
2. **Double Ring**: Now at 81%-85% of PNG radius (matches visible red rings)
3. **Bulls**: Now at correct scale relative to PNG
4. **Bot throws to correct positions** that match the visible calibration rings

## Key Points

✅ **Visible calibration rings remain unchanged** - they were already correctly positioned
✅ **Scoring now matches the visible rings** - evaluateDartFromXY uses corrected constants
✅ **Each dart is animated individually** - dartbot shows darts one at a time with delays
✅ **Scoring occurs after all darts thrown** - final visit total shown after animation completes

## Testing the Fix

### Method 1: Visual Inspection
1. Go to `/app/play/training/501`
2. Enable dartbot visualization (should be on by default)
3. Enable debug mode to see calibration rings
4. Watch the dartbot throw darts
5. Verify darts landing in the **yellow treble rings** score 3x
6. Verify darts landing in the **red double rings** score 2x

### Method 2: Run Calibration Test
Open browser console and run:
```javascript
import { testRingCalibration } from '@/lib/botThrowEngine';
const results = testRingCalibration();
console.table(results);
```

Expected output: All tests should show ✓ (passed)
- bull: DBull ✓
- outerBull: SBull ✓
- innerSingle: S20 ✓
- treble20: T20 ✓
- treble1: T1 ✓
- outerSingle: S20 ✓
- double20: D20 ✓
- double1: D1 ✓
- offBoard: MISS ✓

## Animation Timing

The dartbot already animates darts individually:
- **First dart**: 600ms thinking delay
- **Subsequent darts**: 1200ms thinking delay
- **Between darts**: 400ms pause to show impact
- **Final score display**: After all 3 darts thrown
- **Clear board**: 1500ms after visit complete

## Files Modified

- `/lib/botThrowEngine.ts` - Updated dartboard geometry constants and calibration test
- `/components/app/DartboardOverlay.tsx` - No changes needed (rings already correct)

## Verification Commands

```bash
# Build the project
npm run build

# Check for TypeScript errors
npm run typecheck

# Run the development server
npm run dev
```

## How Scoring Works

1. **Dart throw**: `simulateDart(aimTarget, sigma)` generates x,y coordinates with Gaussian scatter
2. **Scoring**: `evaluateDartFromXY(x, y)` checks which ring the dart landed in using PNG-scaled constants
3. **Ring detection** (from outer to inner):
   - Beyond R_BOARD (0.85) → MISS (0 points)
   - R_DOUBLE_IN (0.81) to R_DOUBLE_OUT (0.85) → 2x multiplier
   - R_TREBLE_IN (0.495) to R_TREBLE_OUT (0.535) → 3x multiplier
   - Below R_BULL_IN (0.0318) → 50 points (double bull)
   - R_BULL_IN to R_BULL_OUT (0.0794) → 25 points (single bull)
   - Everything else → Single (face value)

## Visual Representation

The calibration rings overlay shows (all at 180% scale to match PNG):
- **Green dashed circle**: Board edge at 85% (R_BOARD) - where black number ring starts
- **Red circles**: Double ring at 81%-85% (outer scoring ring)
- **Yellow circles**: Treble ring at 49.5%-53.5% (inner scoring ring)
- **Cyan circles**: Bull rings at 3.18% and 7.94%

These rings now **perfectly match the PNG dartboard image** because all constants account for the black number ring padding.

## PNG Layout Diagram

```
┌─────────────────────────────────────┐
│ 100%: PNG Edge                      │
│ ┌─────────────────────────────────┐ │
│ │ 85%-100%: BLACK NUMBER RING     │ │ ← Decorative (not scoring)
│ │ ┌─────────────────────────────┐ │ │
│ │ │ 81%-85%: DOUBLE RING (Red)  │ │ │ ← 2x multiplier
│ │ │ ┌─────────────────────────┐ │ │ │
│ │ │ │ 53.5%-81%: Outer Single │ │ │ │ ← Face value
│ │ │ │ ┌─────────────────────┐ │ │ │ │
│ │ │ │ │ 49.5%-53.5%: TREBLE │ │ │ │ │ ← 3x multiplier (Yellow)
│ │ │ │ │ ┌─────────────────┐ │ │ │ │ │
│ │ │ │ │ │ 7.94%-49.5%:    │ │ │ │ │ │ ← Face value
│ │ │ │ │ │ Inner Single    │ │ │ │ │ │
│ │ │ │ │ │ ┌─────────────┐ │ │ │ │ │ │
│ │ │ │ │ │ │ 3.18%-7.94% │ │ │ │ │ │ │ ← 25 points (Cyan)
│ │ │ │ │ │ │ Outer Bull  │ │ │ │ │ │ │
│ │ │ │ │ │ │ ┌─────────┐ │ │ │ │ │ │ │
│ │ │ │ │ │ │ │ 0-3.18% │ │ │ │ │ │ │ │ ← 50 points (Cyan)
│ │ │ │ │ │ │ │ DBull   │ │ │ │ │ │ │ │
│ │ │ │ │ │ │ └─────────┘ │ │ │ │ │ │ │
```

---

**Result**: The dartbot now throws darts to positions that **exactly match the visible calibration rings** on the PNG dartboard. All scoring constants are scaled by 1.818x to account for the black number ring padding around the playable area.
