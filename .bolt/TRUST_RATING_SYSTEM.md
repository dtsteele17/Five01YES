# Trust Rating System

## Overview
Complete Trust Rating system using letter grades A-E with N (neutral) for unrated users. Players rate opponents after matches, and ratings are displayed throughout the app using color-coded badges.

## Components

### 1. TrustBadge Component
**File:** `components/TrustBadge.tsx`

Displays trust rating as a circular colored badge.

**Props:**
```typescript
{
  letter?: 'A' | 'B' | 'C' | 'D' | 'E' | 'N' | null;
  size?: 'sm' | 'md';
}
```

**Color Scheme:**
- **A**: Green (bg-green-600, white text) - Excellent
- **B**: Lime (bg-lime-500, dark text) - Good
- **C**: Yellow (bg-yellow-500, dark text) - Average
- **D**: Orange (bg-orange-500, white text) - Below Average
- **E**: Red (bg-red-600, white text) - Poor
- **N**: Gray (bg-gray-500, white text) - Not Rated (default)

**Default Behavior:**
- Missing or null letter defaults to 'N' (neutral/unrated)
- Shows tooltip: "Trust Rating: Not yet rated" for N

### 2. TrustRatingModal Component
**File:** `components/TrustRatingModal.tsx`

Modal shown when match ends, allowing players to rate opponent.

**Props:**
```typescript
{
  open: boolean;
  matchId: string;
  opponentId: string;
  onDone: () => void;
}
```

**Features:**
- 5 colored letter buttons (E, D, C, B, A)
- Skip button for optional rating
- Handles "already rated" case gracefully
- Shows loading state during submission
- Calls `rpc_submit_trust_rating` RPC

**User Flow:**
1. Modal appears automatically when match ends
2. User clicks letter or Skip
3. Submits to backend via RPC
4. Shows "Already rated" if duplicate
5. Calls onDone() callback
6. Game Over modal then appears

## Backend Integration

### Database Schema (Existing)

**Table: `trust_ratings`**
```sql
- from_user_id (uuid)
- to_user_id (uuid)
- match_id (uuid)
- rating (text) -- 'A', 'B', 'C', 'D', or 'E'
- created_at (timestamp)
- UNIQUE(from_user_id, to_user_id)
```

**View: `user_trust_summary`**
```sql
- user_id (uuid)
- ratings_count (int)
- avg_score (numeric) -- 5=A, 4=B, 3=C, 2=D, 1=E
- trust_letter (text) -- Computed from rounded avg_score
```

### RPC Functions

**1. Submit Rating**
```typescript
supabase.rpc('rpc_submit_trust_rating', {
  p_match_room_id: uuid,
  p_rating: 'A' | 'B' | 'C' | 'D' | 'E'
})
```

Returns: `{ rated: boolean }` or error

**2. Get Trust Summary**
```typescript
supabase.rpc('rpc_get_trust_summary', {
  p_user_id: uuid
})
```

Returns:
```json
{
  "trust_letter": "A" | "B" | "C" | "D" | "E" | "N",
  "ratings_count": 0,
  "avg_score": 0
}
```

Returns "N" with 0 ratings if user has no ratings.

## Implementation

### Match End Flow
**File:** `app/app/play/quick-match/match/[matchId]/page.tsx`

**State:**
```typescript
const [showTrustModal, setShowTrustModal] = useState(false);
const [trustPromptedForMatchId, setTrustPromptedForMatchId] = useState<string | null>(null);
const [pendingEndReason, setPendingEndReason] = useState<'win' | 'forfeit' | null>(null);
const [opponentTrustLetter, setOpponentTrustLetter] = useState<TrustLetter>('N');
```

**Flow:**
1. Match ends (status → finished/forfeited)
2. Detect in useEffect
3. Show TrustRatingModal FIRST (if not shown already)
4. User rates or skips
5. Show Game Over modal AFTER trust modal

