import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const ident = process.env.XIRSYS_IDENT;
  const secret = process.env.XIRSYS_SECRET;
  const channel = process.env.XIRSYS_CHANNEL;

  if (!ident || !secret || !channel) {
    console.error('[TURN API] Missing Xirsys credentials');
    return NextResponse.json(
      { error: 'Xirsys credentials not configured' },
      { status: 500 }
    );
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
      return NextResponse.json(data, { status: response.status });
    }

    let iceServers = data?.v?.iceServers || data?.iceServers || data?.v?.ice_servers || data?.ice_servers;

    if (!iceServers) {
      console.error('[TURN API] No iceServers found in response:', data);
      return NextResponse.json(
        { error: 'No iceServers returned', raw: data },
        { status: 500 }
      );
    }

    return NextResponse.json({ iceServers });
  } catch (error: any) {
    console.error('[TURN API] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}
