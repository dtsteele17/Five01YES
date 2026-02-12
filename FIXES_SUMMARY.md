# Fixes Summary - Camera & Coin Toss

## Camera Streaming Fixes

### 1. SQL Migration Applied
**File:** `supabase/migrations/20260214000000_fix_match_signals_rls.sql`
- Fixed RLS policies on `match_signals` table
- Enabled realtime publication
- Created proper indexes

### 2. Signaling Adapter Updated
**File:** `lib/webrtc/signaling-adapter.ts`
- Changed to polling-based signaling (500ms interval)
- More reliable than pure realtime for WebRTC
- Better signal filtering

### 3. WebRTC Hook Fixed
**File:** `lib/hooks/useMatchWebRTC.ts`
- Player 1 now creates and sends offer when camera starts
- Added extensive logging for debugging
- Fixed race conditions

## Coin Toss Fixes

### 1. Updated Trigger Logic
**File:** `app/app/play/quick-match/match/[matchId]/page.tsx`
- Fixed condition to show coin toss for both players
- Added better logging

### 2. Fixed Completion Handler
- Only Player 1 saves to database (avoids race conditions)
- Both players update local state
- Added logging to track flow

### 3. Added Subscription Logging
- Logs when coin toss is completed via realtime update

## How It Should Work

### Coin Toss Flow:
1. Both players join match
2. Modal opens for BOTH players
3. Player 1 sees spinning coin, Player 2 sees "Waiting..."
4. Player 1's coin lands, winner determined
5. Player 1 calls `handleCoinTossComplete(winnerId)`
6. Player 1 saves to database via `rpc_complete_coin_toss`
7. Database update triggers realtime event
8. Player 2 receives update, sees winner
9. Both players close modal and match begins

### Camera Flow:
1. After coin toss completes, camera can start
2. Player 1 enables camera → creates offer → sends to Player 2
3. Player 2 enables camera → receives offer → creates answer
4. ICE candidates exchanged
5. P2P connection established
6. Video streams flow both ways

## Testing Steps

### Test Coin Toss:
1. Open match in two browsers
2. Both should see coin toss modal
3. Player 1 sees spinning coin
4. Player 2 sees "Waiting for Player 1..."
5. Result shows same winner for both
6. Modal closes, match starts

### Test Camera:
1. After coin toss, both click "Enable Camera"
2. Check console for:
   - `[WebRTC] Player 1 creating offer...`
   - `[WebRTC] ========== RECEIVED OFFER ==========`
   - `[WebRTC] ✅ Answer sent successfully`
   - `[WebRTC] 🌐 connectionState: connected`
3. Both video streams should appear

## Console Logs to Watch For

**Coin Toss:**
```
[COIN TOSS] Showing coin toss modal. Winner: null
[COIN TOSS] Winner determined: <user-id>
[COIN TOSS] Player 1 saving result to database...
[ROOM] Coin toss completed! Winner: <user-id>
```

**Camera:**
```
[WebRTC] Player 1 creating offer...
[WebRTC] ✅ Offer sent to Player 2
[WebRTC] ========== RECEIVED OFFER ==========
[WebRTC] ✅ Answer sent successfully
[WebRTC] 🌐 connectionState: connected
```