**Opponent Trust Fetch:**
```typescript
useEffect(() => {
  async function fetchOpponentTrust() {
    if (!opponentId) return;

    const { data, error } = await supabase.rpc('rpc_get_trust_summary', {
      p_user_id: opponentId,
    });

    if (data?.trust_letter) {
      setOpponentTrustLetter(data.trust_letter as TrustLetter);
    } else {
      setOpponentTrustLetter('N'); // Default for unrated
    }
  }

  fetchOpponentTrust();
}, [opponentId]);
```

**Display:**
```tsx
<div className="flex items-center gap-2">
  <p className="text-sm font-semibold text-white">{opponentName}</p>
  <TrustBadge letter={opponentTrustLetter} size="sm" />
</div>
```

### Profile Page
**File:** `app/app/profile/page.tsx`

**Fetch Trust Rating:**
```typescript
async function fetchTrustRating() {
  if (!profile?.id) return;

  const { data, error } = await supabase.rpc('rpc_get_trust_summary', {
    p_user_id: profile.id,
  });

  if (data) {
    setTrustSummary({
      user_id: profile.id,
      ratings_count: data.ratings_count || 0,
      avg_score: data.avg_score || 0,
      trust_letter: (data.trust_letter || 'N') as TrustLetter,
    });
  } else {
    // Default to N with 0 ratings
    setTrustSummary({
      user_id: profile.id,
      ratings_count: 0,
      avg_score: 0,
      trust_letter: 'N',
    });
  }
}
```

**Display:**
```tsx
<div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
  <span className="text-gray-400">Trust Rating</span>
  <div className="flex items-center gap-2">
    <TrustBadge letter={trustSummary?.trust_letter || 'N'} size="md" />
    <span className="text-white font-medium text-sm">
      ({trustSummary?.ratings_count || 0} {trustSummary?.ratings_count === 1 ? 'rating' : 'ratings'})
    </span>
  </div>
</div>
```

## Key Features

### 1. One Rating Per Opponent
- Database enforces via UNIQUE(from_user_id, to_user_id)
- Backend returns { rated: false } for duplicates
- UI shows "Already rated" message

### 2. Neutral Default (N)
- All unrated users show 'N' badge (gray)
- No negative bias for new users
- Clear distinction between "unrated" and "poor"

### 3. Non-Blocking
- Rating is optional (can skip)
- Match flow continues regardless
- No penalty for skipping

### 4. Always Show Before Game Over
- Trust modal appears FIRST
- Game Over modal shown AFTER rating/skip
- Uses flag to prevent duplicate prompts

### 5. Real-Time Display
- Opponent's badge shown during match
- Fetched once at match start
- Updates on profile page after receiving ratings

## Rating Calculation

**Letter to Score Mapping:**
- A = 5 points
- B = 4 points
- C = 3 points
- D = 2 points
- E = 1 point

**Example:**
- User receives: 5× A ratings + 5× C ratings
- Total: (5×5) + (5×3) = 25 + 15 = 40 points
- Average: 40 ÷ 10 = 4.0
- Rounded: 4 → Letter: **B**

## Usage Patterns

### In Match UI
```tsx
import { TrustBadge, TrustLetter } from '@/components/TrustBadge';

const [opponentTrust, setOpponentTrust] = useState<TrustLetter>('N');

// Fetch opponent trust
useEffect(() => {
  fetchTrust(opponentId).then(setOpponentTrust);
}, [opponentId]);

// Display
<TrustBadge letter={opponentTrust} size="sm" />
```

### In Lists/Search Results
```typescript
// For multiple users, batch query user_trust_summary view
const { data } = await supabase
  .from('user_trust_summary')
  .select('user_id, trust_letter')
  .in('user_id', userIds);

// Map results
const trustMap = new Map(data?.map(d => [d.user_id, d.trust_letter]));

// Render with default 'N' for missing
users.map(user => (
  <TrustBadge letter={trustMap.get(user.id) || 'N'} size="sm" />
))
```

## Security & Privacy

### Database Security
- RLS policies enforce authentication
- Only auth.uid() can submit ratings
- Users can't see individual ratings
- Only aggregated summary visible

