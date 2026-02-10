'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, Users, Trophy, ArrowLeft, UserPlus, Target, Layers } from 'lucide-react';
import { toast } from 'sonner';
import TournamentBracketTab from '@/components/app/TournamentBracketTab';

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  start_at: string | null;
  status: string;
  max_participants: number;
  round_scheduling: string;
  entry_type: string;
  game_mode: number;
  best_of_legs: number;
  created_by: string;
  created_at: string;
  bracket_generated_at: string | null;
  started_at: string | null;
}

interface Participant {
  id: string;
  tournament_id: string;
  user_id: string;
  role: string;
  status_type: string;
  joined_at: string;
  profiles: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export default function TournamentDetailPage({ params }: { params: { tournamentId: string } }) {
  const { tournamentId } = params;
  const router = useRouter();
  const supabase = createClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel(`tournament-${tournamentId}`)
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
          event: 'INSERT',
          schema: 'public',
          table: 'tournament_participants',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          console.log('[TOURNAMENT] Participant added, reloading data');
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tournament_participants',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          console.log('[TOURNAMENT] Participant removed, reloading data');
          loadData();
        }
      )
      .subscribe();

    // Watch for participant changes - reload when someone registers
    const participantsChannel = supabase
      .channel(`tournament-participants-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_participants',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          console.log('[TOURNAMENT PAGE] Participant change detected, reloading data');
          loadData();
        }
      )
      .subscribe();

    // Watch for match updates - auto-redirect when match starts
    const matchChannel = supabase
      .channel(`tournament-matches-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournament_matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        async (payload) => {
          const match = payload.new as any;
          if (currentUserId && (match.player1_id === currentUserId || match.player2_id === currentUserId)) {
            if (match.status === 'in_game' && match.match_room_id) {
              console.log('[TOURNAMENT PAGE] Match started, redirecting to:', match.match_room_id);
              toast.success('Match starting!');
              router.push(`/app/match/online/${match.match_room_id}`);
            }
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      try {
        console.log('[TOURNAMENT PAGE] Polling cron RPCs', { tournamentId });
        const { data: dueData, error: dueError } = await supabase.rpc('process_due_tournaments');
        if (dueError) {
          console.error('[TOURNAMENT PAGE] process_due_tournaments error:', dueError);
        } else {
          console.log('[TOURNAMENT PAGE] process_due_tournaments result:', dueData);
        }
        const { data: readyData, error: readyError } = await supabase.rpc('process_ready_deadlines');
        if (readyError) {
          console.error('[TOURNAMENT PAGE] process_ready_deadlines error:', readyError);
        } else {
          console.log('[TOURNAMENT PAGE] process_ready_deadlines result:', readyData);
        }
      } catch (error) {
        console.error('Error polling tournament processing:', error);
      }
    }, 15000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(participantsChannel);
      supabase.removeChannel(matchChannel);
      clearInterval(pollInterval);
    };
  }, [tournamentId, currentUserId, router]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .maybeSingle();

      if (tournamentError) throw tournamentError;
      if (!tournamentData) {
        toast.error('Tournament not found');
        router.push('/app/tournaments');
        return;
      }

      setTournament(tournamentData);

      const { data: participantsData, error: participantsError } = await supabase
        .from('tournament_participants')
        .select(`
          id,
          tournament_id,
          user_id,
          role,
          status_type,
          joined_at,
          profiles:profiles!tournament_participants_user_id_fkey (
            id,
            username,
            avatar_url
          )
        `)
        .eq('tournament_id', tournamentId)
        .in('status_type', ['registered', 'checked-in'])  // Only count registered/checked-in participants
        .order('joined_at', { ascending: true });

      if (participantsError) throw participantsError;

      const mappedParticipants = (participantsData || []).map((p: any) => ({
        id: p.id,
        tournament_id: p.tournament_id,
        user_id: p.user_id,
        role: p.role,
        status_type: p.status_type,
        joined_at: p.joined_at,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
      }));

      setParticipants(mappedParticipants);

      if (user?.id) {
        const { data: existing } = await supabase
          .from('tournament_participants')
          .select('id')
          .eq('tournament_id', tournamentId)
          .eq('user_id', user.id)
          .in('status_type', ['registered', 'checked-in'])  // Only check registered/checked-in status
          .maybeSingle();

        setIsRegistered(!!existing);

        // Check if user has an active match that's already started (in_game)
        if (existing) {
          const { data: activeMatch, error: matchError } = await supabase
            .from('tournament_matches')
            .select('id, status, match_room_id')
            .eq('tournament_id', tournamentId)
            .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
            .eq('status', 'in_game')
            .not('match_room_id', 'is', null)
            .limit(1)
            .maybeSingle();

          if (activeMatch && activeMatch.match_room_id) {
            console.log('[TOURNAMENT] Active match found, redirecting to:', activeMatch.match_room_id);
            router.push(`/app/match/online/${activeMatch.match_room_id}`);
            return;
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading tournament:', error);
      toast.error('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!currentUserId || !tournament) {
      toast.error('Please log in to register');
      return;
    }

    try {
      setJoining(true);

      const { error } = await supabase
        .from('tournament_participants')
        .insert({
          tournament_id: tournament.id,
          user_id: currentUserId,
          role: 'participant',
          status_type: 'registered',
        });

      if (error) {
        if (error.code === '23505') {
          setIsRegistered(true);
          toast.success('You are already registered!');
          await loadData();
          return;
        }
        throw error;
      }

      toast.success('Successfully registered for tournament!');
      setIsRegistered(true);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to register for tournament');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-1/4"></div>
          <div className="h-64 bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return null;
  }

  const isCreator = tournament.created_by === currentUserId;
  const canJoin =
    tournament.entry_type === 'open' &&
    tournament.status === 'scheduled' &&
    !isRegistered &&
    participants.length < tournament.max_participants &&
    currentUserId;

  const startDate = tournament.start_at ? new Date(tournament.start_at) : null;
  const formattedDate = startDate ? startDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : 'Not scheduled';
  const formattedTime = startDate ? startDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }) : '';

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: 'bg-gray-600',
      scheduled: 'bg-blue-600',
      checkin: 'bg-yellow-600',
      in_progress: 'bg-green-600',
      completed: 'bg-slate-600',
      cancelled: 'bg-red-600',
    };
    return (
      <Badge className={`${variants[status] || 'bg-gray-600'} text-white`}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getTimeUntilStart = () => {
    if (!startDate) return null;
    const now = new Date();
    const diff = startDate.getTime() - now.getTime();

    if (diff < 0) return 'Started';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getInitials = (name: string | undefined | null) => {
    const safeName = (name ?? 'P').trim() || 'P';
    return safeName
      .split(' ')
      .map(n => n[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'P';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/app/tournaments')}
          className="mb-6 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Tournaments
        </Button>

        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-3">
                <h1 className="text-4xl font-bold text-white">{tournament.name}</h1>
                {getStatusBadge(tournament.status)}
              </div>
              {tournament.description && (
                <p className="text-gray-400 text-lg">{tournament.description}</p>
              )}
            </div>
            {isRegistered ? (
              <Button
                disabled
                className="bg-green-600/50 text-white cursor-not-allowed"
                size="lg"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Registered
              </Button>
            ) : canJoin ? (
              <Button
                onClick={handleRegister}
                disabled={joining}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {joining ? 'Registering...' : 'Register Here'}
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <CardTitle className="text-sm font-normal">Start Date</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-white font-semibold text-sm">{formattedDate}</p>
                {formattedTime && (
                  <p className="text-gray-400 text-xs mt-1">{formattedTime}</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Users className="w-4 h-4" />
                  <CardTitle className="text-sm font-normal">Participants</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-white font-semibold">
                  {participants.length} / {tournament.max_participants}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Target className="w-4 h-4" />
                  <CardTitle className="text-sm font-normal">Game Mode</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-white font-semibold">{tournament.game_mode}</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-white/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Trophy className="w-4 h-4" />
                  <CardTitle className="text-sm font-normal">Format</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-white font-semibold">Best of {tournament.best_of_legs}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-slate-900/50 border border-white/10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="bracket">Bracket</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card className="bg-slate-900/50 border border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Tournament Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Entry Type</p>
                    <p className="text-white font-medium capitalize">
                      {tournament.entry_type.replace('_', ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm mb-1">Round Scheduling</p>
                    <p className="text-white font-medium capitalize">
                      {tournament.round_scheduling.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                {startDate && (
                  <>
                    <Separator className="bg-white/10" />
                    <div>
                      <p className="text-gray-400 text-sm mb-2">Time Until Start</p>
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-400" />
                        <p className="text-white text-2xl font-bold">{getTimeUntilStart()}</p>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="players">
            <Card className="bg-slate-900/50 border border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Registered Players</CardTitle>
                <CardDescription className="text-gray-400">
                  {participants.length} of {tournament.max_participants} spots filled
                </CardDescription>
              </CardHeader>
              <CardContent>
                {participants.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No players registered yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {participants.map((participant, index) => {
                      const displayName =
                        participant.profiles?.username ||
                        'Unknown Player';

                      return (
                        <div
                          key={participant.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-white/5 hover:border-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 font-mono text-sm w-8">
                              #{index + 1}
                            </span>
                            <Avatar className="w-10 h-10 border-2 border-white/10">
                              <AvatarImage src={participant.profiles?.avatar_url || ''} />
                              <AvatarFallback className="bg-slate-700 text-white">
                                {getInitials(displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-white font-medium">{displayName}</p>
                              <p className="text-gray-500 text-xs">
                                Joined {new Date(participant.joined_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {participant.user_id === tournament.created_by && (
                              <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
                                Organizer
                              </Badge>
                            )}
                            {participant.user_id === currentUserId && participant.user_id !== tournament.created_by && (
                              <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bracket">
            <TournamentBracketTab
              tournamentId={tournamentId}
              bracketGeneratedAt={tournament.bracket_generated_at}
              isOrganizer={isCreator}
              tournamentStatus={tournament.status}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
