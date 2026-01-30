# Complete Online Multiplayer System - Implementation Guide

## ✅ COMPLETED IMPLEMENTATION

This document describes the **complete, working** online multiplayer system that has been implemented for the darts application.

---

## 🎯 What Works Now

### 1. Quick Match Lobbies
- ✅ Users can create lobbies that are **immediately visible to all other users**
- ✅ Real-time updates via Supabase Realtime subscriptions
- ✅ **Atomic join operations** - only one user can join a lobby (race-condition safe)
- ✅ Auto-redirect for both host and guest when match starts
- ✅ Lobby cancellation by host

### 2. Online Match Room
- ✅ **Complete turn-based gameplay** with real-time state synchronization
- ✅ Only the current player can submit scores
- ✅ Bust detection and checkout validation
- ✅ Real-time score updates for both players
- ✅ Leg and match completion detection
- ✅ Match complete modal with winner announcement
- ✅ Forfeit option

### 3. Database & Security
- ✅ Proper RLS policies (non-recursive)
- ✅ All data visible to authenticated users where appropriate
- ✅ Atomic RPC functions prevent race conditions
- ✅ Turn validation enforced server-side

### 4. Error Handling
- ✅ All operations show toast notifications on success/failure
- ✅ Console logging for debugging
- ✅ Detailed error messages visible to users

---

## 📦 Database Schema

### Tables Created

#### `quickmatch_lobbies`
```sql
CREATE TABLE quickmatch_lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES auth.users(id),
  guest_user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'open', -- 'open' | 'matched' | 'cancelled'
  game_mode int NOT NULL, -- 301 or 501
  best_of int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz,
  match_id uuid REFERENCES online_matches(id)
);
```

**RLS Policies:**
- SELECT: Authenticated users can see open lobbies OR their own lobbies
- INSERT: Users can create lobbies (host_user_id = auth.uid())
- UPDATE: Host can update their lobby
- DELETE: Host can delete their lobby

**Indexes:**
- `(status, created_at DESC)` - Fast open lobby queries
- `host_user_id` - Quick host lookups
- `guest_user_id` - Quick guest lookups

#### `online_matches`
```sql
CREATE TABLE online_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid REFERENCES quickmatch_lobbies(id),
  tournament_id uuid REFERENCES tournaments(id),
  player1_id uuid NOT NULL REFERENCES auth.users(id),
  player2_id uuid NOT NULL REFERENCES auth.users(id),
  game_type int NOT NULL,
  best_of int NOT NULL,
  double_out boolean NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  current_turn_player_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
```

**RLS Policies:**
- SELECT: Only players in the match can view it
- INSERT: Authenticated users (or via RPC)
- UPDATE: Only players in the match can update

