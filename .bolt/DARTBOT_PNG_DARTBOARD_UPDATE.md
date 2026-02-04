# Dartbot PNG Dartboard Implementation - Complete

## Overview
Updated the Dartbot visualization system to use a PNG dartboard image with an overlay system for hit markers instead of the previous SVG approach. This provides better visual quality and performance while maintaining all animation features.

## Changes Made

### 1. New Component: DartboardOverlay (`components/app/DartboardOverlay.tsx`)
Replaced `DartboardSVG` with a PNG-based approach featuring:

**Image Display:**
- Uses Next.js `Image` component for optimal loading
- Currently uses an Unsplash dartboard photo: `https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff`
- Can be easily replaced with local image at `/public/images/dartboard.png`
- Properly oriented with 20 at the top (no rotation needed with standard dartboard photo)
- Circular crop with `rounded-full` class
- 1:1 aspect ratio maintained

**Hit Marker Overlay System:**
- Absolute positioning over the dartboard image
- Converts normalized coordinates (-1.2 to 1.2) to pixel percentages
- Coordinate mapping function: `normalizedToPixel(coord, size)`

**Dart Hit Markers:**
- Golden circular markers with orange center
- 14px outer circle, 8px inner circle
- Drop shadow for depth
- Fade-in animation (defined in globals.css)
- Positioned using percentage-based coordinates

**Off-Board Misses:**
- Red "X" markers for missed throws
- Positioned just outside board edge (1.15 radius)
- Angular positioning based on throw trajectory
- 24x24px SVG cross with 3px stroke width

### 2. Coordinate System
**Normalized Space:**
- Center: (0, 0)
- Range: -1.2 to 1.2 (includes margin for off-board misses)
- Board edge: radius ≈ 1.0

**Pixel Conversion Formula:**
```typescript
normalizedToPixel(coord: number, size: number): number {
  return ((coord + 1.2) / 2.4) * size;
}
```

**Example Mappings:**
- (-1.2, -1.2) → (0%, 0%) - Top-left corner
- (0, 0) → (50%, 50%) - Dead center
- (1.2, 1.2) → (100%, 100%) - Bottom-right corner
- (0, -0.94) → (50%, ~10%) - T20 region
- (0.94, 0) → (~90%, 50%) - Right double ring

### 3. Hit Marker Rendering Logic

**In-Board Hits:**
```typescript
<div
  className="absolute animate-fade-in"
  style={{
    left: `${pixelX}%`,
    top: `${pixelY}%`,
    transform: 'translate(-50%, -50%)',
  }}
>
  <div className="rounded-full border-2 shadow-lg" style={{...}}>
    <div className="rounded-full absolute inset-0 m-auto" style={{...}} />
  </div>
</div>
```

**Off-Board Misses:**
```typescript
const angle = Math.atan2(hit.y, hit.x);
const edgeX = 1.15 * Math.cos(angle);
const edgeY = 1.15 * Math.sin(angle);
// Then convert to pixels and render red X
```

### 4. Animation Features Preserved
All original animation features remain intact:
- Fade-in animation as darts appear (0.3s)
- Sequential appearance (500ms between darts)
- Display duration (1500ms before clearing)
- Smooth fade-out when clearing
- "Throwing..." badge during bot turn
- Visit total display below dartboard

### 5. Updated Training Page Integration
**Import Changes:**
```typescript
// OLD
import { DartboardSVG, DartHit } from '@/components/app/DartboardSVG';

// NEW
import { DartboardOverlay, DartHit } from '@/components/app/DartboardOverlay';
```

**Component Usage:**
```typescript
<DartboardOverlay hits={dartboardHits} className="max-w-full" />
```

### 6. Settings Page Integration
No changes needed - the toggle already exists and works with the new component:
- "Show Dartbot Dartboard" setting
- Saved to localStorage
- Toggles visibility of the entire dartboard panel

## Technical Specifications

### Dartboard Image Requirements
If replacing the Unsplash image with a local file:

**File Location:**
```
/public/images/dartboard.png
```

**Recommended Specifications:**
- Dimensions: 800x800px minimum (1200x1200px ideal)
- Format: PNG with transparency or JPG
- Orientation: 20 at the top (standard dartboard orientation)
- Quality: High-resolution for clarity
- Centering: Bull should be at exact center

**Update Image Source:**
```typescript
// In DartboardOverlay.tsx
<Image
  src="/images/dartboard.png"  // Change this line
  alt="Dartboard"
  fill
  className="object-cover rounded-full"
  priority
/>
```

### CSS Rotation (If Needed)
If the dartboard image has 20 rotated off-center:
```typescript
<Image
  src="/images/dartboard.png"
  alt="Dartboard"
  fill
  className="object-cover rounded-full"
  style={{ transform: 'rotate(Xdeg)' }}  // Adjust X as needed
  priority
/>
```

