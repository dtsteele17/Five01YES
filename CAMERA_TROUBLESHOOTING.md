# Camera Streaming Troubleshooting Guide

## Current Issue
The camera streams are not connecting between players. The logs show signals are being sent but not properly received/processed.

## Fixes Applied

### 1. SQL Migration: Fixed RLS Policy
**File:** `supabase/migrations/20260214000000_fix_match_signals_rls.sql`

**What it does:**
- Fixes Row Level Security on `match_signals` table
- Ensures users can only see signals addressed to them
- Enables realtime publication for the table
- Creates proper indexes for performance

**Apply this in Supabase SQL Editor:**
```sql
-- Run the migration file contents
```

### 2. Updated Signaling Adapter
**File:** `lib/webrtc/signaling-adapter.ts`

**Changes:**
- Changed from pure realtime to polling-based signaling (more reliable)
- Polls every 500ms for new signals
- Keeps realtime as secondary (faster when it works)
- Better filtering of signals

### 3. Updated WebRTC Hook
**File:** `lib/hooks/useMatchWebRTC.ts`

**Changes:**
- Player 1 now creates and sends offer immediately when camera starts
- Added extensive logging for debugging
- Better error handling
- Properly waits for coin toss before connecting

### 4. Test Script
**File:** `supabase/migrations/20260214000001_test_webrtc_signaling.sql`

**What it does:**
- Verifies table structure
- Checks RLS policies
- Tests insert permissions

## Testing Steps

### Step 1: Apply SQL Migrations
1. Go to Supabase Dashboard → SQL Editor
2. Run `20260214000000_fix_match_signals_rls.sql`
3. Run `20260214000001_test_webrtc_signaling.sql`
4. Check the results for any errors

### Step 2: Test Camera Connection
1. Open match in Browser A (Player 1)
2. Open match in Browser B (Player 2)
3. Both players click "Enable Camera"
4. Check browser console for these logs:

**Player 1 should see:**
```
[WebRTC] Player 1 creating offer...
[WebRTC] ✅ Offer sent to Player 2
```

**Player 2 should see:**
```
[WebRTC] ========== RECEIVED OFFER ==========
[WebRTC] Creating answer...
[WebRTC] ✅ Answer sent successfully
```

**Player 1 should then see:**
```
[WebRTC] Answer applied
[WebRTC] ✅ PEER CONNECTION ESTABLISHED
```

## Common Issues & Solutions

### Issue: "No peer connection" when receiving offer
**Cause:** Player 2's peer connection isn't created yet
**Solution:** Ensure both players have loaded the match page before enabling camera

### Issue: "SKIP: Signal not addressed to me"
**Cause:** The sender is receiving their own signal
**Solution:** This is normal (filtered out), but the opponent should receive it

### Issue: "remoteStream: NO" on both sides
**Cause:** Signaling isn't working
**Solution:** 
1. Check SQL migration was applied
2. Verify RLS policies
3. Check browser console for errors

### Issue: "Connecting..." stuck
**Cause:** ICE candidates failing
**Solution:**
1. Check TURN servers are configured
2. Try both players on same network first (test)
3. Enable force TURN relay button

## Debug Checklist

- [ ] SQL migrations applied in Supabase
- [ ] Both players see "Signal subscription set up" in console
- [ ] Player 1 sees "Offer sent to Player 2"
- [ ] Player 2 sees "RECEIVED OFFER"
- [ ] Player 2 sees "Answer sent successfully"
- [ ] Player 1 sees "Answer applied"
- [ ] Both players see "PEER CONNECTION ESTABLISHED"

## Manual Test Query

Run this in Supabase SQL Editor to manually test signaling:

```sql
-- Insert a test signal
INSERT INTO match_signals (room_id, from_user_id, to_user_id, type, payload)
VALUES (
  'YOUR_ROOM_ID',
  'PLAYER_1_ID', 
  'PLAYER_2_ID',
  'test',
  '{"message": "hello"}'::jsonb
);

-- Check if it was received (as Player 2)
SELECT * FROM match_signals 
WHERE to_user_id = 'PLAYER_2_ID'
ORDER BY created_at DESC
LIMIT 5;
```

## Still Not Working?

If the camera still doesn't connect after applying all fixes:

1. **Check browser console** on BOTH players for error messages
2. **Verify match_signals table** has the test signals
3. **Test on same network** first (both players on same WiFi)
4. **Try different browsers** (Chrome + Firefox)
5. **Check firewall settings** - WebRTC needs UDP ports

## Next Steps If Still Broken

If all else fails, we may need to:
1. Add TURN server configuration
2. Implement a signaling server (instead of Supabase realtime)
3. Use a WebRTC library like SimpleWebRTC
