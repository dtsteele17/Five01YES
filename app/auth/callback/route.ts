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

        // Verify profile exists (should be created by trigger)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('[Auth Callback] Profile query error:', profileError);
        }

        if (!profile) {
          console.warn('[Auth Callback] Profile not found, creating fallback profile');

          // Fallback: create profile manually if trigger didn't work
          const username = data.user.email?.split('@')[0] || 'user';
          const { error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              user_id: data.user.id,
              username,
              display_name: data.user.user_metadata?.full_name || username,
            });

          if (insertError) {
            console.error('[Auth Callback] Failed to create profile:', insertError);
          } else {
            console.log('[Auth Callback] Fallback profile created successfully');
          }
        } else {
          console.log('[Auth Callback] Profile verified:', profile.username);
        }
      }
    } catch (error) {
      console.error('[Auth Callback] Unexpected error:', error);
      return NextResponse.redirect(new URL('/login?error=unexpected', request.url));
    }
  }

  return NextResponse.redirect(new URL('/app', request.url));
}
