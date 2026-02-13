# Bust Darts and Checkout Percentage Fixes

## Summary
Fixed three issues:
1. Bust visits not counting toward darts thrown stats
2. Checkout percentage calculation not using `darts_at_double`
3. Dartbot matches not storing `dartsAtDouble` in visit data

## Changes Made

### 1. SQL Function Fix (`SQL_FIXES_CHECKOUT_AND_BUST.sql`)
**File**: `FIX_ALL_STATS_ISSUES.sql` (fn_update_player_match_stats function)

**Changes**:
- Include ALL visits (including busts) in darts thrown calculation
- Use `darts_at_double` field from visits for accurate checkout percentage
- Checkout percentage formula: `checkouts / sum(darts_at_double)`

```sql
-- Before: Only non-bust visits
AND is_bust = false

-- After: All visits, but only count score for non-bust
-- Count darts for ALL visits including busts
v_match_darts := v_match_darts + COALESCE(v_visit.darts_thrown, 3);

-- FIX: Calculate checkout attempts from darts_at_double
v_match_checkout_attempts := v_match_checkout_attempts + COALESCE(v_visit.darts_at_double, 1);
```

### 2. Quick Match Page Fixes
**File**: `app/app/play/quick-match/match/[matchId]/page.tsx`

#### Fix A: calculatePlayerStatsFromVisits function
- Include bust visits in total darts calculation
- Use `darts_at_double` for checkout percentage

```typescript
// Include ALL player visits (including busts) for darts thrown
const allPlayerVisits = visitData.filter(v => v.player_id === playerId);
const playerVisits = allPlayerVisits.filter(v => !v.is_bust);

// Count darts from ALL visits including busts
const totalDarts = allPlayerVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);

// Use darts_at_double for checkout percentage
const checkoutAttempts = playerVisits
  .filter(v => v.remaining_before <= 170 && v.remaining_before > 0)
  .reduce((sum, v) => sum + (v.darts_at_double || 1), 0);
```

#### Fix B: calculatePlayerStats function
- Same fixes as above

#### Fix C: calculateMatchStats function
- Include bust visits in darts count for display

### 3. Dartbot Training Page Fixes
**File**: `app/app/play/training/501/page.tsx`

#### Fix A: Visit interface
Added `dartsAtDouble` field:
```typescript
interface Visit {
  // ... other fields
  dartsAtDouble?: number; // Number of darts thrown at double
}
```

#### Fix B: handleScoreSubmit function
- Store `dartsAtDouble` in visit data
- For typed input: use value from dialog
- For button input: calculate from darts
- For busts: set to 0

```typescript
const visit: Visit = { 
  // ... other fields
  dartsAtDouble, 
  // ...
};
```

#### Fix C: calculatePlayerStatsFromVisits function
- Use `dartsAtDouble` field instead of `dartsThrown` for checkout percentage

```typescript
const dartsAtDouble = playerVisits
  .filter(v => /* in checkout range */)
  .reduce((sum, v) => sum + (v.dartsAtDouble || 1), 0);
```

## How It Works

### For Scoring Buttons (Quick Match)
1. Player clicks dart buttons to input their throw
2. System tracks which darts were at double (when remaining <= 170)
3. On checkout, CheckoutDetailsDialog asks:
   - How many darts thrown? (1-3)
   - How many darts at the double? (1-2)
4. These values are stored in `quick_match_visits` table
5. Stats calculation uses `darts_at_double` for checkout percentage

### For Typed Scores (Quick Match & Dartbot)
1. Player types their score
2. On checkout or when remaining <= 170, CheckoutDetailsDialog asks:
   - How many darts thrown? (1-3)
   - How many darts at the double? (1-2)
3. Values are passed to `handleScoreSubmit`
4. Stored in visit data and database

### For Busts
1. Player clicks "Bust" or types a bust score
2. CheckoutDetailsDialog asks: "How many darts did you throw?" (1-3)
3. Darts thrown is stored, but `darts_at_double = 0`
4. Darts count toward total darts thrown for average calculation
5. Score is 0 (doesn't affect points scored)

## Checkout Percentage Formula

Like dartcounter.net:
```
checkoutPercentage = (successfulCheckouts / totalDartsAtDouble) * 100
```

Example:
- Player checks out 3 times
- Uses 5 darts at double (2+1+2)
- Checkout % = (3/5) * 100 = 60%

## Testing

1. **Bust Tracking**:
   - Play a match, bust on a turn
   - Verify darts thrown includes the bust darts
   - Check 3-dart average is calculated correctly

2. **Checkout Percentage**:
   - Make multiple checkout attempts
   - Track how many darts at double were used
   - Verify percentage = checkouts / darts_at_double

3. **Typed Input**:
   - Use typed score input
   - Verify dialog asks for darts thrown and darts at double
   - Verify values are stored and used in stats

## Migration

Run the SQL file to update the database function:
```sql
-- Apply the fix
\i SQL_FIXES_CHECKOUT_AND_BUST.sql
```

Or apply directly in Supabase SQL Editor.
