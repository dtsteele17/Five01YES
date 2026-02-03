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
import { getPersistedMatch, clearPersistedMatch } from '@/lib/utils/match-storage';

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

      // Get persisted match using centralized utility
      const persistedMatch = getPersistedMatch();

      if (!persistedMatch) {
        return;
      }

      console.log('[MATCH_SAFETY_CHECK] Found persisted match:', persistedMatch);

      // Validate match exists and is in_progress
      const tableName = persistedMatch.matchType === 'ranked' ? 'ranked_match_rooms' : 'match_rooms';

      const { data: match, error } = await supabase
        .from(tableName)
        .select('id, status, player1_id, player2_id, winner_id, ended_at')
        .eq('id', persistedMatch.matchId)
        .maybeSingle();

      // If query failed, log but don't clear (might be temporary network issue)
      if (error) {
        console.error('[MATCH_SAFETY_CHECK] Error fetching match:', error);
        return;
      }

      // If match doesn't exist OR is not in_progress, clear storage
      if (!match || match.status !== 'in_progress') {
        console.log('[MATCH_SAFETY_CHECK] Match not active, clearing storage:', {
          matchId: persistedMatch.matchId,
          status: match?.status,
          exists: !!match,
        });

        clearPersistedMatch();
        return;
      }

      // Match is valid and in_progress - do NOT auto-navigate
      console.log('[MATCH_SAFETY_CHECK] Match is active:', persistedMatch.matchId);
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
