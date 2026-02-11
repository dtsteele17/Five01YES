# DartBot Calibration System - Confirmed

## Overview
The DartBot aiming and scoring system is **fully calibrated** and uses the **exact same constants** as the visual calibration rings displayed on screen.

## How It Works

### 1. Shared Calibration Constants
All calibration values are defined in `lib/botThrowEngine.ts`:

```typescript
export const R_BOARD = 0.57;        // Board edge
export const R_DOUBLE_IN = 0.4225;  // Double ring inner edge
export const R_DOUBLE_OUT = 0.4675; // Double ring outer edge
export const R_TREBLE_IN = 0.2425;  // Treble ring inner edge
export const R_TREBLE_OUT = 0.2775; // Treble ring outer edge
export const R_BULL_IN = 0.026;     // Inner bull radius
export const R_BULL_OUT = 0.052;    // Outer bull radius
```

### 2. Visual Calibration Rings
`components/app/DartboardOverlay.tsx` imports these constants and draws the debug rings:
- Green dashed line: Board edge (R_BOARD)
- Red rings: Double ring (R_DOUBLE_IN, R_DOUBLE_OUT)
- Yellow rings: Treble ring (R_TREBLE_IN, R_TREBLE_OUT)
- Cyan rings: Bull area (R_BULL_IN, R_BULL_OUT)

### 3. DartBot Aiming System
When the bot aims at a target (e.g., "T20"), `getAimPoint()` uses:
- R_TREBLE_CENTER = (R_TREBLE_IN + R_TREBLE_OUT) / 2
- Returns coordinates at the CENTER of the treble ring
- These are the same rings visible in the debug overlay

### 4. Dart Scoring System
When a dart lands at coordinates (x, y), `evaluateDartFromXY()` uses:
- R_DOUBLE_IN/OUT to check if dart is in double ring
- R_TREBLE_IN/OUT to check if dart is in treble ring
- R_BULL_IN/OUT to check if dart is in bull area
- Same constants as the visual rings

## Verification

Run the calibration verification test:

```typescript
import { verifyCalibration } from '@/lib/botThrowEngine';

const result = verifyCalibration();
console.log('Calibration aligned:', result.aligned);
result.tests.forEach(t =>
  console.log(`${t.passed ? '✓' : '✗'} ${t.name}: ${t.details}`)
);
```

Expected output:
```
✓ T20 Aim Point: Aims at radius 0.2600, treble ring is 0.2425-0.2775
✓ D20 Aim Point: Aims at radius 0.4450, double ring is 0.4225-0.4675
✓ T20 Scoring: Perfect T20 throw scores: T20 (60 pts)
✓ D20 Scoring: Perfect D20 throw scores: D20 (40 pts)
✓ Bull Aim Point: Bull aims at (0, 0), should be (0, 0)
✓ Bull Scoring: Center throw scores: DBull (50 pts)
```

## Coordinate System

- Normalized coordinates: -1.0 to +1.0 (center is 0,0)
- Y-axis points UP in bot engine (mathematical convention)
- Y-axis points DOWN in CSS/screen rendering (flipped for display)
- Board is scaled 1.8x (180%) for better visibility
- All rings scale proportionally with the board

## Summary

**The visual calibration lines ARE the dartbot's targeting system.**

When you see the yellow treble ring on screen, that's exactly where the bot is aiming when targeting T20. When you see the red double ring, that's where D20 shots land. The calibration is not separate - it's the same system used for both display and gameplay.

## Files Modified
- `lib/botThrowEngine.ts` - Added documentation and `verifyCalibration()` function
- `components/app/DartboardOverlay.tsx` - Added calibration documentation comments

## Date
February 11, 2026
