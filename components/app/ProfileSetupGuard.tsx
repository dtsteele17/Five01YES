'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useProfile } from '@/lib/context/ProfileContext';

export function ProfileSetupGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't redirect if we're already on the setup page or still loading
    if (loading || pathname === '/app/setup') {
      return;
    }

    // Check if profile setup is incomplete
    if (profile && (!profile.username || !profile.display_name)) {
      console.log('[ProfileSetupGuard] Profile incomplete, redirecting to setup');
      router.push('/app/setup');
    }
  }, [profile, loading, pathname, router]);

  // Show children if loading, on setup page, or profile is complete
  if (loading || pathname === '/app/setup' || (profile && profile.username && profile.display_name)) {
    return <>{children}</>;
  }

  // Don't render anything while redirecting
  return null;
}