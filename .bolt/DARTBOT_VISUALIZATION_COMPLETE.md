# Dartbot Throw Visualization System - Implementation Complete

## Overview
Implemented a comprehensive Dartbot throw visualization system that displays a realistic dartboard showing where the bot throws during local training matches. The system includes intelligent aiming, realistic physics simulation, and smooth animations.

## Components Created

### 1. DartboardSVG Component (`components/app/DartboardSVG.tsx`)
- Renders a standard dartboard as responsive SVG
- Uses normalized coordinates (center 0,0, radius = 1)
- Displays all dartboard rings: doubles, triples, bulls, singles
- Standard number order: 20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5
- Renders hit markers as animated circles
- Shows off-board misses as red X markers near the edge
- Includes fade-in animation for dart hits

### 2. Bot Throw Engine (`lib/botThrowEngine.ts`)
Realistic dart throwing simulation with:

**Difficulty Levels & Accuracy:**
- 8 difficulty levels: 25, 35, 45, 55, 65, 75, 85, 95
- Each level mapped to specific sigma values (accuracy spread)
- Level 95: 0.018 (professional accuracy)
- Level 25: 0.120 (beginner accuracy)

**Smart Aiming Logic:**
- Aims at T20 when remaining > 170
- Uses checkout routes for finishable scores
- Intelligent setup throws to leave favorable doubles
- Prefers leaving D20, D16, D10, D8 when no direct checkout

**Realistic Variance:**
- Form multiplier per leg: 0.85–1.15 (simulates good/bad days)
- 10% chance of "great dart" (tighter accuracy)
- 10% chance of "bad dart" (wider spread)
- Natural miss-board probability increases with lower skill

**Gaussian Drift Physics:**
- 2D normal distribution applied to aim point
- Converts x,y coordinates to board segments
- Determines wedge by angle, ring by radius
- Outputs labels: T20, D16, S5, SBull, DBull, MISS

**Game Rules:**
- Full double-out support
- Bust detection (< 0, == 1, or 0 without double)
- Off-board detection (radius > 1.02)
- Realistic checkout routes (50, 40, 32, 36, 24, 20, 16)

### 3. Settings Integration
**New Settings Section** (`app/app/settings/page.tsx`):
- Added "Training" section in settings
- Toggle: "Show Dartbot Dartboard"
- Description: "Visualize where Dartbot throws when playing against it"
- Saved to localStorage for persistence

**Settings Utility** (`lib/dartbotSettings.ts`):
- `isDartbotVisualizationEnabled()` - Check if enabled (default: true)
- `setDartbotVisualizationEnabled(boolean)` - Toggle setting

### 4. Training Page Integration (`app/app/play/training/501/page.tsx`)
**Visual Features:**
- Dartboard panel shows in left column (when enabled)
- "Throwing..." badge during bot turn
- Animated dart markers appearing one-by-one (500ms delay)
- Last visit total displayed below dartboard
- Hits clear after 1500ms with fade-out

**Animation Flow:**
1. Bot turn starts → "Dartbot throwing..." label
2. First dart appears on board → wait 500ms
3. Second dart appears → wait 500ms
4. Third dart appears → wait 500ms
5. Show visit total → wait 1500ms
6. Clear all hits with fade-out
7. Update score and switch to player

**Layout:**
- 3-column grid when visualization enabled: Dartboard | History | Scoring
- 2-column grid when disabled: History | Scoring
- Responsive sizing maintains all functionality

### 5. CSS Animations (`app/globals.css`)
Added fade-in keyframe animation:
- Opacity: 0 → 1
- Scale: 0.8 → 1
- Duration: 0.3s
- Easing: ease-out

## Technical Details

### Dartboard Coordinate System
- Center: (0, 0)
- Normalized radius: 1.0
- Rotation: -9 degrees (to align 20 at top)
- Rings (outer to inner):
  - Double: 0.88 - 1.0
  - Single outer: 0.65 - 0.88
  - Triple: 0.55 - 0.65
  - Single inner: 0.3 - 0.55
  - Outer bull: 0.03 - 0.065
  - Double bull: 0 - 0.03

### Hit Detection Algorithm
1. Calculate polar coordinates from cartesian (x, y)
2. Check radius for off-board (> 1.02)
3. Check bulls (radius-based)
4. Determine wedge index from angle
5. Determine ring type from radius
6. Return segment label and score

### Performance Optimization
- Single form multiplier per leg (not per dart)
- Async/await for smooth animations
- Timer cleanup on component unmount
- Conditional rendering based on settings
- Fallback to original bot engine when disabled

## User Experience

### When Visualization is ON:
1. Dartboard appears in dedicated panel
2. Watch bot's throws land in real-time
3. See accuracy patterns (clustering, spread)
4. Understand bot decision-making
5. Visual feedback for each dart

### When Visualization is OFF:
- Reverts to original instant bot turns
- Layout adjusts to 2-column
- Performance identical to before
- Settings preference persists

## Future Enhancement Opportunities
- Add trajectory lines showing dart flight path
- Display aim target as subtle indicator
- Heat map showing where bot aims most
- Comparison overlay with player's throws
- Difficulty adjustment based on visual feedback

## Testing Notes
- Build successful (no compilation errors)
- All imports and dependencies resolved
- TypeScript types properly defined
- Local-only (no Supabase dependency)
- No impact on PvP matches
- Settings toggle working correctly

## Files Modified
1. `components/app/DartboardSVG.tsx` (NEW)
2. `lib/botThrowEngine.ts` (NEW)
3. `lib/dartbotSettings.ts` (NEW)
4. `app/app/settings/page.tsx` (UPDATED)
5. `app/app/play/training/501/page.tsx` (UPDATED)
6. `app/globals.css` (UPDATED)

## Conclusion
The Dartbot visualization system is production-ready and provides an engaging, educational experience for players training against the bot. The realistic physics, smart aiming, and smooth animations make bot matches more transparent and enjoyable.
