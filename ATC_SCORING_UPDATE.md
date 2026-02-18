# ATC Quick Match Scoring Update

## Changes Made

### 1. Smaller Score Display
- Reduced dart display boxes from `aspect-square` to `aspect-[4/3]`
- Font size reduced from `text-2xl` to `text-lg` for dart labels
- Badge shows just "X/3" instead of "X/3 Darts"
- More compact padding overall

### 2. Dynamic Target Preview
After each dart is entered, the target display updates to show what the next target will be:
- **Hit**: Target advances (e.g., 20 → 21, or 20 → 22 for double)
- **Miss**: Target stays the same
- Visual indicator shows "(hit!)" when target changes

### 3. Submit & Undo Buttons Under Scoring
- Buttons now always visible at bottom of scoring panel
- Undo: Removes last dart entered
- Submit: Confirms all darts and ends turn
- Submit shows dart count: "Submit (2)" or just "Submit" when full
- Buttons disabled when no darts entered

### 4. Compact Scoring Buttons
- Reduced button heights (h-10 instead of h-12)
- Smaller text sizes
- Tighter gaps between buttons
- Better fits in the layout

## Visual Layout

```
┌─────────────────────────────────┐
│ Current Visit          2/3      │
├─────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐           │
│ │S20 │ │D20 │ │ 3  │           │
│ └────┘ └────┘ └────┘           │
├─────────────────────────────────┤
│ Target: 22 (hit!)               │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  [S20] [D20]  <- Scoring buttons│
│  [T20] [Miss]                   │
├─────────────────────────────────┤
│  [Undo] [Submit (2)]            │
└─────────────────────────────────┘
```

## How It Works

1. **Enter Dart**: Click scoring button → Dart appears in display
2. **Target Updates**: If hit, target shows next number; if miss, stays same
3. **Undo**: Click Undo → Removes last dart, target reverts
4. **Submit**: Click Submit → Processes all darts, ends turn, switches to opponent

## Code Changes

### New Function: `calculatePreviewTarget()`
Calculates what the target will be after each pending dart:
```typescript
function calculatePreviewTarget(
  startTarget: number | 'bull',
  darts: Array<{segment: string, number?: number}>,
  mode: string,
  order: 'sequential' | 'random'
): { target: number | 'bull', hits: number }
```

### New State
```typescript
const [previewTarget, setPreviewTarget] = useState<number | 'bull'>(1);
```

### Updated Components
- `CurrentVisitDisplay`: Now accepts `previewTarget` and `startTarget` props
- Scoring Panel: Compact layout with fixed button positions
- Submit/Undo: Always visible, conditionally disabled

## Testing
- [ ] Enter 1 dart, check target updates correctly
- [ ] Enter 3 darts, check target progression
- [ ] Click Undo, verify dart removed and target reverts
- [ ] Click Submit, verify turn switches
- [ ] Verify miss keeps same target
- [ ] Verify double/triple advances correctly in increase mode
