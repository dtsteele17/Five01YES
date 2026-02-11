# DartBot Fixes Summary

## Issues Fixed

### 1. Double-Visit Bug ✅
**Problem**: Bot was throwing twice per player turn (6 darts instead of 3)

**Root Cause**: The `useEffect` that schedules the bot turn could be triggered multiple times due to:
- Race conditions between `currentPlayer` state changes
- React StrictMode double-mounting in development
- Timer overlap during leg transitions

**Fix Applied** in `app/app/play/training/501/page.tsx`:
- Added `botTurnScheduledRef` to prevent duplicate scheduling
- Added `lastProcessedTurnRef` to prevent duplicate execution
- Enhanced `scheduleBotTurn` with multiple guard checks
- Reset guards in `startNewLeg` and `handleRematch`
- Modified useEffect to check guards before scheduling

```typescript
// New refs for preventing double visits
const botTurnScheduledRef = useRef(false);
const lastProcessedTurnRef = useRef(0);
```

### 2. Dartboard Calibration ✅
**Problem**: Treble/double ring coordinates didn't match the DARTBOARD.PNG asset

**Fix Applied** in `lib/botThrowEngine.ts`:

| Constant | Old Value | New Value | Change |
|----------|-----------|-----------|--------|
| TREBLE_CAL | 0.975 | 0.96 | 4% inward (was 2.5%) |
| DOUBLE_CAL | 0.985 | 0.96 | 4% inward (was 1.5%) |
| R_TREBLE_IN | 0.470 | 0.446 | ~5% smaller |
| R_TREBLE_OUT | 0.537 | 0.529 | ~1.5% smaller |
| R_DOUBLE_IN | 0.790 | 0.725 | ~8% smaller |
| R_DOUBLE_OUT | 0.859 | 0.808 | ~6% smaller |
| R_BULL_IN | 0.034 | 0.033 | Fine-tuned |
| R_BULL_OUT | 0.086 | 0.082 | Fine-tuned |

### 3. Average Calibration ✅
**Problem**: Bot averages didn't match target levels (level 35 → ~35 avg)

**Fix Applied** in `lib/botThrowEngine.ts`:

| Level | Old Sigma | New Sigma | Expected Avg |
|-------|-----------|-----------|--------------|
| 95 (Elite) | 0.055 | 0.045 | ~95 |
| 85 (Pro) | 0.075 | 0.065 | ~85 |
| 75 (Strong) | 0.095 | 0.085 | ~75 |
| 65 (Above avg) | 0.120 | 0.105 | ~65 |
| 55 (Average) | 0.145 | 0.130 | ~55 |
| 45 (Below avg) | 0.175 | 0.160 | ~45 |
| 35 (Beginner) | 0.210 | 0.195 | ~35 |
| 25 (Novice) | 0.250 | 0.240 | ~25 |

## Files Modified

1. **`lib/botThrowEngine.ts`** - Complete rewrite with:
   - Calibrated ring constants
   - Tuned sigma values
   - Inline checkout table (removed external dependency)
   - Added debug utilities (`runCalibrationSimulation`)

2. **`app/app/play/training/501/page.tsx`** - Added guards:
   - `botTurnScheduledRef` - prevents duplicate scheduling
   - `lastProcessedTurnRef` - prevents duplicate execution
   - Enhanced turn scheduling logic

## Debug Mode

The debug rings can be enabled via browser console:
```javascript
localStorage.setItem('dartbot_debug_mode_enabled', 'true');
```

This shows colored rings on the dartboard:
- 🟢 Green dashed: Board edge
- 🔴 Red: Double ring inner/outer
- 🟡 Yellow: Treble ring inner/outer
- 🔵 Cyan: Bull inner/outer

## Testing Calibration

You can test the calibration in browser console:
```javascript
import { DartBotDebug } from '@/lib/botThrowEngine';

// Run 100-visit simulation
const result = DartBotDebug.runCalibrationSimulation(55, 100);
console.log('Average:', result.average); // Should be ~55
console.log('Distribution:', result.distribution);
```

## Notes

- The sigma values were tuned to produce target averages over 100+ visits
- Ring positions were adjusted to better align with the PNG dartboard asset
- The double-visit fix uses multiple redundant guards to prevent race conditions
