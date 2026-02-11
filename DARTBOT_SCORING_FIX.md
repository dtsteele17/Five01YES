# DartBot Dartboard Scoring Calibration Fix

## Issue Summary

The dartbot's scoring engine was not correctly recognizing which ring of the dartboard darts were landing in. While the visible calibration rings were positioned correctly on the PNG dartboard image, the scoring constants didn't match actual dartboard proportions.

## What Was Fixed

Updated the dartboard geometry constants in `/lib/botThrowEngine.ts` to match official dartboard dimensions:

### Standard Dartboard Dimensions (Official)
- **Total radius**: 170mm from center to outer edge of doubles
- **Bullseye (inner red)**: 0-6.35mm = 50 points
- **Outer bull (green)**: 6.35-15.9mm = 25 points
- **Inner singles**: 15.9-99mm = face value
- **TREBLE ring (inner red/green)**: 99-107mm = 3x multiplier (8mm wide)
- **Outer singles**: 107-162mm = face value
- **DOUBLE ring (outer red/green)**: 162-170mm = 2x multiplier (8mm wide)

### Corrected Constants

The visible calibration rings represent R_DOUBLE_OUT = 0.4675 as the full dartboard (170mm).

**Scale factor**: 0.4675 / 170mm = 0.00275 per mm

| Ring | Old Value | New Value | Actual mm |
|------|-----------|-----------|-----------|
| R_BULL_IN | 0.026 | **0.0175** | 6.35mm |
| R_BULL_OUT | 0.052 | **0.0437** | 15.9mm |
| R_TREBLE_IN | 0.2425 | **0.2723** | 99mm |
| R_TREBLE_OUT | 0.2775 | **0.2943** | 107mm |
| R_DOUBLE_IN | 0.4225 | **0.4455** | 162mm |
| R_DOUBLE_OUT | 0.4675 | 0.4675 ✓ | 170mm |

## Impact

1. **Treble Ring**: Moved from 24.25%-27.75% to 27.23%-29.43% (moved outward ~12%)
2. **Double Ring**: Moved from 42.25%-46.75% to 44.55%-46.75% (narrower, moved outward ~5%)
3. **Bulls**: Moved inward to be smaller and more accurate

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
2. **Scoring**: `evaluateDartFromXY(x, y)` checks which ring the dart landed in
3. **Ring detection** (from outer to inner):
   - Beyond R_BOARD (0.4675) → MISS (0 points)
   - R_DOUBLE_IN to R_DOUBLE_OUT → 2x multiplier
   - R_TREBLE_IN to R_TREBLE_OUT → 3x multiplier
   - R_BULL_IN → 50 points (double bull)
   - R_BULL_OUT → 25 points (single bull)
   - Everything else → Single (face value)

## Visual Representation

The calibration rings overlay shows:
- **Green dashed circle**: Board edge (R_BOARD)
- **Red circles**: Double ring (outer scoring ring)
- **Yellow circles**: Treble ring (inner scoring ring)
- **Cyan circles**: Bull rings

These rings now perfectly match the PNG dartboard image and the scoring engine recognizes them correctly.

---

**Result**: The dartbot now scores correctly when hitting the visible calibration rings, with proper recognition of trebles, doubles, and bulls matching actual dartboard proportions.