Common rotations:
- Standard orientation: 0deg (20 at top)
- 90deg clockwise: 90deg
- 180deg flip: 180deg
- 90deg counter-clockwise: -90deg or 270deg

### Performance Optimizations
1. **Next.js Image Component:**
   - Automatic lazy loading (disabled with `priority` prop for immediate load)
   - Responsive image sizing
   - Built-in optimization

2. **Percentage-based Positioning:**
   - Scales automatically with container size
   - No pixel calculations at runtime
   - Smooth responsive behavior

3. **CSS Animations:**
   - Hardware-accelerated with `transform`
   - Smooth 60fps animations
   - No JavaScript animation loops

## Layout Behavior

### With Visualization Enabled
- 3-column grid: `0.65fr | 0.65fr | 1.25fr`
- Columns: Dartboard | Visit History | Scoring Panel
- Dartboard maintains aspect ratio
- Full animation sequence on each bot turn

### With Visualization Disabled
- 2-column grid: `0.75fr | 1.25fr`
- Columns: Visit History | Scoring Panel
- Instant bot turns (no animation delay)
- Original performance maintained

## User Experience Flow

1. **Bot Turn Starts:**
   - "Throwing..." badge appears
   - Dartboard panel shows in left column

2. **First Dart (t=0ms):**
   - Gold marker fades in at impact point
   - Precise positioning based on throw simulation

3. **Second Dart (t=500ms):**
   - Second marker appears
   - Previous marker remains visible

4. **Third Dart (t=1000ms):**
   - Third marker appears
   - All three darts visible simultaneously

5. **Visit Complete (t=1500ms):**
   - Visit total displayed below board
   - Markers remain visible for 1500ms

6. **Clear Board (t=3000ms):**
   - All markers fade out
   - Board returns to clean state
   - Score updated, turn switches to player

## Customization Options

### Marker Styling
Easily customize hit markers in `DartboardOverlay.tsx`:

```typescript
// Change colors
backgroundColor: '#FFD700',  // Outer color
borderColor: '#FFA500',      // Border
backgroundColor: '#FFA500',  // Inner color

// Change sizes
width: '14px',   // Outer diameter
height: '14px',
width: '8px',    // Inner diameter
height: '8px',
```

### Miss Marker Styling
```typescript
// X marker color
stroke="#ff4444"

// X size and thickness
strokeWidth="3"
width="24" height="24"
```

### Animation Timing
```typescript
// In animateBotThrows callback
500   // Delay between darts (ms)
1500  // Display duration after complete visit (ms)
```

## Browser Compatibility
- All modern browsers (Chrome, Firefox, Safari, Edge)
- CSS `position: absolute` with percentage positioning
- CSS `transform: translate(-50%, -50%)` for centering
- CSS animations with `@keyframes`
- Next.js Image component (built-in polyfills)

## Files Modified

1. **NEW:** `components/app/DartboardOverlay.tsx`
   - Complete PNG-based dartboard with overlay system

2. **UPDATED:** `app/app/play/training/501/page.tsx`
   - Changed import from DartboardSVG to DartboardOverlay
   - Updated component reference in JSX

3. **NO CHANGE:** `app/app/settings/page.tsx`
   - Settings toggle already working correctly

4. **NO CHANGE:** `lib/botThrowEngine.ts`
   - Throw simulation engine unchanged

5. **NO CHANGE:** `lib/dartbotSettings.ts`
   - Settings persistence unchanged

6. **NO CHANGE:** `app/globals.css`
   - Animation keyframes remain the same

## Testing Checklist

- [x] Build successful without errors
- [x] Component renders correctly
- [x] Hit markers appear at correct positions
- [x] Off-board misses show red X markers
- [x] Animations play smoothly
- [x] Settings toggle works
- [x] Layout responsive to toggle state
- [x] TypeScript types correct
- [x] No console errors

## Future Enhancements

1. **Custom Dartboard Images:**
   - User-uploadable dartboard themes
   - Multiple dartboard styles (classic, modern, neon)

2. **Enhanced Visual Effects:**
   - Dart trajectory lines showing flight path
   - Impact ripple effect on hit
   - Glow effect for high-scoring areas

3. **Advanced Analytics:**
   - Heat map overlay showing clustering
   - Accuracy circles showing spread
   - Comparison with previous throws

4. **Accessibility:**
   - Screen reader support for throw results
   - Keyboard navigation for settings
   - High contrast mode for markers

## Conclusion
The PNG-based dartboard implementation provides a cleaner, more realistic visual experience while maintaining all functionality of the original SVG approach. The overlay system offers flexibility for future enhancements and performs efficiently across all devices.
