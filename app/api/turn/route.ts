import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * GET /api/turn
 * Fetches fresh TURN credentials from Xirsys.
 * Credentials are time-limited and should be fetched per-session.
 */
export async function GET() {
  const ident = process.env.XIRSYS_IDENT;
  const secret = process.env.XIRSYS_SECRET;
  const channel = process.env.XIRSYS_CHANNEL || 'FIVE01';

  if (!ident || !secret) {
    console.error('[TURN API] Missing Xirsys credentials');
    // Return fallback STUN-only config so WebRTC can still attempt P2P
    return NextResponse.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    });
  }

  try {
    const authString = `${ident}:${secret}`;
    const base64Auth = Buffer.from(authString).toString('base64');

    const response = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${base64Auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format: 'urls' }),
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[TURN API] Xirsys error:', data);
      return NextResponse.json(
        { error: 'Xirsys error', details: data },
        { status: response.status }
      );
    }

    // Xirsys returns iceServers in various formats
    const iceServers = data?.v?.iceServers || data?.iceServers || data?.v?.ice_servers || [];

    if (!iceServers || iceServers.length === 0) {
      console.error('[TURN API] No iceServers in response:', data);
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      });
    }

    console.log('[TURN API] Returning', iceServers.length, 'ICE servers');
    return NextResponse.json({ iceServers });

  } catch (error: any) {
    console.error('[TURN API] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
