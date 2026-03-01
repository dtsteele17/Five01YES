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

        // Verify profile exists and check if setup is complete
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

          // Fallback: create profile manually if trigger didn't work
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              user_id: data.user.id,
              username: null, // Will be set in setup
              display_name: null, // Will be set in setup
              avatar_url: data.user.user_metadata?.avatar_url,
            });

          if (insertError) {
            console.error('[Auth Callback] Failed to create profile:', insertError);
            return NextResponse.redirect(new URL('/app', request.url));
          } else {
            console.log('[Auth Callback] Fallback profile created, redirecting to setup');
            return NextResponse.redirect(new URL('/app/setup', request.url));
          }
        } else {
          console.log('[Auth Callback] Profile verified:', profile.username);
          
          // Check if profile setup is complete
          if (!profile.username || !profile.display_name) {
            console.log('[Auth Callback] Profile incomplete, redirecting to setup');
            return NextResponse.redirect(new URL('/app/setup', request.url));
          }
        }
      }
    } catch (error) {
      console.error('[Auth Callback] Unexpected error:', error);
      return NextResponse.redirect(new URL('/login?error=unexpected', request.url));
    }
  }

  return NextResponse.redirect(new URL('/app', request.url));
}
