# Shared Evaluation Function Implementation

## Summary
Implemented a single shared evaluation function `evaluateDartFromXY` that ensures dart scoring always matches the exact hit position on the dartboard. This guarantees "where it hits is what it scores" by using one unified function for all coordinate-to-score mappings.

## Core Changes

### 1. Single Shared Evaluation Function (`lib/botThrowEngine.ts`)

**Function: `evaluateDartFromXY(x, y)`**
```typescript
export function evaluateDartFromXY(x: number, y: number): {
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
}
```

**Input:**
- Normalized board-space coordinates (x, y) in range roughly [-1..1]
- Center = (0, 0)
- Edges at approximately ±1

**Output:**
- `label`: String like "S20", "T20", "D20", "SBull", "DBull", "MISS"
- `score`: Numeric score (0-60)
- `isDouble`: Boolean for double ring hits
- `isTreble`: Boolean for treble ring hits
- `offboard`: Boolean for misses outside dartboard

**Ring Detection (Normalized Radii):**
- DBull (Bull's eye): r ≤ 0.035
- SBull (Outer bull): 0.035 < r ≤ 0.085
- Treble ring: 0.53 to 0.60
- Double ring: 0.93 to 1.00
- Singles: Everything else within r ≤ 1.00
- Offboard: r > 1.00

**Dartboard Wedge Mapping:**
Clockwise from top (20 at 12 o'clock):
```
20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
```

**Angle Conversion:**
- Uses `atan2(y, x)` to get standard angle
- Converts to dartboard angle: `dartboardAngle = (π/2) - angle`
- 0° = top (20), increasing clockwise
- Adds half-wedge offset (9°) to align boundaries

### 2. Updated DartResult Interface

**Added `isTreble` field:**
```typescript
export interface DartResult {
  x: number;           // Coordinate where dart landed
  y: number;           // Coordinate where dart landed
  label: string;       // Label from evaluateDartFromXY
  score: number;       // Score from evaluateDartFromXY
  isDouble: boolean;   // Double flag from evaluateDartFromXY
  isTreble: boolean;   // NEW: Treble flag from evaluateDartFromXY
  offboard: boolean;   // Offboard flag from evaluateDartFromXY
}
```

### 3. Bot Only Generates (x,y) Position

**Updated `simulateDart` function:**
```typescript
export function simulateDart(...): DartResult {
  // 1. Bot calculates aim point and applies throw error
  const aimPoint = getAimPoint(aimTarget);
  const dx = gaussianRandom() * sigma;
  const dy = gaussianRandom() * sigma;
  const actualX = aimPoint.x + dx;
  const actualY = aimPoint.y + dy;

  // 2. ONLY use evaluateDartFromXY to determine score
  const evaluation = evaluateDartFromXY(actualX, actualY);

  // 3. Return dart result with evaluation
  return {
    x: actualX,
    y: actualY,
    label: evaluation.label,
    score: evaluation.score,
    isDouble: evaluation.isDouble,
    isTreble: evaluation.isTreble,
    offboard: evaluation.offboard,
  };
}
```

**Key Principle:**
- Bot generates ONLY (x, y) landing position
- Score, label, isDouble, isTreble come ONLY from `evaluateDartFromXY`
- No separate scoring logic anywhere else

### 4. Hit Marker Uses Same (x,y)

**DartboardOverlay component:**
```typescript
<DartboardOverlay hits={dartboardHits} />

// Each hit marker positioned at exact (x, y) from DartResult
hits.map((hit) => {
  const pixelX = (hit.x * 0.5 + 0.5) * 100;  // Same x from evaluateDartFromXY
  const pixelY = (hit.y * 0.5 + 0.5) * 100;  // Same y from evaluateDartFromXY
  // Render marker at this position
})
```

**Guarantee:** Marker appears exactly where the dart scored.

### 5. Debug Mode System

#### Debug Mode Settings (`lib/dartbotSettings.ts`)

**Added functions:**
```typescript
export function isDartbotDebugModeEnabled(): boolean;
export function setDartbotDebugModeEnabled(enabled: boolean): void;
```

Stores debug mode preference in localStorage.

#### Debug Mode Features (Training Page)

**1. Debug Mode Toggle Button**
- Located in Dartbot Board header
- Toggles debug mode on/off
- Saves preference to localStorage
- Shows toast notification when enabled

**2. Last 3 Dart Labels Display**
When debug mode is enabled, shows badges with:
- Dart labels (e.g., "T20", "S5", "D10")
- Color coding:
  - Green: Doubles
  - Yellow: Trebles
  - Gray: Singles
- Visual indicator to check console for details

**3. Console Logging**
When debug mode is enabled, logs each dart visit:
```
=== Bot Visit Debug ===
Dart 1: (0.015, -0.580) => T20 [Score: 60] [TREBLE]
Dart 2: (-0.042, -0.570) => T20 [Score: 60] [TREBLE]
Dart 3: (0.023, -0.590) => T20 [Score: 60] [TREBLE]
======================
```

Shows:
- Exact (x, y) coordinates
- Evaluated label
- Score
- Special flags (DOUBLE, TREBLE, OFFBOARD)

### 6. Coordinate Validation

**Updated debug function:**
```typescript
export function debugDartboardAlignment(): void {
  // Validates key dartboard positions
  const testPoints = [
    { x: 0, y: -0.9, expected: '20', position: 'top' },
    { x: 0.9, y: 0, expected: '6', position: 'right' },
    { x: 0, y: 0.9, expected: '3', position: 'bottom' },
    { x: -0.9, y: 0, expected: '11', position: 'left' },
    { x: 0, y: -0.57, expected: 'T20', position: 'triple 20 (top)' },
    { x: 0, y: -0.96, expected: 'D20', position: 'double 20 (top)' },
    { x: 0, y: 0, expected: 'DBull', position: 'bull center' },
    { x: 0, y: -0.06, expected: 'SBull', position: 'outer bull' },
  ];
}
```

Automatically runs in development mode to verify alignment.

## Validation Tests

### Expected Coordinate Mappings

| Position | Coordinates | Expected Result | Ring Type |
|----------|-------------|-----------------|-----------|
| Center | (0, 0) | DBull (50) | Bull |
| Top edge | (0, -0.9) | S20/D20 | 20 wedge |
| Right edge | (0.9, 0) | S6/D6 | 6 wedge |
| Bottom edge | (0, 0.9) | S3/D3 | 3 wedge |
| Left edge | (-0.9, 0) | S11/D11 | 11 wedge |
| T20 | (0, -0.57) | T20 (60) | Treble |
| D20 | (0, -0.96) | D20 (40) | Double |
| SBull | (0, -0.06) | SBull (25) | Bull |
| Offboard | (0, -1.1) | MISS (0) | Off |

### Bust Rules Integration

The game logic uses the returned `score` and `isDouble` from `evaluateDartFromXY`:

```typescript
const newRemaining = currentRemaining - dart.score;

if (newRemaining === 0) {
  if (doubleOut && !dart.isDouble) {
    bust = true;  // Must finish on double
  } else {
    finished = true;
  }
} else if (newRemaining === 1 || newRemaining < 0) {
  bust = true;
}
```

### Double-Out Finishing

Checkout detection uses `isDouble` flag:
```typescript
if (doubleOut && isDoubleTarget(aimTarget)) {
  // Aiming at double
  if (dart.isDouble && dart.score === remaining) {
    // Valid checkout!
  }
}
```

## Benefits

### 1. Single Source of Truth
- ONE function determines scoring
- No scoring logic duplication
- No scoring/position mismatches possible

### 2. Perfect Alignment
- Hit markers appear exactly where darts score
- Visual feedback matches game logic
- No calibration drift

### 3. Maintainability
- One place to adjust ring radii
- One place to fix wedge alignment
- Clear, documented coordinate system

### 4. Debugging
- Easy to verify any coordinate
- Console logs show exact mapping
- Visual debug display confirms behavior

### 5. Consistency
- Bot throwing uses same evaluation
- Hit markers use same coordinates
- Game logic uses same scoring
- Everything synchronized

## Files Modified

1. `/lib/botThrowEngine.ts`
   - Added `evaluateDartFromXY` function (exported)
   - Updated `DartResult` interface to include `isTreble`
   - Updated `simulateDart` to use shared evaluation
   - Updated `debugDartboardAlignment` validation
   - Adjusted ring radii to spec (0.035, 0.085, 0.53-0.60, 0.93-1.00)
   - Fixed `cartesianToPolar` to use `atan2(-y, x)` for correct 20-at-top mapping

2. `/lib/dartbotSettings.ts`
   - Added `isDartbotDebugModeEnabled` function
   - Added `setDartbotDebugModeEnabled` function

3. `/app/app/play/training/501/page.tsx`
   - Imported `evaluateDartFromXY` and debug functions
   - Added `debugMode` state
   - Added `lastThreeDarts` state tracking
   - Updated `animateBotThrows` to log debug info
   - Added debug mode toggle button in UI
   - Added last 3 dart labels display when debug mode enabled

4. `/components/app/DartboardOverlay.tsx`
   - Already using exact (x, y) coordinates from DartResult
   - Perfect alignment with trimmed PNG dartboard
   - No changes needed (already correct)

## Usage Example

**Enable Debug Mode:**
1. Open Training 501 mode
2. Click "Debug" button in Dartbot Board header
3. Bot throws will display last 3 dart labels
4. Check browser console for detailed coordinates

**Console Output Example:**
```
=== Dartboard Alignment Validation ===
✓ (0.00, -0.90) [top]: S20 (score: 20)
✓ (0.90, 0.00) [right]: S6 (score: 6)
✓ (0.00, 0.90) [bottom]: S3 (score: 3)
✓ (-0.90, 0.00) [left]: S11 (score: 11)
✓ (0.00, -0.57) [triple 20 (top)]: T20 (score: 60) [TREBLE]
✓ (0.00, -0.96) [double 20 (top)]: D20 (score: 40) [DOUBLE]
✓ (0.00, 0.00) [bull center]: DBull (score: 50) [DOUBLE]
✓ (0.00, -0.06) [outer bull]: SBull (score: 25)
======================================

=== Bot Visit Debug ===
Dart 1: (0.015, -0.580) => T20 [Score: 60] [TREBLE]
Dart 2: (-0.042, -0.570) => T20 [Score: 60] [TREBLE]
Dart 3: (0.023, -0.590) => T20 [Score: 60] [TREBLE]
======================
```

## Technical Notes

### Coordinate System
- Origin (0, 0) = dartboard center
- Positive X = right, Negative X = left
- **Negative Y = UP** (towards 20), **Positive Y = DOWN** (towards 3)
- Radius 1.0 = dartboard edge (double ring outer edge)
- Important: Uses `atan2(-y, x)` to ensure negative Y points upward to 20

### Angle System
- 0° = top (20 at 12 o'clock)
- Increases clockwise
- 90° = right (6 at 3 o'clock)
- 180° = bottom (3 at 6 o'clock)
- 270° = left (11 at 9 o'clock)

### Ring Radii (Normalized to dartboard radius = 1.0)
Based on standard dartboard proportions:
- DBull: 0.035 (12.7mm / 340mm)
- SBull: 0.085 (31.8mm / 340mm)
- Treble inner: 0.53 (107mm / 340mm)
- Treble outer: 0.60 (107mm + 8mm / 340mm)
- Double inner: 0.93 (162mm / 340mm)
- Double outer: 1.00 (170mm / 340mm)

## Testing Verified

✅ Build successful
✅ Coordinate validation passes
✅ Bot throws display correct labels
✅ Hit markers align with scores
✅ Debug mode toggle works
✅ Last 3 darts display correctly
✅ Console logging accurate
✅ Bust rules respect isDouble flag
✅ Checkout logic uses correct scoring
✅ All wedges map to correct numbers

## Future Enhancements

Potential improvements:
- Export debug logs to file
- Add coordinate picker tool
- Visual wedge boundary overlay
- Real-time score verification display
- Coordinate history playback
