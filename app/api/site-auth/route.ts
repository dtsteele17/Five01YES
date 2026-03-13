import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  
  if (password === 'Classdarts') {
    const response = NextResponse.json({ success: true });
    response.cookies.set('site-auth', password, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }
  
  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}
