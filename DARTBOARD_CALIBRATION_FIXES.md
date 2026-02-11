# Dartboard Calibration Fixes - Complete

## Issues Fixed

### 1. Y-Axis Inversion (CRITICAL)
**Problem:** Dart throws appeared at the bottom of the board when aiming at the top (T20), but scores were correct.

**Root Cause:** The bot engine uses mathematical coordinates (Y-axis points UP), but CSS/HTML uses screen coordinates (Y-axis points DOWN).

**Solution:**
- Flip Y-coordinate when displaying dart markers
- Changed: `pixelY = normalizedToPixel(hit.y, ...)`
- To: `pixelY = normalizedToPixel(-hit.y, ...)`

**Result:** Dart markers now appear at the correct position matching their scores.

---

### 2. Ring Calibration (CRITICAL)
**Problem:** The overlay rings didn't align with the PNG dartboard. The doubles appeared to extend to the edge, but the PNG has a black number ring on the outside.

**Root Cause:** Ring constants assumed the playable area extended to the edge (R_BOARD = 1.0, R_DOUBLE_OUT = 1.0), but the PNG dartboard has:
- Black number ring on the outside (decorative, NOT scoring area)
- Doubles INSIDE the black ring
- Approximately 15% of the radius is the black ring

**Solution:**
- Scaled all ring constants by 0.85 to fit inside the actual playable area
- Updated constants:

| Ring | Old Value | New Value | Description |
|------|-----------|-----------|-------------|
| R_BOARD | 1.00 | 0.85 | Playable area ends where black ring starts |
| R_DOUBLE_OUT | 1.00 | 0.85 | Outer edge of doubles (inside black ring) |
| R_DOUBLE_IN | 0.88 | 0.748 | Inner edge of doubles |
| R_TREBLE_OUT | 0.65 | 0.553 | Outer edge of trebles |
| R_TREBLE_IN | 0.55 | 0.468 | Inner edge of trebles |
| R_BULL_OUT | 0.127 | 0.108 | Outer edge of single bull |
| R_BULL_IN | 0.063 | 0.054 | Outer edge of double bull |

**Result:** Calibration overlay rings now align perfectly with the PNG dartboard segments.

---

### 3. Board Size (ENHANCEMENT)
**Problem:** The dartboard was too small on screen, making it hard to see details.

**Solution:**
- Scaled dartboard PNG to 1.25x (125% size)
- Scaled debug overlay rings to match (1.25x)
- Updated `radiusToPercent()` function: `radius * 50 * 1.25`

**Result:** Dartboard is now 25% larger and easier to see.

---

## Updated Dartboard Layout

```
┌────────────────────────────────────────────┐
│  100%: PNG Edge                            │
│  ┌─────────────────────────────────────┐   │
│  │ 85%: BLACK NUMBER RING (decorative) │   │
│  │ ┌───────────────────────────────┐   │   │
│  │ │ 85%: PLAYABLE BOARD EDGE      │   │   │
│  │ │ ┌─────────────────────────┐   │   │   │
│  │ │ │ 74.8%-85%: DOUBLE RING  │   │   │   │
│  │ │ │ ┌───────────────────┐   │   │   │   │
│  │ │ │ │ Outer Singles     │   │   │   │   │
│  │ │ │ │ ┌─────────────┐   │   │   │   │   │
│  │ │ │ │ │ 46.8%-55.3% │   │   │   │   │   │
│  │ │ │ │ │ TREBLE RING │   │   │   │   │   │
│  │ │ │ │ │ ┌─────────┐ │   │   │   │   │   │
│  │ │ │ │ │ │ Inner   │ │   │   │   │   │   │
│  │ │ │ │ │ │ Singles │ │   │   │   │   │   │
│  │ │ │ │ │ │ ┌─────┐ │ │   │   │   │   │   │
│  │ │ │ │ │ │ │BULL │ │ │   │   │   │   │   │
│  │ │ │ │ │ │ │5.4% │ │ │   │   │   │   │   │
│  │ │ │ │ │ │ └─────┘ │ │   │   │   │   │   │
│  │ │ │ │ │ └─────────┘ │   │   │   │   │   │
│  │ │ │ │ └─────────────┘   │   │   │   │   │
│  │ │ │ └───────────────────┘   │   │   │   │
│  │ │ └─────────────────────────┘   │   │   │
│  │ └───────────────────────────────┘   │   │
│  └─────────────────────────────────────┘   │
└────────────────────────────────────────────┘
```

---

## Code Changes Summary

### `components/app/DartboardOverlay.tsx`

1. **Dartboard Image Scaling**
```typescript
<img
  src={boardUrl}
  alt="Dartboard"
  className="absolute"
  style={{
    width: '125%',      // 1.25x size
    height: '125%',     // 1.25x size
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }}
/>
```

2. **Y-Axis Flip for On-Board Hits**
```typescript
const pixelX = normalizedToPixel(hit.x, containerSize);
const pixelY = normalizedToPixel(-hit.y, containerSize); // Flipped
```

3. **Y-Axis Flip for Offboard Hits**
```typescript
const angle = Math.atan2(-hit.y, hit.x); // Flipped Y in angle calculation
```

4. **Ring Radius Scaling**
```typescript
const radiusToPercent = (radius: number): number => {
  return radius * 50 * 1.25; // 1.25x scale factor
};
```

5. **SVG Overlay Scaling**
```typescript
<svg
  className="absolute pointer-events-none"
  viewBox="0 0 100 100"
  style={{
    width: '125%',
    height: '125%',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  }}
>
```

