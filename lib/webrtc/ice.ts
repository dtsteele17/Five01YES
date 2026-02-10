/**
 * Shared WebRTC ICE Server Configuration
 *
 * Provides STUN servers by default and adds TURN servers if environment variables are configured.
 * Works for all match types: Quick Match, Private Match, Ranked, etc.
 * 
 * Xirsys Integration:
 * - Peer-to-peer first (STUN only)
 * - Xirsys TURN as fallback relay
 * 
 * To use Xirsys, set these environment variables in your .env.local:
 * - NEXT_PUBLIC_XIRSYS_HOST (e.g., "yourchannel.xirsys.com")
 * - NEXT_PUBLIC_XIRSYS_USERNAME (your Xirsys username)
 * - NEXT_PUBLIC_XIRSYS_CREDENTIAL (your Xirsys credential/token)
 * - NEXT_PUBLIC_XIRSYS_IDENTITY (optional, your Xirsys identity)
 * 
 * Get your Xirsys credentials at: https://xirsys.com
 */

export interface IceServerConfig {
  iceServers: RTCIceServer[];
}

/**
 * Get ICE servers configuration for RTCPeerConnection
 * 
 * Order:
 * 1. Public STUN servers (peer-to-peer attempt)
 * 2. Xirsys TURN servers (relay fallback if P2P fails)
 * 3. Custom TURN servers (if configured)
 *
 * @returns Array of RTCIceServer configurations
 */
export function getIceServers(): RTCIceServer[] {
  // Always start with public STUN servers for peer-to-peer
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ];

  // Add Xirsys TURN servers if configured
  // Xirsys provides reliable TURN relay for when peer-to-peer fails
  const xirsysHost = process.env.NEXT_PUBLIC_XIRSYS_HOST;
  const xirsysUsername = process.env.NEXT_PUBLIC_XIRSYS_USERNAME;
  const xirsysCredential = process.env.NEXT_PUBLIC_XIRSYS_CREDENTIAL;
  const xirsysIdentity = process.env.NEXT_PUBLIC_XIRSYS_IDENTITY;

  if (xirsysHost && xirsysUsername && xirsysCredential) {
    // Xirsys supports both TURN and STUN
    servers.push(
      // Xirsys STUN (as backup to public STUN)
      {
        urls: `stun:${xirsysHost}`
      },
      // Xirsys TURN (UDP - fastest relay)
      {
        urls: `turn:${xirsysHost}:3478?transport=udp`,
        username: xirsysUsername,
        credential: xirsysCredential
      },
      // Xirsys TURN (TCP - for restrictive firewalls)
      {
        urls: `turn:${xirsysHost}:3478?transport=tcp`,
        username: xirsysUsername,
        credential: xirsysCredential
      },
      // Xirsys TURNS (TLS - for very restrictive firewalls)
      {
        urls: `turns:${xirsysHost}:5349?transport=tcp`,
        username: xirsysUsername,
        credential: xirsysCredential
      }
    );

    if (process.env.NODE_ENV === 'development') {
      console.log('[ICE] Using Xirsys STUN + TURN:', {
        host: xirsysHost,
        identity: xirsysIdentity || 'default',
        modes: ['stun', 'turn:udp', 'turn:tcp', 'turns:tls']
      });
    }
  }

  // Add legacy/custom TURN servers if configured (backwards compatibility)
  const turnHost = process.env.NEXT_PUBLIC_TURN_HOST;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnHost && turnUsername && turnCredential && !xirsysHost) {
    servers.push({
      urls: [
        `turn:${turnHost}:3478?transport=udp`,
        `turn:${turnHost}:3478?transport=tcp`,
        `turns:${turnHost}:5349?transport=tcp`
      ],
      username: turnUsername,
      credential: turnCredential
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('[ICE] Using legacy TURN:', turnHost);
    }
  }

  // Dev logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[ICE] Total ICE servers:', servers.length);
  }

  return servers;
}

/**
 * Get RTCPeerConnection configuration with ICE servers
 * 
 * Configured for best connectivity:
 * - iceCandidatePoolSize: 10 (gather candidates faster)
 * - iceTransportPolicy: "all" (try all transport types)
 *
 * @returns RTCConfiguration object ready for new RTCPeerConnection()
 */
export function getPeerConnectionConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    // Enable bundle and rtcp-mux for better performance
    bundlePolicy: 'balanced',
    rtcpMuxPolicy: 'require'
  };
}

/**
 * Check if Xirsys is configured
 * @returns true if Xirsys credentials are available
 */
export function isXirsysConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_XIRSYS_HOST &&
    process.env.NEXT_PUBLIC_XIRSYS_USERNAME &&
    process.env.NEXT_PUBLIC_XIRSYS_CREDENTIAL
  );
}

/**
 * Get Xirsys configuration info for debugging
 */
export function getXirsysInfo(): { configured: boolean; host?: string; identity?: string } {
  return {
    configured: isXirsysConfigured(),
    host: process.env.NEXT_PUBLIC_XIRSYS_HOST,
    identity: process.env.NEXT_PUBLIC_XIRSYS_IDENTITY
  };
}
