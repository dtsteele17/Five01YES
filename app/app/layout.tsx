'use client';

import { useEffect } from 'react';
import { TopBar } from '@/components/app/TopBar';
import { ProfileProvider } from '@/lib/context/ProfileContext';
import { LeaguesProvider } from '@/lib/context/LeaguesContext';
import { TournamentsProvider } from '@/lib/context/TournamentsContext';
import { TrainingProvider } from '@/lib/context/TrainingContext';
import { NotificationsProvider } from '@/lib/context/NotificationsContext';
import TournamentMatchMonitor from '@/components/app/TournamentMatchMonitor';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : 'NOT SET';

      console.log('[APP DEBUG] Origin:', window.location.origin);
      console.log('[APP DEBUG] Supabase Host:', supabaseHost);
    }
  }, []);

  return (
    <ProfileProvider>
      <NotificationsProvider>
        <LeaguesProvider>
          <TournamentsProvider>
            <TrainingProvider>
              <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20">
                <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-slate-900/50 to-slate-950 pointer-events-none" />

                <TopBar />
                <TournamentMatchMonitor />

                <main className="relative pt-20 pb-12 px-4 sm:px-6 lg:px-8">
                  <div className="container mx-auto max-w-7xl">
                    {children}
                  </div>
                </main>
              </div>
            </TrainingProvider>
          </TournamentsProvider>
        </LeaguesProvider>
      </NotificationsProvider>
    </ProfileProvider>
  );
}
