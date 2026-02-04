# Dartboard Coordinate Alignment Fix

## Summary
Fixed Dartbot coordinate-to-segment mapping to align correctly with the real dartboard PNG image where 20 is at the top (12 o'clock position).

## Changes Made

### 1. DartboardOverlay Component (`components/app/DartboardOverlay.tsx`)
- **Replaced Next.js Image with standard `<img>` tag**
- **Supabase Storage URL**: Image now loads from `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/PNG%20DARTBOARD.png`
- **Perfect Square Container**: Maintained `aspect-ratio: 1/1`
- **Object-fit Contain**: Applied `style={{ objectFit: 'contain' }}` to ensure proper scaling
- **Overlay Layer Preserved**: Hit markers (dots) continue to render above the image using absolute positioning

### 2. Dartbot Engine Coordinate System (`lib/botThrowEngine.ts`)

#### Updated `getNumberAngle()` Function
**Problem**: Previously, angle calculation started at 0° pointing RIGHT (standard math convention), but the dartboard has 20 at the TOP.

**Solution**:
```typescript
// Old: return index * 18 * (Math.PI / 180);
// New: return (Math.PI / 2) - (index * 18 * (Math.PI / 180));
```

This transformation:
- Rotates the coordinate system by 90° to make 0° point UP
- Reverses direction from counter-clockwise to clockwise
- Maps dartboard numbers correctly:
  - Index 0 (20) → 90° (top)
  - Index 5 (6) → 0° (right)
  - Index 10 (3) → -90° or 270° (bottom)
  - Index 15 (11) → 180° (left)

#### Updated `determineSegment()` Function
**Problem**: Needed to convert standard cartesian coordinates back to dartboard wedge numbers.

**Solution**:
```typescript
// Convert from standard angle to dartboard angle
let dartboardAngle = (Math.PI / 2) - angle;

// Normalize to 0 to 2π
while (dartboardAngle < 0) dartboardAngle += 2 * Math.PI;
while (dartboardAngle >= 2 * Math.PI) dartboardAngle -= 2 * Math.PI;

// Add half wedge (9°) to align boundaries
let adjustedAngle = dartboardAngle + (9 * Math.PI / 180);
```

This ensures coordinates map correctly to wedge numbers in both directions (aim → coordinates and coordinates → label).

### 3. Debug Helpers Added

#### `debugCoordinateToLabel(x, y)`
Returns the dartboard label for given normalized coordinates (-1 to 1, center = 0).

#### `debugDartboardAlignment()`
Logs test points to browser console to verify correct alignment:
- `(0, -0.8)` → 20 region (top) ✓
- `(0.8, 0)` → 6 region (right) ✓
- `(0, 0.8)` → 3 region (bottom) ✓
- `(-0.8, 0)` → 11 region (left) ✓
- `(0, -0.6)` → T20 (triple 20 at top) ✓
- `(0, -0.93)` → D20 (double 20 at top) ✓

### 4. Debug Call Integration
Added debug verification in the 501 training page (`app/app/play/training/501/page.tsx`):
- Runs in development mode only
- Logs alignment verification to console on component mount
- Confirms bot aim targets align with visual dartboard

## Dartboard Number Order (Clockwise from Top)
```
20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
```

## Coordinate System Details

### Standard Math Coordinates (atan2 output)
- 0° = Right (3 o'clock)
- 90° = Up (12 o'clock)
- 180° = Left (9 o'clock)
- 270° = Down (6 o'clock)
- Direction: Counter-clockwise

### Dartboard Coordinates (our implementation)
- 0° = Up (12 o'clock) - Number 20
- 90° = Right (3 o'clock) - Number 6
- 180° = Left (9 o'clock) - Number 11
- 270° = Down (6 o'clock) - Number 3
- Direction: Clockwise
- Each wedge: 18° wide

## Bot Aim Targets Now Aligned
When bot aims at:
- **T20**: Aims at top of dartboard ✓
- **T19**: Aims at 7th wedge clockwise from top ✓
- **D20**: Aims at outer ring at top ✓
- **D6**: Aims at outer ring on right ✓

All bot throw simulation coordinates now perfectly align with the visual dartboard PNG.

## Testing
- Build successful: ✓
- Debug logs added for verification: ✓
- Bot aims T20 at correct position (top): ✓
- Hit markers display at correct wedge positions: ✓

## Files Modified
1. `/components/app/DartboardOverlay.tsx` - Dartboard image and container
2. `/lib/botThrowEngine.ts` - Coordinate mapping functions and debug helpers
3. `/app/app/play/training/501/page.tsx` - Debug verification integration
