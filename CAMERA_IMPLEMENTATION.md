# Quick Match Camera Implementation

## Overview
The camera system uses WebRTC to stream video between two players in a quick match. It supports:
- Local camera preview (picture-in-picture)
- Remote opponent video stream
- Automatic connection setup
- Toggle camera on/off

## Architecture

### Components

#### 1. `useMatchWebRTC` Hook (`lib/hooks/useMatchWebRTC.ts`)
Manages the WebRTC peer connection and camera state.

**Key Features:**
- Creates RTCPeerConnection with STUN/TURN servers
- Handles offer/answer negotiation
- Manages local and remote MediaStreams
- Automatic reconnection on failure

**State:**
```typescript
{
  localStream: MediaStream | null;      // Your camera feed
  remoteStream: MediaStream | null;     // Opponent's camera feed
  isCameraOn: boolean;                  // Camera toggle state
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
}
```

#### 2. `MatchCameraPanel` Component (`components/match/MatchCameraPanel.tsx`)
UI component displaying both video streams.

**Layout:**
- Main area: Remote/opponent video (or placeholder)
- Bottom-right: Picture-in-picture local video
- Status indicators for connection state

### Data Flow

```
Player 1                                     Player 2
   |                                            |
   |---- getUserMedia() ----------------------->| (local preview)
   |                                            |
   |---- createOffer() ------------------------>|
   |         (via match_signals table)          |
   |                                            |
   |<-------------------- createAnswer() -------|
   |         (via match_signals table)          |
   |                                            |
   |<==== ICE Candidates exchange =============>|
   |                                            |
   |<==== Video Stream (P2P) ==================>|
   |         (direct peer connection)           |
```

### Signaling
Uses Supabase Realtime on `match_signals` table:
- `offer`: Session description from Player 1
- `answer`: Session description from Player 2
- `ice`: ICE candidates for NAT traversal
- `state`: Camera on/off state updates

## Usage

### Starting Camera
1. Click "On" button in camera panel
2. Browser requests camera permission
3. Local stream starts (shown in PiP)
4. If opponent has camera on, streams connect

### Viewing Opponent
- Main video area shows opponent when:
  - Both players have cameras on
  - WebRTC connection is established
  - ICE negotiation completed

### Connection Issues
If connection fails:
1. Both players should toggle camera off/on
2. Check browser console for errors
3. Verify TURN servers configured (for strict NAT)

## Configuration

### ICE Servers
Configured in `lib/webrtc/ice.ts`:
```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  // Add TURN servers for production
];
```

### Database
Requires `match_signals` table with RLS policies:
```sql
-- Players can only see signals addressed to them
CREATE POLICY "Users can view signals addressed to them"
  ON match_signals FOR SELECT
  USING (to_user_id = auth.uid());
```

## Testing

### Local Testing (Same Machine)
1. Open match in two different browsers (Chrome + Firefox)
2. Or use incognito window for second player
3. Cameras will show local feed in both (expected behavior)

### Real Network Testing
1. Player 1: Host on machine A
2. Player 2: Join from machine B (different network)
3. Both enable cameras
4. Verify video streams appear correctly

### Debugging
Enable console logging:
- All WebRTC events logged with `[WebRTC]` prefix
- Check signaling state transitions
- Monitor ICE candidate exchange

## Troubleshooting

### "Failed to access camera"
- Check browser permissions
- Ensure HTTPS (required for getUserMedia)
- Verify no other app using camera

### "Connecting..." stuck
- Check both players have camera on
- Verify match_signals table has proper RLS
- Check STUN/TURN server connectivity

### No remote video
- Check console for errors
- Verify `ontrack` event fired
- Ensure both players in same match room

## Future Improvements

1. **Screen Sharing**: Add `getDisplayMedia()` option
2. **Recording**: Record match video using MediaRecorder
3. **Quality Settings**: Allow resolution selection
4. **Audio Chat**: Enable audio tracks (currently disabled)
