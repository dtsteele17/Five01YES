# Premium Ranked Match Interface

## Overview
Created a dedicated, premium-styled ranked match interface at `/app/ranked/match/[roomId]` with enhanced UX/UI for competitive play.

## Route Structure
**URL**: `/app/ranked/match/[roomId]`
**File**: `/app/app/ranked/match/[roomId]/page.tsx`
**Purpose**: Full match interface for ranked competitive play

## Key Features

### 1. Premium Branding
- **FIVE01** branding in top-left with amber/orange gradient
- **"RANKED MATCH"** badge with gradient background and shadow effects
- Match meta info: "501 • Best of 5 • Double Out"
- Premium color scheme: Amber/gold accents vs emerald for quick match

### 2. Match Loading with Retry Logic
- **8 retry attempts** with 250ms delays (total ~2 seconds)
- Queries correct table: `ranked_match_rooms` (not `match_rooms`)
- Uses `.maybeSingle()` to avoid errors on null results
- Comprehensive console logging for debugging:
  ```
  [RankedMatch] Loading match room: {roomId}
  [RankedMatch] Room loaded successfully: { id, status, match_type, game_mode }
  [RankedMatch] Profiles loaded: 2
  [RankedMatch] Events loaded: 15
  ```

### 3. Player Panels
- Large remaining score display (5xl font)
- Avatar with gradient backgrounds (blue/cyan for P1, orange/red for P2)
- Legs won counter
- Active turn indicator with emerald border and "YOUR TURN" badge
- Hover effects with amber border

### 4. Scoring Interface
Two modes with tab switcher:
- **Dartboard Mode**: Singles/Doubles/Triples/Bulls selector + number grid
- **Quick Input Mode**: Direct score entry with large numeric input

Features:
- Current visit display with amber score total
- Dart badges showing throws (e.g., "D20", "T19", "Bull")
- Clear, Bust, and Submit buttons
- Checkout suggestions when score ≤ 170

### 5. Visit History
- Compact scrollable list (max 10 recent visits)
- Shows player name, score, remaining
- Highlights current user's visits with emerald
- BUST and WIN badges
- Real-time updates via Supabase subscriptions

### 6. Forfeit System
- Red "Forfeit" button in top-right
- Confirmation dialog with warning about RP loss
- Stubbed for now (shows toast message)

### 7. Match Completion
When match finishes:
- Automatically calls `rpc_ranked_finalize_match()`
- Shows results modal with:
  - Victory/Defeat message
  - RP changes for both players (with up/down arrows)
  - New rating and division
  - "Play Again" and "Dashboard" buttons

### 8. Real-time Updates
Subscribes to:
- `ranked_match_rooms` table changes (room state)
- `match_events` table inserts (new throws/visits)

Console logs all updates:
```
[RankedMatch] Room update received: { status: 'in_progress' }
[RankedMatch] New event received: { event_type: 'visit', score: 60 }
```

## Navigation Flow

### Before This Update
```
Matchmaking → poll returns matched → router.push('/app/match/ranked/{id}')
```

### After This Update
```
Matchmaking → poll returns matched → router.push('/app/ranked/match/{id}')
```

Updated in:
- `/app/app/ranked/page.tsx` (line 199)
- `/app/app/play/page.tsx` (line 268)

## Database Queries

### Load Match Room
```typescript
const { data, error } = await supabase
  .from('ranked_match_rooms')  // ✅ Correct table
  .select('*')
  .eq('id', roomId)
  .maybeSingle();  // ✅ Returns null instead of throwing
```

### Load Profiles
```typescript
const { data: profilesData } = await supabase
  .from('profiles')
  .select('user_id, username')
  .in('user_id', [player1_id, player2_id]);
```

### Load Events
```typescript
const { data: eventsData } = await supabase
  .from('match_events')
  .select('*')
  .eq('room_id', roomId)
  .order('seq', { ascending: true });
```

### Submit Score
```typescript
const { data, error } = await supabase.rpc('submit_quick_match_throw', {
  p_room_id: roomId,
  p_score: score,
});
```

### Finalize Match
```typescript
const { data, error } = await supabase.rpc('rpc_ranked_finalize_match', {
  p_match_room_id: roomId,
  p_winner_id: winner_id,
  p_legs_p1: player1_legs,
  p_legs_p2: player2_legs,
});
```

## Design Tokens

### Colors
- **Background**: `from-slate-950 via-slate-900 to-slate-950`
- **Accent**: Amber/Orange gradient (`from-amber-500 to-orange-500`)
- **Active Turn**: Emerald (`emerald-500`, `emerald-600`)
- **Cards**: `slate-900/50` with `backdrop-blur-sm`
- **Borders**: `amber-500/20` (premium), `white/10` (standard)

### Typography
- **Brand**: `2xl font-black` with gradient text
- **Badge**: `font-bold` with shadow
- **Scores**: `5xl font-black` (player remaining)
- **Visit Total**: `3xl font-black text-amber-400`

### Spacing
- Main content: `max-w-7xl mx-auto p-4`
- Grid: `lg:grid-cols-3` (1 col for players, 2 cols for scoring)
- Gap: `gap-4` (consistent 1rem spacing)