### Input Validation
- Only A-E letters accepted
- Backend validates all inputs
- Malformed requests rejected

### Abuse Prevention
- One rating per opponent (lifetime)
- No rating modification
- No rating deletion
- Database constraint enforced

## Error Handling

### Network Errors
```typescript
try {
  const { data, error } = await supabase.rpc(...);
  if (error) throw error;
} catch (err) {
  console.error('Failed to fetch trust rating:', err);
  setTrustLetter('N'); // Fail safe to neutral
  toast.error('Failed to load trust rating');
}
```

### Missing Data
- RPC returns trust_letter: "N" when no ratings
- Frontend defaults to 'N' if RPC fails
- UI never shows undefined/null badges

### Already Rated
- Modal shows "Already rated" message
- Proceeds to Game Over after 1.5s delay
- No error thrown, graceful handling

## Testing

### Manual Test Cases
1. **New User**: Badge shows 'N' (gray)
2. **After 1 Rating**: Badge updates to rated letter
3. **Multiple Ratings**: Badge shows rounded average
4. **Match End**: Trust modal appears before Game Over
5. **Skip Rating**: Proceeds to Game Over
6. **Submit Rating**: Shows success, proceeds
7. **Already Rated**: Shows message, proceeds
8. **Network Error**: Falls back to 'N', shows error

### Edge Cases
- No opponent: Modal doesn't show
- Duplicate rating: Message shown, no error
- RPC failure: Defaults to 'N'
- Component unmount: Cleanup prevents leaks
- Multiple match ends: Only prompts once

## Files Modified

### New Files
1. `components/TrustBadge.tsx` - Badge component
2. `components/TrustRatingModal.tsx` - Rating modal

### Modified Files
1. `app/app/play/quick-match/match/[matchId]/page.tsx`
   - Trust modal integration
   - Opponent badge display
   - RPC integration

2. `app/app/profile/page.tsx`
   - Trust rating display
   - RPC integration

## Performance

### Optimization Strategies
1. **Lazy Loading**: Fetch only when needed
2. **Single Query**: RPC aggregates efficiently
3. **Default Values**: Instant 'N', no spinner
4. **Minimal Re-renders**: Optimized state updates
5. **Small Bundle**: Badge component <1KB

### Database Performance
- View uses indexed queries
- RPC cached by Supabase
- Batch queries for lists
- No N+1 query issues

## Future Enhancements

Possible improvements:
1. Trust badges in friends list
2. Trust badges in tournament brackets
3. Trust filter in matchmaking
4. Rating history timeline
5. Rating breakdown chart
6. Trust leaderboard
7. Report alongside rating
8. Rating edit window (24h)
9. Trust trend indicator
10. Anonymous rating feedback

## Debug Logging

All operations log to console:

```
[TRUST_RATING] Match ended, showing trust modal first
[TRUST_RATING] Opponent trust rating: A
[TRUST_RATING] Submitting rating: { matchId, opponentId, rating }
[TRUST_RATING] RPC response: { rated: true }
[TRUST_RATING] Already rated this opponent
[TRUST_RATING] Modal done, showing game over modal
[TRUST_RATING] Error fetching opponent trust: ...
[TRUST_RATING] No trust rating found for opponent, using default N
```

## Summary

The Trust Rating system is fully functional with:
- ✅ Letter grades A-E with N for unrated
- ✅ Gray badge for unrated users (not negative)
- ✅ Modal before Game Over screen
- ✅ One rating per opponent (enforced)
- ✅ Skip option (non-blocking)
- ✅ RPC integration (rpc_get_trust_summary)
- ✅ Real-time badge display
- ✅ Profile page integration
- ✅ Match UI integration
- ✅ Error handling with fallbacks
- ✅ Type-safe implementation
- ✅ Build verified successfully

The system helps build a trustworthy community by allowing players to rate each other while preventing abuse through database constraints and one-rating-per-opponent enforcement.
