# DartBot Full Scoring Area - Confirmed

## Summary
The dartbot **correctly recognizes the full scoring area** from center all the way out to the board edge at R_BOARD (0.57). This includes the area beyond the double ring.

## Scoring Area Breakdown

### Full Scoring Range: 0 to 0.57 (57% of PNG)
All darts landing within this range will score points:

1. **Bull (center)**: 0 to 0.026
   - Inner Bull (DBull): 50 points
   - Outer Bull (SBull): 25 points

2. **Inner Singles**: 0.052 to 0.2425
   - Scores face value of the segment (1-20)

3. **Treble Ring**: 0.2425 to 0.2775
   - Scores 3x the segment value (T20 = 60 pts)

4. **Outer Singles**: 0.2775 to 0.4225
   - Scores face value of the segment (1-20)

5. **Double Ring**: 0.4225 to 0.4675
   - Scores 2x the segment value (D20 = 40 pts)

6. **Number Ring Area**: 0.4675 to 0.57
   - **STILL SCORES as singles!** (face value 1-20)
   - This is the black number ring visible on the PNG
   - Darts landing here are NOT misses

7. **Off Board**: Beyond 0.57
   - No score (miss)

## Key Points

### The Full Width Scores
- Darts can land **beyond the double ring** (past 0.4675) and still score
- The area from 0.4675 to 0.57 scores as **singles in that segment**
- Only darts beyond 0.57 are considered off-board misses

### Visual Calibration Lines
- The visual calibration lines show the scoring rings
- **DO NOT touch these lines** - they are perfectly aligned
- The green outer circle at R_BOARD (0.57) shows the board edge
- Everything inside that green circle scores

## Verification Tests

The `verifyCalibration()` function now includes tests for:

1. ✓ T20 aim point is in treble ring
2. ✓ D20 aim point is in double ring
3. ✓ Perfect T20 throw scores 60 points
4. ✓ Perfect D20 throw scores 40 points
5. ✓ Bull aim point is at center
6. ✓ Center throw scores 50 points
7. ✓ **Dart beyond double ring (at 0.52) still scores as single**
8. ✓ **Dart near board edge (at 0.569) still scores as single**
9. ✓ **Dart beyond board edge (at 0.58) is correctly a miss**

## Example Scenarios

### Scenario 1: Wide Double Attempt
- Bot aims at D20 (radius 0.445)
- Dart scatters wide and lands at radius 0.50
- **Result**: Scores as S20 (20 points) - NOT a miss!

### Scenario 2: Very Wide Throw
- Bot aims at T20 (radius 0.26)
- Dart scatters very wide and lands at radius 0.55
- **Result**: Scores as S20 (20 points) - still on the board!

### Scenario 3: Off the Board
- Dart lands at radius 0.60
- **Result**: Miss (0 points) - beyond the board edge

## Code Implementation

The scoring logic in `evaluateDartFromXY()`:

```typescript
// Check if off the board (beyond scoring area)
if (radius > R_BOARD) {  // R_BOARD = 0.57
  return { label: 'MISS', score: 0, offboard: true };
}

// Check bulls, segments, doubles, trebles...

// Fallthrough: anything else within R_BOARD scores as single
return {
  label: `S${number}`,
  score: number,  // Face value
  offboard: false
};
```

This ensures **any dart landing within the board edge scores points**, even if it's outside the double ring.

## Visual Calibration Unchanged

- Green dashed line: Board edge at R_BOARD (0.57) ✓
- Red rings: Double ring boundaries (0.4225 - 0.4675) ✓
- Yellow rings: Treble ring boundaries (0.2425 - 0.2775) ✓
- Cyan rings: Bull boundaries (0.026 - 0.052) ✓

**These lines are perfect and have not been changed!**

## Conclusion

The dartbot fully understands that:
1. The scoring area extends from center to R_BOARD (0.57)
2. The area beyond the double ring (0.4675 to 0.57) scores as singles
3. Only darts beyond R_BOARD (0.57) are misses
4. The visual calibration lines correctly represent the dartbot's scoring system

**The dartbot knows it can score all the way out to the doubles and beyond!**

## Date
February 11, 2026
