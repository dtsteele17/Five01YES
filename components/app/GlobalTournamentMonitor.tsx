'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TournamentCountdownPopup } from './TournamentCountdownPopup';
import { TournamentReadyUpModal } from './TournamentReadyUpModal';

/**
 * Global monitor that runs in the app layout.
 * - Polls for tournaments the user is registered in that are about to start or live.
 * - Shows the countdown popup from ANY page when a tournament starts.
 * - After first round, shows the ready-up modal when user's next match is pending.
 */
export default function GlobalTournamentMonitor() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);

  // Countdown state
  const [activeTournament, setActiveTournament] = useState<{
    id: string;
    name: string;
    startTime: string;
  } | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownComplete, setCountdownComplete] = useState(false);

  // Ready-up state (for round 2+ matches)
  const [readyUpMatch, setReadyUpMatch] = useState<{
    matchId: string;
    tournamentId: string;
    tournamentName: string;
    opponentId: string;
    opponentName: string;
    round: number;
  } | null>(null);

  const dismissedTournamentsRef = useRef<Set<string>>(new Set());
  const dismissedMatchesRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Get user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // Don't show on tournament detail pages (they have their own countdown)
  const isOnTournamentPage = pathname?.startsWith('/app/tournaments/') && !pathname?.includes('/match');

  const checkTournaments = useCallback(async () => {
    if (!userId || isOnTournamentPage) return;

    try {
      // 1. Check for tournaments starting soon (within 2 min) or just started
      const { data: myParticipations } = await supabase
        .from('tournament_participants')
        .select('tournament_id')
        .eq('user_id', userId)
        .in('status_type', ['registered', 'checked-in']);

      if (!myParticipations?.length) return;

      const tournamentIds = myParticipations.map(p => p.tournament_id);

      // Check for tournaments that just went live or are about to
      const { data: liveTournaments } = await supabase
        .from('tournaments')
        .select('id, name, start_at, status, bracket_generated_at')
        .in('id', tournamentIds)
        .in('status', ['scheduled', 'checkin', 'in_progress']);

      if (!liveTournaments?.length) return;

      const now = Date.now();

      for (const t of liveTournaments) {
        if (dismissedTournamentsRef.current.has(t.id)) continue;

        const startMs = new Date(t.start_at).getTime();
        const msSinceStart = now - startMs;
        const msUntilStart = startMs - now;

        // Auto-cancel stale tournaments: live for >4 min with no active matches
        if (t.status === 'in_progress' && msSinceStart > 240000) {
          try {
            const { data: activeMatches } = await supabase
              .from('tournament_matches')
              .select('id')
              .eq('tournament_id', t.id)
              .in('status', ['in_progress', 'ready'])
              .limit(1);
            if (!activeMatches?.length) {
              await supabase
                .from('tournaments')
                .update({ status: 'cancelled' })
                .eq('id', t.id);
              console.log('[GlobalTournamentMonitor] Auto-cancelled stale tournament:', t.name);
              dismissedTournamentsRef.current.add(t.id);
              continue;
            }
          } catch {}
        }

        // Only show popup AFTER start time has passed (within 60s window)
        // Never show before start time or more than 60s after
        if (msSinceStart >= 0 && msSinceStart <= 60000 && !showCountdown && !countdownComplete) {
          // Trigger bracket generation if not already done (in case user isn't on tournament detail page)
          if (!t.bracket_generated_at) {
            try {
              console.log('[GlobalTournamentMonitor] Triggering bracket generation for:', t.name);
              await supabase.rpc('complete_tournament_flow_progression', {
                p_tournament_id: t.id
              });
            } catch (err) {
              console.log('[GlobalTournamentMonitor] Progression RPC error (may already be in progress):', err);
            }
          }
          
          setActiveTournament({ id: t.id, name: t.name, startTime: t.start_at });
          setShowCountdown(true);
          dismissedTournamentsRef.current.add(t.id);
          return; // Only show one at a time
        }

        // If tournament started more than 60s ago, just dismiss it silently
        if (msSinceStart > 60000) {
          dismissedTournamentsRef.current.add(t.id);
        }
      }

      // 2. Check for pending ready-up matches (round 2+)
      if (!readyUpMatch) {
        for (const t of liveTournaments) {
          if (t.status !== 'in_progress' || !t.bracket_generated_at) continue;

          const matchResponse: {
            data: {
              id: string;
              round: number;
              match_index: number;
              player1_id: string | null;
              player2_id: string | null;
              status: string;
            } | null;
            error: any;
          } = await supabase
            .from('tournament_matches')
            .select('id, round, match_index, player1_id, player2_id, status')
            .eq('tournament_id', t.id)
            .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
            .eq('status', 'ready')
            .gt('round', 1)
            .limit(1)
            .maybeSingle();

          const myMatch = matchResponse.data;

          if (myMatch && !dismissedMatchesRef.current.has(myMatch.id)) {
            const opponentId = myMatch.player1_id === userId ? myMatch.player2_id : myMatch.player1_id;
            if (opponentId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('username')
                .eq('user_id', opponentId)
                .maybeSingle();

              setReadyUpMatch({
                matchId: myMatch.id,
                tournamentId: t.id,
                tournamentName: t.name,
                opponentId,
                opponentName: profile?.username || 'Opponent',
                round: myMatch.round,
              });
              dismissedMatchesRef.current.add(myMatch.id);
            }
          }
        }
      }
    } catch (err) {
      console.error('[GlobalTournamentMonitor] Error:', err);
    }
  }, [userId, isOnTournamentPage, showCountdown, countdownComplete, readyUpMatch]);

  // Poll every 15 seconds
  useEffect(() => {
    if (!userId) return;
    checkTournaments();
    pollingRef.current = setInterval(checkTournaments, 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [userId, checkTournaments]);

  // Handle countdown completion → navigate to tournament page
  // (bracket generation is handled by TournamentCountdownPopup itself)
  const handleCountdownComplete = useCallback(() => {
    setShowCountdown(false);
    setCountdownComplete(true);
    if (activeTournament) {
      router.push(`/app/tournaments/${activeTournament.id}`);
    }
  }, [activeTournament, router]);

  // Handle ready-up dismissal
  const handleReadyUpClose = useCallback(() => {
    setReadyUpMatch(null);
  }, []);

  return (
    <>
      {/* Global countdown popup - shown from any page */}
      {activeTournament && showCountdown && (
        <TournamentCountdownPopup
          tournamentId={activeTournament.id}
          tournamentName={activeTournament.name}
          startTime={activeTournament.startTime}
          onComplete={handleCountdownComplete}
          isVisible={showCountdown}
        />
      )}
    </>
  );
}
