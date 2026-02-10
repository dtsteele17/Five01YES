# WebRTC Camera Setup Guide

This guide explains how to set up peer-to-peer video calling between players in Quick Match, similar to DartCounter.

## How It Works

1. **Peer-to-Peer First**: The system tries to connect players directly using STUN servers (free public servers)
2. **Xirsys Fallback**: If peer-to-peer fails (due to firewalls/NAT), Xirsys TURN servers relay the video
3. **Both Players Visible**: Each player sees their own camera (large) and opponent's camera (small)

## Configuration

### 1. Environment Variables

Add these to your `.env.local` file:

```env
# Xirsys Configuration (for TURN relay when peer-to-peer fails)
NEXT_PUBLIC_XIRSYS_HOST=yourchannel.xirsys.com
NEXT_PUBLIC_XIRSYS_USERNAME=your_xirsys_username
NEXT_PUBLIC_XIRSYS_CREDENTIAL=your_xirsys_credential_or_token
NEXT_PUBLIC_XIRSYS_IDENTITY=your_identity (optional)
```

### 2. Getting Xirsys Credentials

1. Go to [https://xirsys.com](https://xirsys.com) and create an account
2. Create a new channel (e.g., "five01")
3. Get your credentials from the dashboard:
   - **Host**: Your channel URL (e.g., `yourchannel.xirsys.com`)
   - **Username**: Your Xirsys username
   - **Credential**: Your API token or password

### 3. Free Alternative (No Xirsys)

If you don't want to use Xirsys, the system will still work for most players using public STUN servers. However, some players behind strict firewalls may not be able to connect.

```env
# Without Xirsys - uses public STUN only (peer-to-peer only)
# No environment variables needed for basic functionality
```

## How Connection Works

```
Player A ←──STUN──→ Player B  (tries peer-to-peer first)
   ↓                    ↓
Xirsys TURN ←──────→ Xirsys TURN  (fallback if P2P fails)
```

## Testing Camera

1. Start a Quick Match with another player
2. Both players should see their own camera (large) at the top
3. When opponent connects, their camera appears below (small)
4. Connection status shows:
   - 🟡 "Connecting..." - Establishing connection
   - 🟢 "Live" - Connected and streaming
   - ⚫ "Not connected" - Waiting for opponent

## Troubleshooting

### Camera not showing?
- Check browser permissions (allow camera access)
- Try refreshing the page
- Check if HTTPS is enabled (required for camera)

### Opponent camera not appearing?
- Both players need to have camera enabled
- Check firewall settings
- Try using Xirsys TURN servers (see configuration above)
- Connection may take 5-10 seconds to establish

### Poor video quality?
- Video quality adjusts automatically based on connection
- TURN relay may reduce quality slightly but improves reliability

## Technical Details

- **ICE Servers**: STUN (Google, Twilio) + TURN (Xirsys optional)
- **Signaling**: Uses Supabase Real-time (match_signals table)
- **Video Codec**: VP8/VP9 (browser native)
- **Audio**: Opus codec with echo cancellation

## Files Involved

- `lib/hooks/useMatchWebRTC.ts` - Main WebRTC hook
- `lib/webrtc/ice.ts` - ICE server configuration
- `lib/webrtc/signaling-adapter.ts` - Signaling via Supabase
- `app/app/play/quick-match/match/[matchId]/page.tsx` - Match page UI