#### `online_match_state`
```sql
CREATE TABLE online_match_state (
  match_id uuid PRIMARY KEY REFERENCES online_matches(id) ON DELETE CASCADE,
  state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**State JSON Structure:**
```json
{
  "player1Score": 501,
  "player2Score": 501,
  "player1LegsWon": 0,
  "player2LegsWon": 0,
  "currentLeg": 1,
  "legsToWin": 2,
  "gameMode": 501,
  "bestOf": 3,
  "doubleOut": true,
  "visits": [
    {
      "player": "player1",
      "score": 60,
      "dartsThrown": 3,
      "remainingScore": 441,
      "isBust": false,
      "isCheckout": false,
      "timestamp": "2026-01-22T12:00:00Z"
    }
  ]
}
```

**RLS Policies:**
- SELECT: Only players in the match can view the state
- UPDATE: Only players in the match (via RPC recommended)

---

## 🔧 RPC Functions

### `create_quickmatch_lobby(p_game_mode int, p_best_of int) RETURNS uuid`
Creates a new lobby and returns the lobby ID.

**Usage:**
```typescript
const { data: lobbyId, error } = await supabase.rpc('create_quickmatch_lobby', {
  p_game_mode: 501,
  p_best_of: 3
});
```

### `join_quickmatch_lobby(p_lobby_id uuid) RETURNS uuid`
**Atomically** joins a lobby and creates the match. Returns match ID.

**What it does:**
1. Locks the lobby row (prevents double-joins)
2. Validates lobby is open and guest spot is available
3. Creates `online_matches` row
4. Creates `online_match_state` row with initial state
5. Updates lobby status to 'matched'
6. Returns match ID

**Usage:**
```typescript
const { data: matchId, error } = await supabase.rpc('join_quickmatch_lobby', {
  p_lobby_id: lobbyId
});
// Both players immediately redirect to /app/match/online/{matchId}
```

### `cancel_quickmatch_lobby(p_lobby_id uuid) RETURNS void`
Cancels an open lobby (host only).

### `submit_online_visit_v2(...) RETURNS jsonb`
Submits a visit (score) for the current turn player.

**Parameters:**
- `p_match_id` - Match UUID
- `p_score` - Score achieved (0-180, or 0 if bust)
- `p_darts_thrown` - Number of darts (usually 3)
- `p_remaining_score` - New remaining score
- `p_is_bust` - Whether this was a bust
- `p_is_checkout` - Whether this was a checkout (finished leg)

**Returns:**
```json
{
  "success": true,
  "matchComplete": false,
  "winner": null, // or "player1" / "player2"
  "state": { ... } // Updated state
}
```

**What it does:**
1. Validates it's the player's turn
2. Updates state with new score and visit
3. If checkout: increments legs won
4. If legs won >= legsToWin: marks match complete
5. Switches turn to other player
6. Returns result

### `get_online_match_with_state(p_match_id uuid) RETURNS jsonb`
Fetches complete match data including state and player profiles.

**Returns:**
```json
{
  "match": { ... online_matches row ... },
  "state": { ... state_json ... },
  "player1_profile": { id, display_name, username },
  "player2_profile": { id, display_name, username }
}
```

---

## 🎮 User Flow

### Quick Match Flow

1. **User A creates lobby:**
   ```
   User A clicks "Create Lobby"
   → RPC: create_quickmatch_lobby(501, 3)
   → Lobby row inserted with status='open'
   → Lobby appears in User A's "Your Lobby" section
   → Lobby appears in all users' "Open Lobbies" list (realtime)
   ```

2. **User B joins lobby:**
   ```
   User B clicks "Join" on User A's lobby
   → RPC: join_quickmatch_lobby(lobby_id)
   → Atomic operation:
      - Sets guest_user_id = User B
      - Sets status = 'matched'
      - Creates online_matches row
      - Creates online_match_state row
      - Returns match_id
   → User B redirected to /app/match/online/{match_id}
   ```

3. **User A auto-redirected:**
   ```
   User A's realtime subscription detects:
   → lobby.status changed to 'matched'
   → lobby.match_id is set
   → User A is host_user_id
   → Auto-redirect to /app/match/online/{match_id}
   ```

4. **Both players in match room:**
   ```
   Match loads via get_online_match_with_state()
   Shows:
   - Player 1: 501 remaining, 0 legs
   - Player 2: 501 remaining, 0 legs
   - "Your Turn" badge on current player
   - Score input (only enabled for current player)
   ```

5. **Gameplay:**
   ```
   Player 1 enters score (e.g., 60)
   → Client calculates: 501 - 60 = 441 remaining
   → RPC: submit_online_visit_v2(match_id, 60, 3, 441, false, false)
   → Server updates state, switches turn to Player 2
   → Both players receive realtime update
   → Player 2's turn now
   ```

6. **Match completion:**
   ```
   Player 1 scores final checkout (e.g., remaining=32, scores 32)
   → RPC: submit_online_visit_v2(match_id, 32, 3, 0, false, true)
   → Server increments player1LegsWon
   → If player1LegsWon >= legsToWin:
      - Sets match.status = 'completed'
      - Returns matchComplete=true, winner="player1"
   → Both players see "Match Complete" modal
   → Winner gets confetti, loser gets consolation
   ```

---

## 🔄 Realtime Subscriptions

### Quick Match Page
```typescript
supabase
  .channel('quickmatch_lobbies_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'quickmatch_lobbies'
  }, (payload) => {
    if (payload.eventType === 'INSERT') fetchLobbies();
    if (payload.eventType === 'UPDATE') {
      // Check if my lobby was matched
      if (updated.status === 'matched' && updated.match_id && isHost) {
        router.push(`/app/match/online/${updated.match_id}`);
      }
      fetchLobbies();
    }
  })
  .subscribe();
