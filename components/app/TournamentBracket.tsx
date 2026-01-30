'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Users, Crown, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
  updated_at: string;
  player1?: {
    id: string;
    username: string | null;
  };
  player2?: {
    id: string;
    username: string | null;
  };
}

interface TournamentBracketProps {
  tournamentId: string;
  isCreator: boolean;
  tournamentStatus: string;
  tournamentStartAt: string;
}

export function TournamentBracket({ tournamentId, isCreator, tournamentStatus, tournamentStartAt }: TournamentBracketProps) {
  const router = useRouter();
  const supabase = createClient();
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    loadMatches();

    // Subscribe to match updates
    const channel = supabase
      .channel(`tournament_matches_${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          loadMatches();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  async function loadMatches() {
    try {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select(`
          id,
          tournament_id,
          round,
          match_index,
          player1_id,
          player2_id,
          winner_id,
          match_room_id,
          status,
          created_at,
          updated_at,
          player1:profiles!tournament_matches_player1_id_fkey (
            id,
            username
          ),
          player2:profiles!tournament_matches_player2_id_fkey (
            id,
            username
          )
        `)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_index', { ascending: true });

      if (error) throw error;

      // Map data to handle array joins from Supabase
      const mappedMatches: TournamentMatch[] = (data || []).map((match: any) => ({
        ...match,
        player1: Array.isArray(match.player1) ? match.player1[0] : match.player1,
        player2: Array.isArray(match.player2) ? match.player2[0] : match.player2,
      }));

      setMatches(mappedMatches);
    } catch (error: any) {
      console.error('LOAD_TOURNAMENT_MATCHES_ERROR', error);
      toast.error('Failed to load bracket');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateBracket() {
    if (!isCreator || processingAction) return;

    try {
      setProcessingAction(true);
      const { error } = await supabase.rpc('generate_tournament_bracket', {
        tournament_id: tournamentId
      });

      if (error) {
        toast.error(error.message || 'Failed to generate bracket');
        return;
      }

      toast.success('Bracket generated successfully!');
      await loadMatches();
    } catch (error: any) {
      console.error('GENERATE_BRACKET_ERROR', error);
      toast.error(error.message || 'Failed to generate bracket');
    } finally {
      setProcessingAction(false);
    }
  }

  async function handleStartRound(round: number) {
    if (!isCreator || processingAction) return;

    try {
      setProcessingAction(true);
      const { error } = await supabase.rpc('start_tournament_round_matches', {
        p_tournament_id: tournamentId,
        p_round: round
      });

      if (error) throw error;

      toast.success(`Round ${round} started!`);
      await loadMatches();
    } catch (error: any) {
      console.error('START_ROUND_ERROR', error);
      toast.error(error.message || 'Failed to start round');
    } finally {
      setProcessingAction(false);
    }
  }

  async function handleSetWinner(matchId: string, winnerId: string) {
    if (!isCreator || processingAction) return;

    try {
      setProcessingAction(true);
      const { error } = await supabase.rpc('report_tournament_match_winner', {
        p_match_id: matchId,
        p_winner_id: winnerId
      });

      if (error) throw error;

      toast.success('Winner reported!');
      await loadMatches();
    } catch (error: any) {
      console.error('REPORT_WINNER_ERROR', error);
      toast.error(error.message || 'Failed to report winner');
    } finally {
      setProcessingAction(false);
    }
  }

  function handleOpenMatch(matchRoomId: string) {
    console.log('[TOURNAMENT BRACKET] Opening match with room ID:', matchRoomId);
    console.log('[TOURNAMENT BRACKET] Navigation path:', `/app/match/online/${matchRoomId}`);
    router.push(`/app/match/online/${matchRoomId}`);
  }

  const getPlayerName = (player: any) => {
    if (!player) return 'TBD';
    return player.username || 'Anonymous';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'ready':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'completed':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  // Group matches by round
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, TournamentMatch[]>);

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  // Check if we should show generate bracket button
  const showGenerateBracket = isCreator && matches.length === 0 && (tournamentStatus === 'open' || tournamentStatus === 'scheduled');

  if (loading) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
        <p className="text-gray-400">Loading bracket...</p>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
        <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Bracket Yet</h3>
        <p className="text-gray-400 mb-6">
          {showGenerateBracket
            ? 'Generate the bracket to start the tournament'
            : 'The bracket will be generated when the tournament starts'}
        </p>
        {showGenerateBracket && (
          <Button
            onClick={handleGenerateBracket}
            disabled={processingAction}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
          >
            {processingAction ? 'Generating...' : 'Generate Bracket'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Tournament Bracket</h3>
        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
          {matches.length} Matches
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-6 pb-4 min-w-max">
          {roundNumbers.map((roundNum) => {
            const roundMatches = rounds[roundNum];
            const roundName = roundNum === roundNumbers[roundNumbers.length - 1] ? 'Final' :
                            roundNum === roundNumbers[roundNumbers.length - 2] ? 'Semi-Finals' :
                            roundNum === roundNumbers[roundNumbers.length - 3] ? 'Quarter-Finals' :
                            `Round ${roundNum}`;

            // Check if we can start this round
            const canStartRound = isCreator &&
                                  roundMatches.some(m => m.status === 'pending') &&
                                  roundMatches.every(m => m.player1_id && m.player2_id);

            return (
              <div key={roundNum} className="flex-shrink-0 w-80">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-lg font-bold text-white">{roundName}</h4>
                  {canStartRound && (
                    <Button
                      size="sm"
                      onClick={() => handleStartRound(roundNum)}
                      disabled={processingAction}
                      className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white text-xs"
                    >
                      Start Round
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  {roundMatches.map((match) => (
                    <div
                      key={match.id}
                      className="bg-slate-800/50 border border-white/10 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={`${getStatusColor(match.status)} border text-xs`}>
                          {match.status}
                        </Badge>
                        {match.match_room_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenMatch(match.match_room_id!)}
                            className="text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 text-xs h-7"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Open
                          </Button>
                        )}
                      </div>

                      {/* Player 1 */}
                      <div className={`flex items-center gap-2 p-2 rounded ${
                        match.winner_id === match.player1_id
                          ? 'bg-teal-500/20 border border-teal-500/30'
                          : 'bg-slate-700/30'
                      }`}>
                        <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          1
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">
                            {getPlayerName(match.player1)}
                          </p>
                        </div>
                        {match.winner_id === match.player1_id && (
                          <Crown className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>

                      {/* VS */}
                      <div className="text-center text-xs text-gray-500">VS</div>

                      {/* Player 2 */}
                      <div className={`flex items-center gap-2 p-2 rounded ${
                        match.winner_id === match.player2_id
                          ? 'bg-teal-500/20 border border-teal-500/30'
                          : 'bg-slate-700/30'
                      }`}>
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                          2
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">
                            {getPlayerName(match.player2)}
                          </p>
                        </div>
                        {match.winner_id === match.player2_id && (
                          <Crown className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>

                      {/* Set Winner Buttons (Creator Only, No Winner Yet) */}
                      {isCreator && !match.winner_id && match.player1_id && match.player2_id && (
                        <div className="flex gap-2 pt-2 border-t border-white/10">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetWinner(match.id, match.player1_id!)}
                            disabled={processingAction}
                            className="flex-1 border-white/10 text-white hover:bg-white/5 text-xs h-8"
                          >
                            Set P1 Winner
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetWinner(match.id, match.player2_id!)}
                            disabled={processingAction}
                            className="flex-1 border-white/10 text-white hover:bg-white/5 text-xs h-8"
                          >
                            Set P2 Winner
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
