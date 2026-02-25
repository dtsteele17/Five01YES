'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';

// Import the QuickMatch game component dynamically to avoid SSR issues
const QuickMatchGame = dynamic(
  () => import('@/app/app/play/quick-match/match/page').then(mod => ({ default: mod.default })),
  { ssr: false }
);

interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  match_index: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  match_room_id: string | null;
  status: string;
  created_at: string;
  tournament: {
    id: string;
    name: string;
    legs_per_match: number;
    game_mode: number;
  } | null;
}

interface TournamentMatchPageProps {
  params: {
    tournamentId: string;
    matchId: string;
  };
}

export default function TournamentMatchPage({ params }: TournamentMatchPageProps) {
  const { tournamentId, matchId } = params;
  const router = useRouter();
  const supabase = createClient();
  
  const [tournamentMatch, setTournamentMatch] = useState<TournamentMatch | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isParticipant, setIsParticipant] = useState(false);

  useEffect(() => {
    loadCurrentUser();
    loadTournamentMatch();
  }, [tournamentId, matchId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadTournamentMatch = async () => {
    try {
      setLoading(true);
      
      const { data: matchData, error } = await supabase
        .from('tournament_matches')
        .select(`
          *,
          tournament:tournament_id (
            id,
            name,
            legs_per_match,
            game_mode
          )
        `)
        .eq('id', matchId)
        .eq('tournament_id', tournamentId)
        .single();

      if (error) throw error;
      if (!matchData) throw new Error('Tournament match not found');

      setTournamentMatch(matchData);
      
      // Check if current user is a participant in this match
      if (currentUserId) {
        const isPlayer = matchData.player1_id === currentUserId || matchData.player2_id === currentUserId;
        setIsParticipant(isPlayer);
      }

      // If match has no room ID but both players are set, create the room
      if (!matchData.match_room_id && matchData.player1_id && matchData.player2_id) {
        await createMatchRoom(matchData);
      }

    } catch (error) {
      console.error('Error loading tournament match:', error);
      toast.error('Failed to load tournament match');
      // Redirect back to tournament on error
      router.push(`/app/tournaments/${tournamentId}`);
    } finally {
      setLoading(false);
    }
  };

  const createMatchRoom = async (match: TournamentMatch) => {
    try {
      // Create a match room for this tournament match
      const { data: roomData, error: roomError } = await supabase.rpc('create_tournament_match_room', {
        p_tournament_match_id: match.id,
        p_player1_id: match.player1_id,
        p_player2_id: match.player2_id,
        p_tournament_id: tournamentId,
        p_game_mode: match.tournament?.game_mode || 501,
        p_legs_per_match: match.tournament?.legs_per_match || 3
      });

      if (roomError) throw roomError;

      if (roomData?.room_id) {
        // Update the match with the room ID
        const { error: updateError } = await supabase
          .from('tournament_matches')
          .update({ 
            match_room_id: roomData.room_id,
            status: 'ready'
          })
          .eq('id', match.id);

        if (updateError) throw updateError;

        // Reload the match data
        loadTournamentMatch();
      }
      
    } catch (error) {
      console.error('Error creating match room:', error);
      toast.error('Failed to create match room');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-white mb-2">Loading Tournament Match</h2>
          <p className="text-slate-400">Preparing your match...</p>
        </div>
      </div>
    );
  }

  // Error state - match not found
  if (!tournamentMatch) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Match Not Found</h2>
          <p className="text-slate-400 mb-6">The tournament match you're looking for doesn't exist.</p>
          <button 
            onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg"
          >
            Back to Tournament
          </button>
        </div>
      </div>
    );
  }

  // Handle different match states
  if (tournamentMatch.status === 'ready' && tournamentMatch.player1_id && tournamentMatch.player2_id) {
    // Show ready-up screen
    const TournamentMatchReadyUp = dynamic(
      () => import('@/components/app/TournamentMatchReadyUp').then(mod => ({ default: mod.TournamentMatchReadyUp })),
      { ssr: false }
    );
    
    return <TournamentMatchReadyUp matchId={matchId} tournamentId={tournamentId} />;
  }
  
  // Redirect to the actual match room if it exists
  if (tournamentMatch.match_room_id && (tournamentMatch.status === 'in_progress' || tournamentMatch.status === 'starting')) {
    router.push(`/app/play/quick-match/match?roomId=${tournamentMatch.match_room_id}&tournamentMatch=${matchId}&tournamentId=${tournamentId}`);
    return null;
  }

  // Match waiting room - before players are ready
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Tournament Match Header */}
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 mb-6">
          <div className="text-center space-y-3">
            <h1 className="text-2xl font-black text-white">
              {tournamentMatch.tournament?.name}
            </h1>
            <div className="flex items-center justify-center gap-4 text-slate-400">
              <span>Round {tournamentMatch.round}</span>
              <span>•</span>
              <span>Match {tournamentMatch.match_index + 1}</span>
              <span>•</span>
              <span>{tournamentMatch.tournament?.game_mode} Darts</span>
              <span>•</span>
              <span>Best of {tournamentMatch.tournament?.legs_per_match}</span>
            </div>
          </div>
        </div>

        {/* Match Status */}
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 text-center">
          {!tournamentMatch.player1_id || !tournamentMatch.player2_id ? (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-slate-700 rounded-full mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Waiting for Players</h2>
              <p className="text-slate-400">
                This match is waiting for players to advance from previous rounds.
              </p>
            </div>
          ) : !tournamentMatch.match_room_id ? (
            <div className="space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white">Players Ready</h2>
              <p className="text-slate-400">Setting up match room...</p>
              <div className="animate-pulse text-emerald-400">Preparing match...</div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </div>
              
              <div>
                <h2 className="text-xl font-bold text-white mb-2">Match Ready</h2>
                <p className="text-slate-400">Both players are ready to begin.</p>
              </div>

              {isParticipant ? (
                <button 
                  onClick={() => router.push(`/app/play/quick-match/match?roomId=${tournamentMatch.match_room_id}&tournamentMatch=${matchId}`)}
                  className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200"
                >
                  Join Match
                </button>
              ) : (
                <div className="space-y-3">
                  <button 
                    onClick={() => router.push(`/app/play/quick-match/match?roomId=${tournamentMatch.match_room_id}&spectate=true`)}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 mr-4"
                  >
                    Spectate Match
                  </button>
                  <p className="text-xs text-slate-500">
                    You can watch this match as a spectator
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Back to Tournament Button */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <button 
              onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Tournament
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}