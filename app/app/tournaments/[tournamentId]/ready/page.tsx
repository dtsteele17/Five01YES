'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isMatchStarted, getMatchRedirect } from '@/lib/utils/tournament-match-status';

interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  match_index: number;
  match_number: number;
  player1_id: string;
  player2_id: string;
  status: string;
  match_room_id: string | null;
  ready_deadline: string | null;
  playable_at: string | null;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface ReadyStatus {
  player1_ready: boolean;
  player2_ready: boolean;
}

export default function TournamentReadyUpPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.tournamentId as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<TournamentMatch | null>(null);
  const [opponent, setOpponent] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [readyingUp, setReadyingUp] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(180);
  const [autoReadyTriggered, setAutoReadyTriggered] = useState(false);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  useEffect(() => {
    if (!match) {
      // Clean up subscription if match is cleared
      if (subscriptionRef.current) {
        console.log('[TOURNAMENT READY PAGE] Cleaning up subscription - no match');
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      return;
    }

    // Prevent creating duplicate subscriptions
    if (subscriptionRef.current) {
      console.log('[TOURNAMENT READY PAGE] Subscription already exists for match:', match.id);
      return;
    }

    console.log('[TOURNAMENT READY PAGE] Creating realtime subscription for match:', match.id);

    const matchChannel = supabase
      .channel(`tournament-match-${match.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournament_matches',
          filter: `id=eq.${match.id}`,
        },
        (payload) => {
          console.log('[TOURNAMENT READY PAGE] Match updated:', payload.new);
          const updated = payload.new as TournamentMatch;
          setMatch(updated);

          if (updated.match_room_id) {
            console.log('[TOURNAMENT READY PAGE] Match room created, navigating to:', updated.match_room_id);
            router.push(`/app/match/online/${updated.match_room_id}`);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_match_ready',
          filter: `match_id=eq.${match.id}`,
        },
        (payload) => {
          console.log('[TOURNAMENT READY PAGE] Ready status changed:', payload);
          loadReadyStatus();
        }
      )
      .subscribe((status) => {
        console.log('[TOURNAMENT READY PAGE] Subscription status:', status);
      });

    subscriptionRef.current = matchChannel;

    return () => {
      console.log('[TOURNAMENT READY PAGE] Cleaning up subscription on unmount');
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
    };
  }, [match?.id]);

  useEffect(() => {
    if (!match?.ready_deadline) return;

    // Stop countdown if both players are ready
    if (isReady && opponentReady) {
      return;
    }

    const deadline = new Date(match.ready_deadline).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0 && !isReady && !autoReadyTriggered) {
        setAutoReadyTriggered(true);
        handleReadyUp();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [match?.ready_deadline, isReady, opponentReady, autoReadyTriggered]);

  const loadData = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      const { data: matchData, error: matchError } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .in('status', ['pending', 'ready_check', 'in_progress'])
        .order('round', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (matchError) throw matchError;

      if (!matchData) {
        toast.error('No active match found');
        router.push(`/app/tournaments/${tournamentId}`);
        return;
      }

      // Use canonical match status logic
      const matchStatus = getMatchRedirect(matchData, tournamentId, user.id);
      
      if (matchStatus.canRedirect && !matchStatus.shouldShowReadyUp) {
        if (matchStatus.redirectUrl) {
          router.push(matchStatus.redirectUrl);
          return;
        }
      }

      if (matchData.status === 'completed') {
        toast.info('Match already completed');
        router.push(`/app/tournaments/${tournamentId}`);
        return;
      }

      setMatch(matchData);

      const opponentId =
        matchData.player1_id === user.id
          ? matchData.player2_id
          : matchData.player1_id;

      // tournament_matches.player1_id/player2_id are auth.users.id
      // So we need to query profiles by user_id (not id)
      const { data: opponentData, error: opponentError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('user_id', opponentId)
        .single();

      if (opponentError) throw opponentError;
      setOpponent(opponentData);

      await loadReadyStatus();
    } catch (error: any) {
      console.error('Error loading ready up data:', error);
      toast.error('Failed to load match data');
    } finally {
      setLoading(false);
    }
  };

  const loadReadyStatus = async () => {
    if (!match || !currentUserId) return;

    try {
      // CANONICAL IDENTITY: Use auth user IDs consistently
      // tournament_match_ready.user_id should store auth.user.id (not profiles.id)
      const opponentAuthId = match.player1_id === currentUserId ? match.player2_id : match.player1_id;

      // Fetch ready status using auth user IDs
      const { data, error } = await supabase
        .from('tournament_match_ready')
        .select('user_id')
        .eq('match_id', match.id);

      if (error) throw error;

      const readyUserIds = data.map((r) => r.user_id);
      
      // Check ready status using auth user IDs consistently
      setIsReady(readyUserIds.includes(currentUserId));
      setOpponentReady(readyUserIds.includes(opponentAuthId));

      console.log('[TOURNAMENT READY PAGE] Ready status loaded (canonical):', {
        currentUserId,
        opponentAuthId,
        readyUserIds,
        isReady: readyUserIds.includes(currentUserId),
        opponentReady: readyUserIds.includes(opponentAuthId),
      });
    } catch (error: any) {
      console.error('Error loading ready status:', error);
    }
  };

  const handleReadyUp = async (retryCount = 0): Promise<void> => {
    if (!match || readyingUp) {
      console.log('[TOURNAMENT READY PAGE] Skipping ready up - match or already readying:', {
        hasMatch: !!match,
        readyingUp,
      });
      return;
    }

    setReadyingUp(true);

    try {
      // Get current user and session info
      const { data: { session } } = await supabase.auth.getSession();

      console.log('[TOURNAMENT READY PAGE] === Ready Up Request ===');
      console.log('[TOURNAMENT READY PAGE] Current User ID:', session?.user?.id);
      console.log('[TOURNAMENT READY PAGE] Match ID:', match.id);
      console.log('[TOURNAMENT READY PAGE] Session exists:', !!session);
      console.log('[TOURNAMENT READY PAGE] Retry count:', retryCount);

      if (!session?.user) {
        console.error('[TOURNAMENT READY PAGE] No authenticated user found');
        toast.error('You must be logged in to ready up');
        setReadyingUp(false);
        return;
      }

      // Call RPC with authenticated session (use ready_up_tournament_match, not rpc_tourn_ready)
      const { data: rpcResponse, error } = await supabase.rpc('ready_up_tournament_match', {
        p_match_id: match.id,
      });

      // Extract room_id from response if it's a JSON object
      let roomId = null;
      if (rpcResponse) {
        if (typeof rpcResponse === 'object' && rpcResponse !== null) {
          roomId = (rpcResponse as any).match_room_id || null;
        } else {
          // If it's just a UUID string, use it directly
          roomId = typeof rpcResponse === 'string' ? rpcResponse : null;
        }
      }

      if (error) {
        console.error('[TOURNAMENT READY PAGE] RPC Error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });

        // Handle "Not authenticated" error with session refresh retry
        if (error.message?.toLowerCase().includes('not authenticated') && retryCount === 0) {
          console.log('[TOURNAMENT READY PAGE] Authentication error detected, refreshing session and retrying...');
          toast.info('Refreshing session...');

          const { error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError) {
            console.error('[TOURNAMENT READY PAGE] Session refresh failed:', refreshError);
            toast.error('Session refresh failed. Please log in again.');
            setReadyingUp(false);
            return;
          }

          // Retry once after session refresh
          setReadyingUp(false);
          await new Promise(resolve => setTimeout(resolve, 500));
          return handleReadyUp(1);
        }

        toast.error(error.message || 'Failed to ready up');
        setReadyingUp(false);
        return;
      }

      console.log('[TOURNAMENT READY PAGE] RPC Success - Response:', rpcResponse);
      console.log('[TOURNAMENT READY PAGE] Room ID:', roomId);
      console.log('[TOURNAMENT READY PAGE] Room ID type:', typeof roomId);
      console.log('[TOURNAMENT READY PAGE] Room ID is null:', roomId === null);

      // If room_id is returned, navigate immediately
      if (roomId) {
        console.log('[TOURNAMENT READY PAGE] Both players ready! Navigating to room:', roomId);
        toast.success('Both players ready! Starting match...');
        router.push(`/app/match/online/${roomId}`);
      } else {
        // Update local state and show success message
        console.log('[TOURNAMENT READY PAGE] Ready up successful, waiting for opponent');
        setIsReady(true);
        toast.success('You are ready! Waiting for opponent...');

        // Reload ready status to ensure UI is in sync
        await loadReadyStatus();
      }
    } catch (error: any) {
      console.error('[TOURNAMENT READY PAGE] Exception during ready up:', error);
      toast.error(error.message || 'Failed to ready up');
    } finally {
      setReadyingUp(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading match...</p>
        </div>
      </div>
    );
  }

  if (!match || !opponent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="p-8 text-center">
          <p className="text-slate-600 mb-4">No match found</p>
          <Button onClick={() => router.push(`/app/tournaments/${tournamentId}`)}>
            Return to Tournament
          </Button>
        </Card>
      </div>
    );
  }

  const isExpired = timeRemaining === 0;
  const bothReady = isReady && opponentReady;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Tournament Match</h1>
          <p className="text-slate-600">Round {match.round} - Match {match.match_number}</p>
        </div>

        <div className="flex items-center justify-center gap-8 mb-8">
          <div className="text-center">
            <Avatar className="h-24 w-24 mx-auto mb-3 border-4 border-blue-500">
              <AvatarImage src={currentUserId === match.player1_id ? undefined : opponent.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {currentUserId === match.player1_id ? 'You' : opponent.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="font-semibold text-slate-900">You</p>
            {isReady && (
              <div className="flex items-center justify-center gap-1 text-green-600 mt-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Ready</span>
              </div>
            )}
          </div>

          <div className="text-2xl sm:text-4xl font-bold text-slate-400">VS</div>

          <div className="text-center">
            <Avatar className="h-24 w-24 mx-auto mb-3 border-4 border-slate-300">
              <AvatarImage src={opponent.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {opponent.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="font-semibold text-slate-900">{opponent.username}</p>
            {opponentReady && (
              <div className="flex items-center justify-center gap-1 text-green-600 mt-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Ready</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-slate-600" />
            <span className="text-slate-600 font-medium">Time Remaining</span>
          </div>
          <div
            className={`text-3xl sm:text-5xl font-bold text-center ${
              timeRemaining < 30 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {formatTime(timeRemaining)}
          </div>
          {isExpired && !isReady && (
            <p className="text-center text-red-600 text-sm mt-2">Auto-readying up...</p>
          )}

          <div className="mt-4 pt-4 border-t border-slate-300">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">Players Ready</p>
              <p className={`text-3xl font-bold ${
                bothReady ? 'text-green-600' : 'text-slate-700'
              }`}>
                {(isReady ? 1 : 0) + (opponentReady ? 1 : 0)}/2
              </p>
            </div>
          </div>
        </div>

        {bothReady ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-lg font-semibold">Both players ready!</p>
            </div>
            <p className="text-slate-600">Starting match...</p>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mt-4" />
          </div>
        ) : isReady ? (
          <div className="text-center">
            <p className="text-lg text-slate-700 mb-2">You are ready!</p>
            <p className="text-slate-600">Waiting for opponent to ready up...</p>
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mt-4" />
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full text-lg py-4 sm:py-6"
            onClick={() => handleReadyUp()}
            disabled={readyingUp}
          >
            {readyingUp ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Readying Up...
              </>
            ) : (
              'Ready Up'
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          className="w-full mt-4"
          onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
        >
          Return to Tournament
        </Button>
      </Card>
    </div>
  );
}
