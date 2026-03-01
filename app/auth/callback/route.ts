import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  console.log('[Auth Callback] Processing callback with code:', code ? 'present' : 'missing');

  if (code) {
    try {
      const supabase = await createServerSupabaseClient();
      const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

      if (sessionError) {
        console.error('[Auth Callback] Session exchange error:', sessionError);
        return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
      }

      if (data?.user) {
        console.log('[Auth Callback] User authenticated:', data.user.id);

        // Check if profile exists
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, created_at')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('[Auth Callback] Profile query error:', profileError);
        }

        if (!profile) {
          console.warn('[Auth Callback] Profile not found, creating fallback profile');

          // Generate a temporary username from email
          const emailPrefix = data.user.email?.split('@')[0] || 'user';
          const tempUsername = emailPrefix.replace(/[^a-zA-Z0-9_]/g, '') + '_' + Math.random().toString(36).slice(2, 6);
          const displayName = data.user.user_metadata?.full_name || emailPrefix;

          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              user_id: data.user.id,
              username: tempUsername,
              display_name: displayName,
              avatar_url: data.user.user_metadata?.avatar_url || null,
            });

          if (insertError) {
            console.error('[Auth Callback] Failed to create profile:', insertError);
            // Still redirect to app — the DB trigger may have created it
            return NextResponse.redirect(new URL('/app', request.url));
          }

          console.log('[Auth Callback] New profile created, redirecting to setup');
          return NextResponse.redirect(new URL('/app/setup', request.url));
        } else {
          console.log('[Auth Callback] Existing profile found:', profile.username);
          // Existing user — go straight to dashboard
          return NextResponse.redirect(new URL('/app', request.url));
        }
      }
    } catch (error) {
      console.error('[Auth Callback] Unexpected error:', error);
      return NextResponse.redirect(new URL('/login?error=unexpected', request.url));
    }
  }

  return NextResponse.redirect(new URL('/app', request.url));
}
