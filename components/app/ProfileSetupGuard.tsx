'use client';

/**
 * ProfileSetupGuard — NO-OP wrapper.
 * 
 * Profile setup redirection is handled ONLY in the auth callback (app/auth/callback/route.ts).
 * New Google users → /app/setup (once, on first sign-up).
 * Existing users → /app (always).
 * 
 * This component exists so existing imports don't break.
 */
export function ProfileSetupGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