## Console Logs Reference

### Loading
```
[RankedMatch] Loading match room: abc-123
[RankedMatch] Room loaded successfully: { id, status, match_type, game_mode }
[RankedMatch] Profiles loaded: 2
[RankedMatch] Events loaded: 0
[RankedMatch] Setting up realtime subscriptions
```

### With Retry
```
[RankedMatch] Loading match room: abc-123
[RankedMatch] Room not found yet (attempt 1)
[RankedMatch] Retry 1/7 after 250ms
[RankedMatch] Room loaded successfully: { ... }
```

### Real-time Updates
```
[RankedMatch] Room update received: { status: 'in_progress', current_turn: 'player1' }
[RankedMatch] New event received: { event_type: 'visit', score: 60, ... }
```

### Score Submission
```
[RankedMatch] Submitting score: 60
[RankedMatch] Score submitted successfully
```

### Match Completion
```
[RankedMatch] Finalizing match: abc-123
[RankedMatch] Match finalized successfully: { winner_id, player1: {...}, player2: {...} }
```

### Errors
```
[RankedMatch] Not authenticated
[RankedMatch] Wrong match type: quick_match
[RankedMatch] Failed to load room after all retries: <error>
[RankedMatch] Error submitting score: <error>
```

## Differences from Quick Match

| Feature | Quick Match | Ranked Match |
|---------|------------|--------------|
| Badge Color | Blue/Cyan | Amber/Orange |
| Badge Text | "QUICK MATCH" | "RANKED MATCH" |
| Primary Accent | Emerald | Amber |
| Branding | Standard | "FIVE01" premium |
| Match End | Rematch option | RP results, Play Again |
| Forfeit | Leave match | RP penalty warning |
| Route | `/app/play/quick-match/match/[id]` | `/app/ranked/match/[id]` |
| Table | `quick_match_rooms` | `ranked_match_rooms` |
| Camera | WebRTC support | Not implemented (future) |

## Testing Checklist

### Loading
- [ ] Page loads after matchmaking completes
- [ ] Retry logic works if room not immediately available
- [ ] Correct table (`ranked_match_rooms`) is queried
- [ ] Console logs show successful load
- [ ] Player profiles load correctly

### UI/UX
- [ ] "FIVE01" branding appears in top-left
- [ ] "RANKED MATCH" badge displays with amber gradient
- [ ] Match meta shows "501 • Best of 5 • Double Out"
- [ ] Active player has emerald border + "YOUR TURN" badge
- [ ] Score displays are large and readable
- [ ] Forfeit button appears in top-right

### Scoring
- [ ] Can select darts in dartboard mode
- [ ] Current visit shows selected darts
- [ ] Visit total updates correctly
- [ ] Can switch to quick input mode
- [ ] Submit button submits score successfully
- [ ] Bust button submits score of 0
- [ ] Turn changes after submission

### Real-time
- [ ] Visit history updates when opponent throws
- [ ] Room state updates (turn, remaining scores)
- [ ] New events appear in visit history
- [ ] No duplicate events

### Match Completion
- [ ] Match finishes when player reaches 0 on double
- [ ] Results modal shows automatically
- [ ] RP changes display correctly (up/down arrows)
- [ ] New rating and division shown
- [ ] "Play Again" navigates to queue
- [ ] "Dashboard" returns to main page

### Errors
- [ ] Auth failure redirects to login
- [ ] Room not found redirects to ranked page
- [ ] Wrong match type shows error
- [ ] Score submission errors are caught
- [ ] Network errors don't crash the page

## Future Enhancements
1. **Forfeit Implementation**: Hook up to backend RPC to handle RP penalty
2. **Camera Support**: Add WebRTC video like quick match
3. **Stats Display**: Show live averages, first 9 avg, etc.
4. **Leaderboard Integration**: Show rank changes in real-time
5. **Match History**: Link to completed match details
6. **Achievements**: Trigger ranked-specific achievements
7. **Animations**: Add victory/defeat animations
8. **Sound Effects**: Add audio for checkouts, wins, losses

## Files Modified
1. `/app/app/ranked/match/[roomId]/page.tsx` - New premium ranked match interface
2. `/app/app/ranked/page.tsx` - Updated navigation (line 199)
3. `/app/app/play/page.tsx` - Updated navigation (line 268)

## Build Output
```
Route: /app/ranked/match/[roomId]
Size: 9.01 kB
First Load JS: 174 kB
Type: λ (Server-side render at runtime)
```

## Success Criteria ✅
- [x] Route created at `/app/ranked/match/[roomId]`
- [x] Loads from `ranked_match_rooms` table (not `match_rooms`)
- [x] Retry logic implemented (8 attempts, 250ms delay)
- [x] Premium UI with "FIVE01" branding
- [x] "RANKED MATCH" badge with amber gradient
- [x] Scoring interface with dartboard + quick input
- [x] Visit history with real-time updates
- [x] Forfeit button with confirmation dialog
- [x] Match completion with RP results
- [x] Navigation updated in both entry points
- [x] Build passes successfully
- [x] Console logs are clean and informative
- [x] No references to "Quick Match" on ranked page
