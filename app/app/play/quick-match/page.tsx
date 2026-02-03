'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  Users,
  ArrowLeft,
  Play,
  Trophy,
  Loader2,
  Clock,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { requireUser } from '@/lib/supabase/auth';
import { toast } from 'sonner';
import { validateMatchRoom, hasAttemptedResume, markResumeAttempted } from '@/lib/utils/match-resume';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';

interface QuickMatchLobby {
  id: string;
  created_by: string;
  status: string;
  game_type: string;
  match_format: string;
  starting_score: number;
  double_out: boolean;
  double_in: boolean;
  player1_id: string;
  player2_id: string | null;
  match_id: string | null;
  created_at: string;
  player1?: {
    username: string;
    avatar_url?: string;
    trust_rating_letter?: string;
    trust_rating_count?: number;
  };
}

export default function QuickMatchLobbyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  const [filterMode, setFilterMode] = useState('all');
  const [filterFormat, setFilterFormat] = useState('all');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [lobbies, setLobbies] = useState<QuickMatchLobby[]>([]);
  const [myLobby, setMyLobby] = useState<QuickMatchLobby | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const [realtimeStatus, setRealtimeStatus] = useState<string>('disconnected');
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<{ type: string; lobbyId: string } | null>(null);

  useEffect(() => {
    initializeAndSubscribe();
  }, []);

  useEffect(() => {
    async function handleResume() {
      // Only attempt resume once per session
      if (hasAttemptedResume()) {
        return;
      }

      if (myLobby?.match_id && myLobby.status === 'in_progress' && userId) {
        console.log('[QUICK_MATCH_RESUME] Checking match room:', myLobby.match_id);
        markResumeAttempted();

        // Validate the room before redirecting
        const validation = await validateMatchRoom(myLobby.match_id, userId);

        if (validation.shouldRedirect && validation.path) {
          console.log('[QUICK_MATCH_RESUME] Redirecting to validated room:', validation.path);
          router.push(validation.path);
        } else {
          console.log('[QUICK_MATCH_RESUME] Room validation failed, staying on lobby page');
        }
      }
    }

    handleResume();
  }, [myLobby, userId, router]);

  async function initializeAndSubscribe() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Load lobbies
      await fetchLobbies();

      // Subscribe to realtime changes
      const channel = supabase
        .channel('quick_match_lobbies_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby inserted:', payload.new);
            const newLobby = payload.new as QuickMatchLobby;
            setLastRealtimeEvent({ type: 'INSERT', lobbyId: newLobby.id });
            if (newLobby.status === 'open') {
              setLobbies((prev) => {
                if (prev.some(l => l.id === newLobby.id)) return prev;
                return [newLobby, ...prev];
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby updated:', payload.new);
            const updatedLobby = payload.new as QuickMatchLobby;
            setLastRealtimeEvent({ type: 'UPDATE', lobbyId: updatedLobby.id });

            setLobbies((prev) => {
              if (updatedLobby.status !== 'open') {
                // Remove if no longer open
                return prev.filter(l => l.id !== updatedLobby.id);
              }
              // Update existing
              return prev.map(l => l.id === updatedLobby.id ? updatedLobby : l);
            });

            // Check if this is MY lobby (I created it)
            if (updatedLobby.created_by === user.id) {
              console.log('[REALTIME] Creator realtime lobby update received', updatedLobby);

              if (updatedLobby.status === 'in_progress' && updatedLobby.match_id) {
                console.log('[REALTIME] Redirecting creator to match', updatedLobby.match_id);
                toast.success('Match starting!');
                router.push(`/app/play/quick-match/match/${updatedLobby.match_id}`);
              } else if (updatedLobby.status === 'cancelled') {
                setMyLobby(null);
                toast.info('Lobby was cancelled');
              } else {
                setMyLobby(updatedLobby);
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby deleted:', payload.old);
            const deletedId = (payload.old as any).id;
            setLastRealtimeEvent({ type: 'DELETE', lobbyId: deletedId });
            setLobbies((prev) => prev.filter(l => l.id !== deletedId));
          }
        )
        .subscribe((status) => {
          console.log('[REALTIME] Subscription status:', status);
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        });

      return () => {
        channel.unsubscribe();
      };
    } catch (error: any) {
      console.error('[ERROR] Initialization failed:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLobbies() {
    try {
      console.log('[FETCH] Loading lobbies...');
      setFetchError(null);

      // Fetch open lobbies with host profile
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('quick_match_lobbies')
        .select(`
          id,
          created_by,
          created_at,
          status,
          game_type,
          match_format,
          starting_score,
          double_out,
          double_in,
          player1_id,
          player2_id,
          match_id,
          player1:profiles!quick_match_lobbies_player1_id_fkey (
            username,
            avatar_url,
            trust_rating_letter,
            trust_rating_count
          )
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);

      if (lobbiesError) {
        console.error('[FETCH] Error:', lobbiesError);
        const errorMsg = `Failed to load lobbies: ${lobbiesError.message}`;
        setFetchError(errorMsg);
        toast.error(errorMsg);
        setLobbies([]);
        return;
      }

      if (!lobbiesData || lobbiesData.length === 0) {
        console.log('[FETCH] No lobbies found');
        setLobbies([]);
        return;
      }

      console.log('[FETCH] Loaded lobbies with hosts:', lobbiesData.length);

      // Transform the data to ensure player1 is a single object, not an array
      const transformedLobbies = lobbiesData.map(lobby => ({
        ...lobby,
        player1: Array.isArray(lobby.player1) ? lobby.player1[0] : lobby.player1
      }));

      setLobbies(transformedLobbies as QuickMatchLobby[]);

      const myOpenLobby = transformedLobbies.find(l => l.created_by === userId && l.status === 'open');
      if (myOpenLobby) {
        setMyLobby(myOpenLobby as QuickMatchLobby);
      }
    } catch (error: any) {
      console.error('[FETCH] Exception:', error);
      const errorMsg = `Error loading lobbies: ${error.message}`;
      setFetchError(errorMsg);
      toast.error(errorMsg);
      setLobbies([]);
    }
  }

  async function createLobby() {
    if (creating) return;

    setCreating(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error('You must be signed in to create a lobby');
        router.push('/login');
        return;
      }

      const lobbyData = {
        game_type: gameMode,
        starting_score: parseInt(gameMode),
        match_format: matchFormat,
        double_out: doubleOut,
        status: 'open',
      };

      console.log('[CREATE] INSERTING_TO_SUPABASE', { table: 'quick_match_lobbies', payload: lobbyData });

      const { data, error } = await supabase
        .from('quick_match_lobbies')
        .insert(lobbyData)
        .select()
        .maybeSingle();

      if (error) {
        console.error('SUPABASE_INSERT_ERROR', {
          table: 'quick_match_lobbies',
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('[CREATE] Lobby created:', data.id);

      // Fetch host profile for the new lobby
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      const lobbyWithHost = {
        ...data,
        player1: profile || {
          username: 'You',
        },
      };

      setMyLobby(lobbyWithHost);
      toast.success('Lobby created! Waiting for opponent...');
    } catch (error: any) {
      console.error('[CREATE] Failed:', error);
      toast.error(`Failed to create lobby: ${error.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function joinLobby(lobbyId: string) {
    if (!userId || joining) return;

    setJoining(lobbyId);

    try {
      console.log('[JOIN] Attempting to join lobby:', lobbyId, 'as user:', userId);

      // First, get the lobby details
      const { data: lobby, error: fetchError } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobbyId)
        .maybeSingle();

      if (fetchError) {
        console.error('[JOIN] Fetch error:', {
          lobbyId,
          error: fetchError,
          message: fetchError.message,
          details: fetchError.details,
          hint: fetchError.hint,
          code: fetchError.code
        });
        throw new Error(`Failed to fetch lobby: ${fetchError.message}`);
      }

      if (!lobby) {
        console.error('[JOIN] No lobby data returned for lobbyId:', lobbyId);
        throw new Error('Lobby not found');
      }

      // Check if lobby is already full
      if (lobby.player2_id) {
        throw new Error('Match full - lobby already has two players');
      }

      if (lobby.status !== 'open') {
        throw new Error('Lobby is no longer available');
      }

      // Claim the lobby by updating player2_id and status
      const { data: updatedLobby, error: updateError } = await supabase
        .from('quick_match_lobbies')
        .update({
          player2_id: userId,
          status: 'in_progress'
        })
        .eq('id', lobbyId)
        .is('player2_id', null)
        .eq('status', 'open')
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('[JOIN] Update error:', {
          lobbyId,
          error: updateError,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        });
        if (updateError.code === 'PGRST116') {
          throw new Error('Lobby already filled or no longer available');
        }
        throw new Error(`Failed to claim lobby: ${updateError.message}`);
      }

      if (!updatedLobby) {
        console.error('[JOIN] No updated lobby data returned for lobbyId:', lobbyId);
        throw new Error('Lobby no longer available');
      }

      console.log('[JOIN] Lobby claimed, creating match room...');

      // Parse match_format to calculate legs_to_win
      const bestOfMatch = updatedLobby.match_format.match(/best-of-(\d+)/i);
      const bestOf = bestOfMatch ? parseInt(bestOfMatch[1]) : 3;
      const legsToWin = Math.ceil(bestOf / 2);

      // Use starting_score for game_mode
      const gameMode = updatedLobby.starting_score;

      const roomPayload = {
        lobby_id: lobbyId,
        player1_id: updatedLobby.player1_id,
        player2_id: userId,
        game_mode: gameMode,
        status: 'active',
        current_leg: 1,
        legs_to_win: legsToWin,
        match_format: updatedLobby.match_format,
        player1_remaining: gameMode,
        player2_remaining: gameMode,
        current_turn: updatedLobby.player1_id,
      };

      console.log('[JOIN] Inserting match room with payload:', roomPayload);

      // Create the match room
      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .insert(roomPayload)
        .select()
        .maybeSingle();

      if (roomError) {
        console.error('[JOIN] Room creation error:', {
          lobbyId,
          error: roomError,
          message: roomError.message,
          details: roomError.details,
          hint: roomError.hint,
          code: roomError.code
        });
        // Rollback: release the lobby
        await supabase
          .from('quick_match_lobbies')
          .update({ player2_id: null, status: 'open' })
          .eq('id', lobbyId);
        throw new Error(`Failed to create match room: ${roomError.message}`);
      }

      if (!room) {
        console.error('[JOIN] No room data returned after insert');
        // Rollback: release the lobby
        await supabase
          .from('quick_match_lobbies')
          .update({ player2_id: null, status: 'open' })
          .eq('id', lobbyId);
        throw new Error('Failed to create match room');
      }

      // Link lobby to the room
      await supabase
        .from('quick_match_lobbies')
        .update({
          match_id: room.id
        })
        .eq('id', lobbyId);

      console.log('[JOIN] Successfully joined! Room ID:', room.id);
      toast.success('Match starting!');

      router.push(`/app/play/quick-match/match/${room.id}`);
    } catch (error: any) {
      console.error('[JOIN] Failed:', error);
      toast.error(`Failed to join: ${error.message}`);
      setJoining(null);
    }
  }

  async function cancelLobby() {
    if (!myLobby) return;

    try {
      console.log('[CANCEL] Cancelling lobby:', myLobby.id);

      const { error } = await supabase
        .from('quick_match_lobbies')
        .delete()
        .eq('id', myLobby.id)
        .eq('player1_id', userId);

      if (error) {
        console.error('[CANCEL] Delete error:', error);
        throw error;
      }

      setMyLobby(null);
      toast.info('Lobby cancelled');
    } catch (error: any) {
      console.error('[CANCEL] Failed:', error);
      toast.error(`Failed to cancel: ${error.message}`);
    }
  }

  const filteredLobbies = lobbies.filter((lobby) => {
    if (lobby.created_by === userId) return false;
    if (filterMode !== 'all' && lobby.game_type.toString() !== filterMode)
      return false;
    if (filterFormat !== 'all' && lobby.match_format !== filterFormat)
      return false;
    return true;
  });

  const totalOpenLobbies = lobbies.filter(l => l.created_by !== userId).length;
  const isFilterActive = filterMode !== 'all' || filterFormat !== 'all';
  const hiddenByFilter = totalOpenLobbies - filteredLobbies.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2">
          Quick Match Route: /play/quick-match
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/app/play">
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold text-white mb-1">
              Quick Match
            </h1>
            <p className="text-gray-400">
              Create or join an online match
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 text-emerald-400"
        >
          <Users className="w-3 h-3 mr-1" />
          {filteredLobbies.length} Games Available
          {isFilterActive && totalOpenLobbies > filteredLobbies.length && (
            <span className="ml-1 text-gray-400 text-xs">(Filters active)</span>
          )}
        </Badge>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-slate-900/50 backdrop-blur-sm border-yellow-500/30 p-4">
          <h3 className="text-sm font-bold text-yellow-400 mb-3">Online Debug</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-gray-500 mb-1">Origin</p>
              <p className="text-white font-mono">{typeof window !== 'undefined' ? window.location.origin : 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Supabase Host</p>
              <p className="text-white font-mono">
                {process.env.NEXT_PUBLIC_SUPABASE_URL
                  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
                  : 'NOT SET'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Open Lobbies Count</p>
              <p className="text-white font-mono">{totalOpenLobbies}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-1">Realtime Status</p>
              <p className={`font-mono ${realtimeStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
                {realtimeStatus}
              </p>
            </div>
            {lastRealtimeEvent && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-1">Last Realtime Event</p>
                <p className="text-white font-mono">
                  {lastRealtimeEvent.type} - {lastRealtimeEvent.lobbyId.slice(0, 8)}...
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 lg:col-span-1">
          <div className="flex items-center space-x-2 mb-6">
            <Play className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">
              {myLobby ? 'Your Lobby' : 'Create Match'}
            </h2>
          </div>

          {myLobby ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <p className="text-sm text-emerald-400 font-medium">
                    Waiting for opponent...
                  </p>
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Game: {myLobby.game_type}</p>
                  <p>Format: {myLobby.match_format}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={cancelLobby}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel Lobby
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-gray-300">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Match Format</Label>
                <Select
                  value={matchFormat}
                  onValueChange={setMatchFormat}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="best-of-1">Best of 1</SelectItem>
                    <SelectItem value="best-of-3">Best of 3</SelectItem>
                    <SelectItem value="best-of-5">Best of 5</SelectItem>
                    <SelectItem value="best-of-7">Best of 7</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
                onClick={createLobby}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Create Lobby
              </Button>
            </div>
          )}
        </Card>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">
                Open Lobbies
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                <SelectValue placeholder="Game Mode" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="301">301</SelectItem>
                <SelectItem value="501">501</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterFormat} onValueChange={setFilterFormat}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="all">All Formats</SelectItem>
                <SelectItem value="best-of-1">Best of 1</SelectItem>
                <SelectItem value="best-of-3">Best of 3</SelectItem>
                <SelectItem value="best-of-5">Best of 5</SelectItem>
                <SelectItem value="best-of-7">Best of 7</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {fetchError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{fetchError}</p>
            </div>
          )}

          {hiddenByFilter > 0 && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-blue-400 text-sm">
                {hiddenByFilter} {hiddenByFilter === 1 ? 'lobby is' : 'lobbies are'} hidden by your filters
                {filterMode !== 'all' && ` (${filterMode})`}
                {filterFormat !== 'all' && ` (${filterFormat})`}
              </p>
            </div>
          )}

          <ScrollArea className="h-[600px] pr-4">
            {filteredLobbies.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-gray-400 mb-2">
                  {totalOpenLobbies > 0 && isFilterActive
                    ? 'No lobbies match your filters'
                    : 'No open lobbies available'}
                </p>
                <p className="text-gray-500 text-sm">
                  {totalOpenLobbies > 0 && isFilterActive
                    ? 'Try adjusting your filters'
                    : 'Create a lobby to get started'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLobbies.map((lobby) => (
                  <div
                    key={lobby.id}
                    className="p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-white font-semibold">
                            {lobby.player1?.username ?? 'Player'}
                          </h3>
                          <TrustRatingBadge
                            letter={lobby.player1?.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E' | null}
                            count={lobby.player1?.trust_rating_count || 0}
                            showTooltip={false}
                          />
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
                            {lobby.game_type}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-400 space-y-1">
                          <p>{lobby.match_format}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => joinLobby(lobby.id)}
                        disabled={joining === lobby.id}
                        className="bg-emerald-500 hover:bg-emerald-600"
                      >
                        {joining === lobby.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Join'
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
