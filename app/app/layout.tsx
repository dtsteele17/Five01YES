'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/app/TopBar';
import { ProfileProvider } from '@/lib/context/ProfileContext';
import { LeaguesProvider } from '@/lib/context/LeaguesContext';
import { TournamentsProvider } from '@/lib/context/TournamentsContext';
import { TrainingProvider } from '@/lib/context/TrainingContext';
import { NotificationsProvider } from '@/lib/context/NotificationsContext';
import { ProfileSetupGuard } from '@/components/app/ProfileSetupGuard';
import TournamentMatchMonitor from '@/components/app/TournamentMatchMonitor';
import GlobalTournamentMonitor from '@/components/app/GlobalTournamentMonitor';
import { LeagueMatchPopup } from '@/components/app/LeagueMatchPopup';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isQuickMatchGame = pathname?.includes('/app/play/quick-match/match/') || pathname?.includes('/app/play/quick-match/atc-match');
  const isTrainingMatch = pathname === '/app/play/training/501';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : 'NOT SET';

      console.log('[APP DEBUG] Origin:', window.location.origin);
      console.log('[APP DEBUG] Supabase Host:', supabaseHost);
    }
  }, []);

  if (isQuickMatchGame || isTrainingMatch) {
    return (
      <ProfileProvider>
        <NotificationsProvider>
          <LeaguesProvider>
            <TournamentsProvider>
              <TrainingProvider>
                <ProfileSetupGuard>
                  {children}
                </ProfileSetupGuard>
              </TrainingProvider>
            </TournamentsProvider>
          </LeaguesProvider>
        </NotificationsProvider>
      </ProfileProvider>
    );
  }

  return (
    <ProfileProvider>
      <NotificationsProvider>
        <LeaguesProvider>
          <TournamentsProvider>
            <TrainingProvider>
              <ProfileSetupGuard>
                <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20">
                  <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-slate-900/50 to-slate-950 pointer-events-none" />

                  <TopBar />
                  {/* Global tournament monitor - shows countdown/ready-up from any page */}
                  <GlobalTournamentMonitor />
                  {/* League match ready-up popup */}
                  <LeagueMatchPopup />

                  <main className="relative overflow-x-hidden pt-20 pb-12 px-6 lg:px-8">
                    <div className="container mx-auto max-w-7xl overflow-x-hidden">
                      {children}
                    </div>
                  </main>
                </div>
              </ProfileSetupGuard>
            </TrainingProvider>
          </TournamentsProvider>
        </LeaguesProvider>
      </NotificationsProvider>
    </ProfileProvider>
  );
}
