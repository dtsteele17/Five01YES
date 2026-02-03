'use client';

import { useEffect } from 'react';
import { TopBar } from '@/components/app/TopBar';
import { ProfileProvider } from '@/lib/context/ProfileContext';
import { LeaguesProvider } from '@/lib/context/LeaguesContext';
import { TournamentsProvider } from '@/lib/context/TournamentsContext';
import { TrainingProvider } from '@/lib/context/TrainingContext';
import { NotificationsProvider } from '@/lib/context/NotificationsContext';
import TournamentMatchMonitor from '@/components/app/TournamentMatchMonitor';
import { createClient } from '@/lib/supabase/client';

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

      // Safety check: verify stored matches are still active
      checkStoredMatches();
    }
  }, []);

  async function checkStoredMatches() {
    try {
      const supabase = createClient();

      // Check localStorage for any stored match IDs
      const activeMatchId = localStorage.getItem('activeMatchId');
      const activeLobbyId = localStorage.getItem('activeLobbyId');
      const resumeMatchId = localStorage.getItem('resumeMatchId');

      const matchIds = [activeMatchId, resumeMatchId].filter(Boolean) as string[];

      if (matchIds.length === 0) return;

      console.log('[MATCH_SAFETY_CHECK] Checking stored matches:', matchIds);

      for (const matchId of matchIds) {
        const { data: match, error } = await supabase
          .from('match_rooms')
          .select('id, status')
          .eq('id', matchId)
          .maybeSingle();

        if (error) {
          console.error('[MATCH_SAFETY_CHECK] Error fetching match:', error);
          continue;
        }

        if (!match || match.status !== 'in_progress') {
          console.log('[MATCH_SAFETY_CHECK] Match not active, clearing:', {
            matchId,
            status: match?.status,
            exists: !!match,
          });

          // Clear all storage for this match
          if (localStorage.getItem('activeMatchId') === matchId) {
            localStorage.removeItem('activeMatchId');
          }
          if (localStorage.getItem('resumeMatchId') === matchId) {
            localStorage.removeItem('resumeMatchId');
          }
          if (sessionStorage.getItem(`match_context_${matchId}`)) {
            sessionStorage.removeItem(`match_context_${matchId}`);
          }
          if (sessionStorage.getItem(`lobby_id_${matchId}`)) {
            sessionStorage.removeItem(`lobby_id_${matchId}`);
          }
        } else {
          console.log('[MATCH_SAFETY_CHECK] Match is active:', matchId);
        }
      }

      // Clear lobby ID if no active match
      if (!localStorage.getItem('activeMatchId') && activeLobbyId) {
        console.log('[MATCH_SAFETY_CHECK] Clearing orphaned lobby ID');
        localStorage.removeItem('activeLobbyId');
      }
    } catch (error) {
      console.error('[MATCH_SAFETY_CHECK] Unexpected error:', error);
    }
  }

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