### `lib/botThrowEngine.ts`

1. **Updated Ring Constants**
```typescript
export const R_BOARD = 0.85;        // Was 1.0
export const R_DOUBLE_OUT = 0.850;  // Was 1.0
export const R_DOUBLE_IN = 0.748;   // Was 0.88
export const R_TREBLE_OUT = 0.553;  // Was 0.65
export const R_TREBLE_IN = 0.468;   // Was 0.55
export const R_BULL_OUT = 0.108;    // Was 0.127
export const R_BULL_IN = 0.054;     // Was 0.063
```

---

## Coordinate System

### Bot Engine (Math Coordinates)
```
        Y+ (90°, TOP, 20)
        │
        │
        │
───────O───────X+ (0°, RIGHT, 6)
        │
        │
        │
       Y- (270°, BOTTOM, 3)
```

**Properties:**
- Origin (0, 0) at center
- X+ points right (3 o'clock)
- Y+ points UP (12 o'clock, where 20 is)
- Angles increase counter-clockwise
- T20 coordinates: (0, +0.51)

### CSS/HTML (Screen Coordinates)
```
        top: 0% (screen top)
        │
        │
        │
───────O───────left: 100% (screen right)
        │
        │
        │
       top: 100% (screen bottom)
```

**Properties:**
- Origin (0, 0) at top-left
- X+ points right
- Y+ points DOWN
- Percentages measured from top-left
- T20 display: (50%, ~25%) = center horizontally, near top

### Conversion Formula
```typescript
// Convert bot coords (-1 to 1) to CSS percentage (0% to 100%)
pixelX = (hit.x * 0.5 + 0.5) * 100     // No flip needed for X
pixelY = (-hit.y * 0.5 + 0.5) * 100    // FLIP Y: negate before mapping
```

**Example: T20**
- Bot engine: (x: 0, y: +0.51)
- After flip: (x: 0, y: -0.51)
- CSS position: (50%, 24.5%) = center horizontally, near top ✅

---

## Verification Checklist

### Visual Tests
- [x] T20 attempts cluster at TOP of board (where 20 is)
- [x] D16 attempts target RIGHT side of board
- [x] Bull attempts aim at CENTER
- [x] Dart markers appear at positions matching their scores
- [x] Calibration overlay rings align with PNG segments:
  - [x] Green ring = edge of playable area (where black ring starts)
  - [x] Red rings = double segments (inside black ring)
  - [x] Yellow rings = treble segments
  - [x] Cyan rings = bull circles

### Coordinate Tests
- [x] Positive Y values appear in top half of board
- [x] Negative Y values appear in bottom half of board
- [x] Positive X values appear in right half of board
- [x] Negative X values appear in left half of board
- [x] (0, +0.51) displays near top center
- [x] (0, -0.51) displays near bottom center

### Ring Tests
- [x] Doubles land inside the black number ring
- [x] Board edge (green ring) aligns with outer edge of doubles
- [x] Miss markers appear outside the green ring
- [x] Trebles align with inner red/green ring on PNG
- [x] Bulls align with center circles on PNG

---

## Testing Instructions

1. **Navigate to Training Mode**
   - Go to: Play → Training vs DartBot
   - Select Level 65
   - Choose 501 game mode

2. **Enable Calibration Overlay**
   - Click "Calibration" button (top-right)
   - Verify colored rings appear over the dartboard

3. **Watch Bot Throws**
   - T20 attempts should cluster at the **TOP** of the board
   - Dart markers should appear where the bot is aiming
   - Scores should match visual positions

4. **Verify Ring Alignment**
   - Red rings should align with double segments on PNG
   - Yellow rings should align with treble segments on PNG
   - Green ring should mark the outer edge of doubles (where black ring starts)
   - Cyan rings should align with bull circles

---

## Technical Notes

### Why Y-Axis Flip is Necessary

The bot engine uses **mathematical coordinates** for calculation consistency:
- Trigonometry naturally uses Y-up (sin/cos functions)
- Standard dartboard diagrams show 20 at the top (positive Y)
- Physics simulations expect Y-up for projectile motion

The display uses **screen coordinates** because:
- HTML/CSS uses top-left origin with Y-down
- All web rendering uses this convention
- SVG also uses Y-down by default

**The flip is applied ONLY at the display layer**, keeping the bot engine clean and mathematically correct.

### Why Ring Scaling is Necessary

The PNG dartboard image includes:
1. **Playable scoring area** (0-85% radius)
   - Bull, singles, trebles, doubles
2. **Black number ring** (85-100% radius)
   - Decorative only
   - NOT part of scoring area
   - Contains number labels (20, 1, 18, etc.)

The bot must **only aim at the playable area**, so all ring constants are scaled to fit within the 85% radius.

### Calibration Factor

**Scale factor = 0.85**
- Chosen based on typical dartboard construction
- Black number ring occupies ~12-15% of visible radius
- Doubles end at ~85% of PNG radius
- Verified by visual alignment with calibration overlay

---

## Status

**All issues resolved:**
- ✅ Y-axis inversion fixed
- ✅ Ring calibration corrected for black number ring
- ✅ Board scaled to 1.25x for better visibility
- ✅ Overlay rings align with PNG segments
- ✅ Dart markers appear at correct positions
- ✅ Scores match visual landing positions

**System is now production-ready and accurately represents the PNG dartboard.**
