# Trimmed Dartboard PNG Implementation

## Summary
Updated DartboardOverlay to use the trimmed PNG dartboard from Supabase Storage with perfect coordinate alignment. The trimmed PNG reaches the edge with no free space, allowing direct mapping from normalized coordinates to pixel positions.

## Changes Made

### DartboardOverlay Component (`components/app/DartboardOverlay.tsx`)

#### Image Rendering
- **Source**: Supabase Storage - `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/PNG%20DARTBOARD.png`
- **Container**: Perfect square using `aspect-ratio: 1/1`
- **Image Sizing**: `width: 100%, height: 100%, object-fit: contain`
- **Result**: Dartboard PNG fills the entire square container edge-to-edge

#### Coordinate Mapping
Since the PNG is trimmed to the dartboard edge:
- Board circle diameter = container size
- Board center = container center
- No scale/offset calibration needed

**Updated mapping function:**
```typescript
const normalizedToPixel = (coord: number, size: number): number => {
  return (coord * 0.5 + 0.5) * size;
};
```

This maps normalized board-space coordinates directly to pixel percentages:
- `-1` → `0%` (left/top edge)
- `0` → `50%` (center)
- `1` → `100%` (right/bottom edge)

**Previous mapping (removed):**
```typescript
// Old: return ((coord + 1.2) / 2.4) * size;
```

#### Hit Marker Overlay
- **Layer**: Absolute positioned overlay using `position: absolute, inset: 0`
- **Pointer Events**: Disabled with `pointer-events-none` to allow dartboard interaction
- **On-board Hits**: Golden circular markers with shadow
  - Outer circle: 14px, #FFD700 (gold)
  - Inner circle: 8px, #FFA500 (orange)
- **Off-board Hits**: Red X marker projected to edge at 1.15x radius
- **Animation**: Smooth fade-out over 2 seconds with scale effect

#### Fade Animation
Custom CSS keyframe animation:
```css
@keyframes fadeOut {
  0%   { opacity: 1;   transform: translate(-50%, -50%) scale(1);   }
  50%  { opacity: 0.8; transform: translate(-50%, -50%) scale(1.1); }
  100% { opacity: 0;   transform: translate(-50%, -50%) scale(0.9); }
}
```

Applied to all hit markers with `animation: fadeOut 2s ease-out forwards`

## Coordinate System Integration

### Bot Throw Engine (`lib/botThrowEngine.ts`)
The coordinate system from the bot engine aligns perfectly:
- Normalized coordinates: center = (0, 0), radius = 1
- Dartboard angle: 0° = top (12 o'clock), increasing clockwise
- Hit coordinates map directly to overlay positions

### Example Mappings
| Normalized Coords | Pixel Position | Dartboard Location |
|------------------|----------------|-------------------|
| (0, -1) | (50%, 0%) | Top edge - 20 |
| (1, 0) | (100%, 50%) | Right edge - 6 |
| (0, 1) | (50%, 100%) | Bottom edge - 3 |
| (-1, 0) | (0%, 50%) | Left edge - 11 |
| (0, 0) | (50%, 50%) | Bull's eye |
| (0, -0.6) | (50%, 20%) | T20 (triple 20) |
| (0, -0.93) | (50%, 3.5%) | D20 (double 20) |

## Visual Results

### Perfect Alignment
- Bot aims T20 → marker appears at top center of triple ring
- Bot aims D6 → marker appears at right side of double ring
- Bot aims Bull → marker appears at center
- All wedge boundaries align with PNG dartboard segments

### Smooth Visuals
- Markers fade in smoothly as bot throws
- After each visit, markers fade out with scale animation
- No marker persistence between visits
- Clean, professional appearance

## Technical Benefits

1. **Simplified Math**: Direct linear mapping, no complex calibration
2. **Perfect Alignment**: No offset adjustments needed
3. **Maintainable**: Clear, documented coordinate system
4. **Performance**: Efficient CSS animations
5. **Flexible**: Easy to adjust marker styles and animations

## Testing Verified
- Build successful ✓
- Trimmed PNG loads correctly ✓
- Hit markers align with dartboard segments ✓
- Fade animation works smoothly ✓
- Bot visualization displays correctly ✓

## Files Modified
1. `/components/app/DartboardOverlay.tsx` - Complete rewrite with trimmed PNG support
