/**
 * WebRTC ICE Server Configuration
 *
 * Fetches TURN credentials dynamically from /api/turn (Xirsys).
 * Falls back to public STUN servers if TURN is unavailable.
 */

export interface IceServerConfig {
  iceServers: RTCIceServer[];
}

/** Fallback STUN-only servers for when TURN fetch fails */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/** Cache for TURN credentials (they're time-limited, refresh every 10 min) */
let cachedIceServers: RTCIceServer[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch ICE servers from /api/turn (Xirsys TURN + STUN)
 * Returns cached result if still fresh.
 * Falls back to STUN-only if fetch fails.
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();

  // Return cache if fresh
  if (cachedIceServers && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[ICE] Using cached ICE servers');
    return cachedIceServers;
  }

  try {
    console.log('[ICE] Fetching TURN credentials from /api/turn...');
    const res = await fetch('/api/turn', { cache: 'no-store' });

    if (!res.ok) {
      console.error('[ICE] /api/turn returned', res.status);
      return FALLBACK_ICE_SERVERS;
    }

    const data = await res.json();
    const servers: RTCIceServer[] = data.iceServers || [];

    if (servers.length === 0) {
      console.warn('[ICE] No servers from /api/turn, using fallback');
      return FALLBACK_ICE_SERVERS;
    }

    // Cache the result
    cachedIceServers = servers;
    cacheTimestamp = now;

    console.log('[ICE] Got', servers.length, 'ICE servers from Xirsys');
    return servers;

  } catch (error) {
    console.error('[ICE] Failed to fetch TURN credentials:', error);
    return FALLBACK_ICE_SERVERS;
  }
}

/**
 * Synchronous fallback — returns STUN-only servers.
 * Use fetchIceServers() for full TURN support.
 */
export function getIceServers(): RTCIceServer[] {
  if (cachedIceServers) return cachedIceServers;
  return FALLBACK_ICE_SERVERS;
}

/**
 * Get RTCPeerConnection configuration with ICE servers
 */
export async function fetchPeerConnectionConfig(): Promise<RTCConfiguration> {
  const iceServers = await fetchIceServers();
  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}
