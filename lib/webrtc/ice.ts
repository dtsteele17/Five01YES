/**
 * Shared WebRTC ICE Server Configuration
 *
 * Provides STUN servers by default and adds TURN servers if environment variables are configured.
 * Works for all match types: Quick Match, Private Match, Ranked, etc.
 */

export interface IceServerConfig {
  iceServers: RTCIceServer[];
}

/**
 * Get ICE servers configuration for RTCPeerConnection
 *
 * Always includes:
 * - Google STUN server (stun:stun.l.google.com:19302)
 * - Twilio STUN server (stun:global.stun.twilio.com:3478)
 *
 * Optionally includes TURN servers if environment variables are set:
 * - NEXT_PUBLIC_TURN_HOST
 * - NEXT_PUBLIC_TURN_USERNAME
 * - NEXT_PUBLIC_TURN_CREDENTIAL
 *
 * @returns Array of RTCIceServer configurations
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  // Add TURN servers if environment variables are configured
  const turnHost = process.env.NEXT_PUBLIC_TURN_HOST;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnHost && turnUsername && turnCredential) {
    servers.push({
      urls: [
        `turn:${turnHost}:3478?transport=udp`,
        `turn:${turnHost}:3478?transport=tcp`,
        `turns:${turnHost}:5349?transport=tcp`
      ],
      username: turnUsername,
      credential: turnCredential
    });

    // Dev logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[ICE] Using STUN + TURN servers:', {
        stun: servers.slice(0, 2).map(s => s.urls),
        turn: `${turnHost}:3478/5349 (udp/tcp/tls)`
      });
    }
  } else {
    // Dev logging
    if (process.env.NODE_ENV === 'development') {
      console.log('[ICE] Using STUN-only servers:', servers.map(s => s.urls));
    }
  }

  return servers;
}

/**
 * Get RTCPeerConnection configuration with ICE servers
 *
 * @returns RTCConfiguration object ready for new RTCPeerConnection()
 */
export function getPeerConnectionConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    iceCandidatePoolSize: 10
  };
}