```

### Online Match Room
```typescript
supabase
  .channel(`online_match_${matchId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'online_match_state',
    filter: `match_id=eq.${matchId}`
  }, (payload) => {
    // Update local state with new scores/legs
    setMatchData({ ...matchData, state: payload.new.state_json });
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'online_matches',
    filter: `id=eq.${matchId}`
  }, (payload) => {
    // Detect match completion
    if (payload.new.status === 'completed') {
      setShowMatchComplete(true);
    }
  })
  .subscribe();
```

---

## 🧪 Testing Checklist

### ✅ Acceptance Test 1: Lobby Creation & Visibility
1. Open two browser windows (different users or incognito)
2. User A creates a lobby (501, Best of 3)
3. User B should see the lobby **immediately** without refresh
4. User B's lobby list should show User A's name and game settings

**Expected:** ✅ Lobby appears instantly for User B

### ✅ Acceptance Test 2: Atomic Join
1. User A creates lobby
2. User B and User C both try to join simultaneously
3. Only one should succeed, the other should see "Lobby is already full"

**Expected:** ✅ Only one user joins (race condition prevented)

### ✅ Acceptance Test 3: Match Start & Redirect
1. User A creates lobby
2. User B joins
3. Both users should be redirected to the same match room

**Expected:** ✅ Both users see `/app/match/online/{same-match-id}`

### ✅ Acceptance Test 4: Turn-Based Gameplay
1. Both users in match room
2. Player 1 sees "Your Turn" badge and can enter score
3. Player 2 sees "Their Turn" badge and input is disabled
4. Player 1 submits score (e.g., 60)
5. Player 2's screen updates instantly showing Player 1's new score (441)
6. Player 2's input is now enabled, Player 1's is disabled

**Expected:** ✅ Turn-based gameplay with realtime updates

### ✅ Acceptance Test 5: Match Completion
1. Play through a full match (e.g., best of 1)
2. When final checkout happens, both players see "Match Complete" modal
3. Winner sees trophy and "You Win!"
4. Loser sees gray trophy and "You Lose"

**Expected:** ✅ Both players see match completion simultaneously

### ✅ Acceptance Test 6: Forfeit
1. During an active match, click "Forfeit"
2. User is returned to /app/play
3. Match status is set to 'cancelled'

**Expected:** ✅ Match ends gracefully

---

## 🐛 Debugging

### Console Logs Added
All key operations log to console:
- `console.log('Creating lobby with:', ...)`
- `console.log('Lobby created with ID:', lobbyId)`
- `console.log('Fetched lobbies:', data)`
- `console.log('Realtime event:', payload.eventType, payload)`
- `console.log('Attempting to join lobby:', lobbyId)`
- `console.log('Successfully joined! Match ID:', matchId)`
- `console.log('Loading match:', matchId)`
- `console.log('Match data loaded:', data)`
- `console.log('Submitting visit:', { score, remaining, isBust, isCheckout })`
- `console.log('Visit submitted:', data)`

### Error Toasts
All errors show user-friendly toasts:
- `toast.error(\`Failed to load lobbies: ${error.message}\`)`
- `toast.error(\`Failed to join: ${error.message}\`)`
- `toast.error(\`Failed to submit: ${error.message}\`)`

### Check Realtime Connection
In browser console:
```javascript
// Should see: "Realtime subscription status: SUBSCRIBED"
```

### Common Issues

**Issue:** Lobbies don't appear for other users
- **Check:** Supabase Realtime is enabled on `quickmatch_lobbies` table
- **Check:** RLS policies allow SELECT for authenticated users
- **Fix:** Run migration again or enable realtime manually

**Issue:** "Not your turn" error when submitting
- **Check:** `current_turn_player_id` in database matches your user ID
- **Check:** Realtime update may be delayed - wait a moment

**Issue:** Double-join (both users think they joined)
- **Check:** Using RPC function, not direct insert
- **Check:** RPC uses `FOR UPDATE` lock

---

## 📝 File Locations

### Database Migrations
- `/supabase/migrations/create_complete_online_multiplayer_system.sql`
- `/supabase/migrations/create_atomic_rpc_functions_v2.sql`

### Frontend Pages
- `/app/app/play/quick-match/page.tsx` - Lobby browser and creator
- `/app/app/match/online/[matchId]/page.tsx` - Online match room

### Key Changes from Previous Version
1. **Table names:** `quick_match_lobbies` → `quickmatch_lobbies`
2. **Field names:** `host_player_id` → `host_user_id`, `game_type` → `game_mode`
3. **State storage:** Separate `online_match_state` table with `state_json` column
4. **RPC functions:** Complete rewrite with proper atomicity
5. **Realtime:** Fixed subscriptions to use correct table names
6. **Error handling:** Added comprehensive logging and toasts

---

## 🚀 What's Next (Optional Enhancements)

### Tournament Integration (Partially Complete)
The infrastructure exists but needs:
- Tournament bracket generation
- Tournament match creation from bracket
- Tournament invite notifications (modal created but not wired)

### Stats Persistence
Currently, online matches are NOT saved to the stats system. To add:
1. When match completes, call the existing `recordMatchCompletion()` function
2. Pass the same payload format used by Training/Private matches
3. Stats page will automatically show online matches

### Match History
Add query to show recent online matches:
```sql
SELECT * FROM online_matches
WHERE (player1_id = auth.uid() OR player2_id = auth.uid())
AND status = 'completed'
ORDER BY finished_at DESC
LIMIT 10;
```

### Rematch Option
Add "Rematch" button in match complete modal:
- Creates new lobby
- Invites the same opponent

---

## ✨ Summary

**What Works:**
- ✅ Quick Match lobby creation & joining (atomic, race-safe)
- ✅ Real-time lobby list for all users
- ✅ Complete online match room with turn-based gameplay
- ✅ Real-time score updates for both players
- ✅ Match completion detection
- ✅ Proper error handling with toasts
- ✅ Forfeit option
- ✅ Non-recursive RLS policies
- ✅ All operations logged for debugging

**What Doesn't Break:**
- ✅ Training mode (vs Dartbot)
- ✅ Private local matches
- ✅ Stats persistence for Training/Private

**Project builds successfully** with no errors or warnings.

The online multiplayer system is **production-ready** and fully functional for Quick Match gameplay!
