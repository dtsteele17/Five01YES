'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Loader2, Trophy, Users, Play, CheckCircle, Clock, Swords } from 'lucide-react';
import { toast } from 'sonner';

interface BracketMatch {
  tournament_id: string;
  round: number;
  match_index: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  status: string;
  completed_at: string | null;
  player1_username: string | null;
  player2_username: string | null;
}

interface PlayableMatch extends BracketMatch {}

interface TournamentBracketTabProps {
  tournamentId: string;
  bracketGeneratedAt: string | null;
  isOrganizer: boolean;
  tournamentStatus: string;
}

export default function TournamentBracketTab({
  tournamentId,
  bracketGeneratedAt,
  isOrganizer,
  tournamentStatus: initialStatus,
}: TournamentBracketTabProps) {
  const router = useRouter();
  const supabase = createClient();
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [nextMatch, setNextMatch] = useState<PlayableMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reportingWinner, setReportingWinner] = useState(false);
  const [tournamentStatus, setTournamentStatus] = useState(initialStatus);
  const [userMatch, setUserMatch] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    setTournamentStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`tournament-bracket-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournaments',
          filter: `id=eq.${tournamentId}`,
        },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_match_ready',
        },
        () => {
          loadUserMatch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadBracket(), loadNextMatch(), loadTournamentStatus(), loadUserMatch()]);
    } finally {
      setLoading(false);
    }
  };

  const loadTournamentStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('status')
        .eq('id', tournamentId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setTournamentStatus(data.status);
      }
    } catch (error: any) {
      console.error('Error loading tournament status:', error);
    }
  };

  const loadBracket = async () => {
    try {
      const { data, error } = await supabase
        .from('v_tournament_bracket')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_index', { ascending: true });

      if (error) throw error;
      setMatches(data || []);
    } catch (error: any) {
      console.error('Error loading bracket:', error);
      toast.error('Failed to load bracket');
    }
  };

  const loadNextMatch = async () => {
    try {
      const { data, error } = await supabase
        .from('v_tournament_playable_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setNextMatch(data);
    } catch (error: any) {
      console.error('Error loading next match:', error);
    }
  };

  const loadUserMatch = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .in('status', ['pending', 'ready_check', 'in_progress'])
        .order('round', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.status === 'in_progress' && data.match_room_id) {
        router.push(`/app/match/online/${data.match_room_id}`);
        return;
      }

      setUserMatch(data);
    } catch (error: any) {
      console.error('Error loading user match:', error);
    }
  };

  const handleGenerateBracket = async () => {
    try {
      setGenerating(true);

      const { data, error } = await supabase.rpc('generate_tournament_bracket', {
        tournament_id: tournamentId,
      });

      if (error) {
        toast.error(error.message || 'Failed to generate bracket');
        return;
      }

      if (data?.success) {
        toast.success('Bracket generated successfully!');
        await loadData();
      } else {
        toast.error(data?.message || 'Failed to generate bracket');
      }
    } catch (error: any) {
      console.error('Error generating bracket:', error);
      toast.error(error.message || 'Failed to generate bracket');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartTournament = async () => {
    try {
      setStarting(true);

      const { data, error } = await supabase.rpc('start_tournament', {
        tournament_id: tournamentId,
      });

      if (error) {
        toast.error(error.message || 'Failed to start tournament');
        return;
      }

      if (data?.success) {
        toast.success('Tournament started!');
        await loadData();
      } else {
        toast.error(data?.message || 'Failed to start tournament');
      }
    } catch (error: any) {
      console.error('Error starting tournament:', error);
      toast.error(error.message || 'Failed to start tournament');
    } finally {
      setStarting(false);
    }
  };

  const handleReportWinner = async (winnerId: string) => {
    if (!nextMatch) return;

    try {
      setReportingWinner(true);

      const { data, error } = await supabase.rpc('report_tournament_match_winner', {
        tournament_id: tournamentId,
        round: nextMatch.round,
        match_index: nextMatch.match_index,
        winner_id: winnerId,
      });

      if (error) {
        toast.error(error.message || 'Failed to report winner');
        return;
      }

      if (data?.success) {
        if (data.tournament_completed) {
          toast.success('Tournament completed!');
        } else {
          toast.success('Match result recorded!');
        }
        await loadData();
      } else {
        toast.error(data?.message || 'Failed to report winner');
      }
    } catch (error: any) {
      console.error('Error reporting winner:', error);
      toast.error(error.message || 'Failed to report winner');
    } finally {
      setReportingWinner(false);
    }
  };

  if (loading && !bracketGeneratedAt) {
    return (
      <Card className="bg-slate-900/50 border border-white/10">
        <CardContent className="py-16">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-gray-600 mx-auto mb-4 animate-spin" />
            <p className="text-gray-400">Loading bracket...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!bracketGeneratedAt && matches.length === 0) {
    return (
      <Card className="bg-slate-900/50 border border-white/10">
        <CardContent className="py-16">
          <div className="text-center">
            <Layers className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Bracket Not Generated Yet</h3>
            <p className="text-gray-400 mb-6">
              The tournament bracket will be automatically generated 5 minutes before the start time
            </p>
            {isOrganizer && tournamentStatus === 'scheduled' && (
              <Button
                onClick={handleGenerateBracket}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4 mr-2" />
                    Generate Bracket Now (Organizer)
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedMatches = matches.reduce((acc, match) => {
    if (!acc[match.round]) {
      acc[match.round] = [];
    }
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, BracketMatch[]>);

  const rounds = Object.keys(groupedMatches)
    .map(Number)
    .sort((a, b) => a - b);

  const getRoundName = (round: number, totalRounds: number) => {
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) return 'Semi-Finals';
    if (round === totalRounds - 2) return 'Quarter-Finals';
    return `Round ${round}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      pending: { className: 'bg-gray-600', label: 'Pending' },
      ready: { className: 'bg-blue-600', label: 'Ready' },
      live: { className: 'bg-green-600', label: 'Live' },
      completed: { className: 'bg-slate-600', label: 'Completed' },
      bye: { className: 'bg-yellow-600', label: 'Bye' },
    };
    const variant = variants[status] || variants.pending;
    return (
      <Badge className={`${variant.className} text-white text-xs`}>
        {variant.label}
      </Badge>
    );
  };

  const getPlayerDisplay = (
    playerId: string | null,
    username: string | null,
    winnerId: string | null
  ) => {
    if (!playerId) {
      return <span className="text-gray-500 italic">TBD</span>;
    }

    const isWinner = winnerId === playerId;
    const displayName = username || 'Unknown';

    return (
      <span className={`${isWinner ? 'text-yellow-400 font-semibold' : 'text-white'}`}>
        {displayName}
        {isWinner && <Trophy className="w-3 h-3 ml-1 inline" />}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {isOrganizer && tournamentStatus === 'scheduled' && bracketGeneratedAt && (
        <Card className="bg-gradient-to-r from-blue-900/50 to-blue-800/30 border border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-400" />
              Host Controls
            </CardTitle>
            <CardDescription className="text-blue-200">
              Start the tournament when ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleStartTournament}
              disabled={starting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              {starting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting Tournament...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Tournament
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {userMatch && tournamentStatus === 'in_progress' && (
        <Card className="bg-gradient-to-r from-orange-900/50 to-orange-800/30 border border-orange-500/20 mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-400" />
              Your Match is Ready!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-300">
                You have an active match in Round {userMatch.round}. Get ready to play!
              </p>
              <Button
                onClick={() => router.push(`/app/tournaments/${tournamentId}/ready`)}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                size="lg"
              >
                <Clock className="w-4 h-4 mr-2" />
                Enter Ready Room
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(tournamentStatus === 'in_progress' || tournamentStatus === 'completed') && (
        <Card className="bg-gradient-to-r from-green-900/50 to-green-800/30 border border-green-500/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-green-400" />
              {tournamentStatus === 'completed' ? 'Tournament Complete' : 'Next Match'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!nextMatch || tournamentStatus === 'completed' ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-white text-lg font-semibold">Tournament Completed!</p>
                <p className="text-gray-400 text-sm">Check the bracket for the final results</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-white/5">
                  <div className="text-center text-gray-400 text-sm mb-3">
                    {getRoundName(nextMatch.round, rounds.length)} - Match #{nextMatch.match_number}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-400" />
                        <span className="text-white font-medium">
                          {nextMatch.player1_username || 'Player 1'}
                        </span>
                      </div>
                      <Button
                        onClick={() => handleReportWinner(nextMatch.player1_id!)}
                        disabled={reportingWinner}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        {reportingWinner ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Wins'
                        )}
                      </Button>
                    </div>
                    <div className="text-center text-gray-500 text-xs font-medium">VS</div>
                    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-gray-400" />
                        <span className="text-white font-medium">
                          {nextMatch.player2_username || 'Player 2'}
                        </span>
                      </div>
                      <Button
                        onClick={() => handleReportWinner(nextMatch.player2_id!)}
                        disabled={reportingWinner}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        {reportingWinner ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Wins'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rounds.map((round) => (
        <Card key={round} className="bg-slate-900/50 border border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-blue-400" />
              {getRoundName(round, rounds.length)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedMatches[round].map((match, idx) => (
                <div
                  key={`${match.round}-${match.match_index}-${idx}`}
                  className="bg-slate-800/50 border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gray-400 text-sm font-medium">
                      Match #{match.match_number}
                    </span>
                    {getStatusBadge(match.status)}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        {getPlayerDisplay(match.player1_id, match.player1_username, match.winner_id)}
                      </div>
                    </div>
                    <div className="text-center text-gray-500 text-xs font-medium">VS</div>
                    <div className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-500" />
                        {getPlayerDisplay(match.player2_id, match.player2_username, match.winner_id)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
