# DartBot Checkout Persistence Fix

## Problem
The dartbot was not behaving like a real darts player during checkout attempts. When it had a checkout opportunity, it would aim for the correct target on the first dart, but then revert to aiming at T20 on the second and third darts instead of continuing to try to finish the game.

Example problematic behavior:
- Bot has 80 left
- Dart 1: Aims at T20 (trying to leave 20 for a double) ✓
- Dart 2: Reverts to aiming at T20 instead of continuing checkout ✗
- Dart 3: Reverts to aiming at T20 instead of continuing checkout ✗

## Root Cause
There was a bug in the replanning logic in `lib/botThrowEngine.ts`. After each dart, the bot would replan its targets and create a new array. However, the loop index `i` continued from 0, 1, 2, but the code was trying to access `plannedTargets[i]`, which would be wrong after replanning since the new plan starts at index 0.

Example of the bug:
```typescript
// Initial plan: ['T20', 'D20']
for (let i = 0; i < 3; i++) {
  const aimTarget = plannedTargets[i] || 'T20';  // BUG: wrong index after replan
  // ... throw dart ...
  // ... replan after dart 1 ...
  plannedTargets = ['20', 'D20'];  // New plan, but i = 1 now!
  // Next iteration: plannedTargets[1] = 'D20' when we should use plannedTargets[0] = '20'
}
```

## Solution

### 1. Fixed Target Indexing (Primary Fix)
Added a `plannedTargetIndex` variable that resets to 0 after each replan:

```typescript
let plannedTargetIndex = 0;

for (let i = 0; i < 3; i++) {
  // Always use index 0 since we replan after each dart
  const aimTarget = plannedTargets[plannedTargetIndex] || plannedTargets[0] || 'T20';

  // ... throw dart ...

  if (dartsLeft > 0) {
    // Replan and reset index
    plannedTargets = replanAfterDart(...);
    plannedTargetIndex = 0;  // ← Key fix: always start from beginning of new plan
  }
}
```

### 2. Enhanced Checkout Logic
Improved the `planBotTurn` function to better handle checkout situations:

- Added explicit commitment to checkout attempts when in range (≤170)
- Better handling of edge cases where no standard checkout route exists
- Improved logic for setting up favorite doubles (D20, D16, D8, etc.)
- Added fallback logic for trying to finish even when slightly off the ideal route

Key changes:
```typescript
// === 41-170 → PLAN MULTI-DART CHECKOUT ===
if (doubleOut && remaining <= 170 && !impossibleCheckouts.has(remaining)) {
  const route = checkoutRoutes[remaining];
  if (route) {
    // Plan the whole route - commit to the checkout!
    return route.slice(0, dartsAvailable);
  }

  // No standard route, but we're in checkout range - try to find a way
  if (remaining <= 60) {
    // Try to leave a favorite double for next turn
    // ... intelligent setup logic ...
  }
}
```

### 3. Improved Replanning Logic
Enhanced the replanning logic to better handle checkout situations:

```typescript
if (canNowCheckout) {
  const newRoute = findBestCheckoutRoute(currentRemaining, dartsLeft);
  if (newRoute) {
    plannedTargets = newRoute;
    plannedTargetIndex = 0;  // Reset to start of new plan
    wasCheckoutAttempt = true;
  } else {
    // Still try to set up a good checkout position if close
    if (currentRemaining <= 60) {
      plannedTargets = planBotTurn(currentRemaining, doubleOut, level, dartsLeft);
      plannedTargetIndex = 0;
    }
  }
}
```

## Real Darts Player Behavior

The bot now thinks like a real darts player:

1. **Recognizes checkout opportunities**: When remaining score is ≤170 and finishable
2. **Commits to the checkout**: Continues trying to finish for all 3 darts
3. **Adapts intelligently**: Replans after each dart based on where it actually landed
4. **Understands doubles**: Knows it must end on a double (D1-D20 or Bull)
5. **Uses setup shots**: Hits singles to leave favorite doubles (D20, D16, D8, etc.)

Example improved behavior:
- Bot has 57 left (checkout opportunity)
- Dart 1: Aims at S17 (to leave D20) → Hits S20 (leaves 37)
- Dart 2: Recognizes 37 is odd, aims at S5 (to leave D16) ✓
- Dart 3: Aims at D16 to finish ✓

## Impact

The dartbot now provides:
- More realistic gameplay against AI opponents
- Better training for players learning checkout strategies
- Proper demonstration of how to think through checkout attempts
- Consistent behavior across all difficulty levels (beginner through professional)

## Files Modified
- `/lib/botThrowEngine.ts`: Fixed target indexing and enhanced checkout planning logic

## Testing
Verified with TypeScript compilation - no errors detected.
