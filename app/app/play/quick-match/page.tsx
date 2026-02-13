'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  UserPlus,
  Camera,
  CameraOff,
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
    overall_3dart_avg?: number;
  };
}

interface JoinRequest {
  id: string;
  lobby_id: string;
  requester_id: string;
  requester_username: string;
  requester_avatar_url?: string;
  requester_3dart_avg?: number;
  requester_has_camera?: boolean;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
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

  // Join request state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [currentJoinRequest, setCurrentJoinRequest] = useState<JoinRequest | null>(null);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [pendingLobbyId, setPendingLobbyId] = useState<string | null>(null);
  
  // User stats for displaying in own lobby
  const [userStats, setUserStats] = useState<{ overall_3dart_avg?: number } | null>(null);

  const resumeAttemptedRef = useRef(false);
  const joinRequestSubscriptionRef = useRef<any>(null);

  useEffect(() => {
    initializeAndSubscribe();
  }, []);

  // Fetch pending join requests for the current lobby
  const fetchPendingRequestsForLobby = useCallback(async (lobbyId: string) => {
    console.log('[JOIN REQUEST] Fetching pending requests for lobby:', lobbyId);
    const { data: requests, error } = await supabase
      .from('quick_match_join_requests')
      .select('*')
      .eq('lobby_id', lobbyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('[JOIN REQUEST] Error fetching pending requests:', error);
      return;
    }
    
    console.log('[JOIN REQUEST] Fetch result:', { count: requests?.length || 0, requests });
    
    if (requests && requests.length > 0) {
      console.log('[JOIN REQUEST] Found pending request:', requests[0]);
      setCurrentJoinRequest(requests[0] as JoinRequest);
      setShowJoinRequestModal(true);
    }
  }, []);

  // Setup join request subscription when myLobby changes
  useEffect(() => {
    if (!myLobby || !userId) {
      console.log('[JOIN REQUEST] Skipping subscription - no lobby or userId', { myLobby, userId });
      return;
    }
    
    // Only subscribe if I'm the creator
    if (myLobby.created_by !== userId) {
      console.log('[JOIN REQUEST] Skipping subscription - not creator', { 
        created_by: myLobby.created_by, 
        userId 
      });
      return;
    }

    console.log('[JOIN REQUEST] Setting up subscription for lobby:', myLobby.id);

    // Fetch any existing pending join requests
    fetchPendingRequestsForLobby(myLobby.id);

    console.log('[JOIN REQUEST] Creating realtime subscription...');
    const joinRequestChannel = supabase
      .channel(`join_requests_${myLobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quick_match_join_requests',
          filter: `lobby_id=eq.${myLobby.id}`,
        },
        (payload) => {
          console.log('[REALTIME] Join request received:', payload.new);
          const newRequest = payload.new as JoinRequest;
          
          if (newRequest.status === 'pending') {
            console.log('[REALTIME] Showing join request modal for:', newRequest.requester_username);
            setCurrentJoinRequest(newRequest);
            setShowJoinRequestModal(true);
          }
        }
      )
      .subscribe((status) => {
        console.log('[JOIN REQUEST] Subscription status:', status);
      });

    joinRequestSubscriptionRef.current = joinRequestChannel;

    // Fallback: Poll every 3 seconds for new requests (in case realtime fails)
    const pollInterval = setInterval(() => {
      // Only poll if modal is not already showing
      if (!showJoinRequestModal && !currentJoinRequest) {
        fetchPendingRequestsForLobby(myLobby.id);
      }
    }, 3000);

    return () => {
      console.log('[JOIN REQUEST] Cleaning up subscription');
      joinRequestChannel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [myLobby?.id, userId, showJoinRequestModal, currentJoinRequest, fetchPendingRequestsForLobby]);

  useEffect(() => {
    async function handleResume() {
      // Only attempt resume once - use useRef guard + session storage check
      if (resumeAttemptedRef.current || hasAttemptedResume()) {
        return;
      }

      if (myLobby?.match_id && myLobby.status === 'in_progress' && userId) {
        console.log('[QUICK_MATCH_RESUME] Checking match room:', myLobby.match_id);
        resumeAttemptedRef.current = true;
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
            
            // Check if I joined as player 2 and match was cancelled
            if (updatedLobby.player2_id === user.id && updatedLobby.status === 'cancelled') {
              console.log('[REALTIME] Match was cancelled, player 2 notified');
              setPendingLobbyId(null);
              setJoining(null);
              toast.error('Match was cancelled by host');
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

      // Fetch open lobbies with host profile and stats
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

      // Fetch player stats separately for each lobby host
      let hostStats: Record<string, number> = {};
      if (lobbiesData && lobbiesData.length > 0) {
        const hostIds = lobbiesData.map(l => l.player1_id).filter(Boolean);
        console.log('[FETCH] Fetching stats for host IDs:', hostIds);
        const { data: statsData, error: statsError } = await supabase
          .from('player_stats')
          .select('user_id, overall_3dart_avg')
          .in('user_id', hostIds);
        
        if (statsError) {
          console.error('[FETCH] Error fetching stats:', statsError);
        }
        
        if (statsData) {
          console.log('[FETCH] Stats data received:', statsData);
          hostStats = statsData.reduce((acc, stat) => {
            acc[stat.user_id] = stat.overall_3dart_avg || 0;
            return acc;
          }, {} as Record<string, number>);
        }
      }

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
      console.log('[FETCH] Host stats:', hostStats);

      // Transform the data to ensure player1 is a single object, not an array
      // and include the 3-dart average from player_stats
      const transformedLobbies = lobbiesData.map(lobby => {
        const avg = hostStats[lobby.player1_id] || 0;
        console.log(`[FETCH] Lobby ${lobby.id}: host ${lobby.player1_id}, avg: ${avg}`);
        return {
          ...lobby,
          player1: {
            ...(Array.isArray(lobby.player1) ? lobby.player1[0] : lobby.player1),
            overall_3dart_avg: avg
          }
        };
      });

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
        .select('username, avatar_url, trust_rating_letter, trust_rating_count')
        .eq('user_id', user.id)
        .maybeSingle();

      // Fetch host stats (3-dart average)
      const { data: stats } = await supabase
        .from('player_stats')
        .select('overall_3dart_avg')
        .eq('user_id', user.id)
        .maybeSingle();

      const lobbyWithHost = {
        ...data,
        player1: {
          ...(profile || { username: 'You' }),
          overall_3dart_avg: stats?.overall_3dart_avg || 0,
        },
      };

      setUserStats(stats || { overall_3dart_avg: 0 });
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
      console.log('[JOIN] Sending join request for lobby:', lobbyId, 'as user:', userId);

      // Get current user profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();

      // Get user's 3-dart average
      const { data: userStats } = await supabase
        .from('player_stats')
        .select('overall_3dart_avg')
        .eq('user_id', userId)
        .maybeSingle();

      // Check if user has camera available (like DartCounter)
      let hasCamera = false;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        hasCamera = videoDevices.length > 0;
        console.log('[JOIN] Camera detection:', { hasCamera, deviceCount: videoDevices.length });
      } catch (e) {
        console.log('[JOIN] Camera detection failed:', e);
        // Continue without camera - not a blocking error
      }

      // Create a join request instead of directly joining
      const { data: request, error: requestError } = await supabase
        .from('quick_match_join_requests')
        .insert({
          lobby_id: lobbyId,
          requester_id: userId,
          requester_username: userProfile?.username || 'Unknown',
          requester_avatar_url: userProfile?.avatar_url,
          requester_3dart_avg: userStats?.overall_3dart_avg || 0,
          requester_has_camera: hasCamera,
          status: 'pending'
        })
        .select()
        .maybeSingle();

      if (requestError) {
        console.error('[JOIN] Request error:', requestError);
        throw new Error(`Failed to send join request: ${requestError.message}`);
      }

      setPendingLobbyId(lobbyId);
      toast.success('Join request sent! Waiting for host approval...');

      // Poll for request status
      pollJoinRequestStatus(request.id);
    } catch (error: any) {
      console.error('[JOIN] Failed:', error);
      toast.error(`Failed to join: ${error.message}`);
      setJoining(null);
    }
  }

  async function pollJoinRequestStatus(requestId: string) {
    const checkInterval = setInterval(async () => {
      const { data: request } = await supabase
        .from('quick_match_join_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (!request) {
        clearInterval(checkInterval);
        setJoining(null);
        setPendingLobbyId(null);
        return;
      }

      if (request.status === 'accepted') {
        clearInterval(checkInterval);
        // Request accepted - proceed to match
        if (request.match_id) {
          toast.success('Join request accepted! Match starting...');
          router.push(`/app/play/quick-match/match/${request.match_id}`);
        }
      } else if (request.status === 'declined') {
        clearInterval(checkInterval);
        setJoining(null);
        setPendingLobbyId(null);
        toast.error('Join request was declined by the host');
      }
    }, 1000);

    // Timeout after 60 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (pendingLobbyId) {
        setJoining(null);
        setPendingLobbyId(null);
        toast.error('Join request timed out');
      }
    }, 60000);
  }

  async function handleAcceptJoinRequest(request: JoinRequest) {
    if (!myLobby || processingRequest) return;

    setProcessingRequest(true);

    try {
      console.log('[ACCEPT] Accepting join request:', request.id);

      // Parse match_format to calculate legs_to_win
      const bestOfMatch = myLobby.match_format.match(/best-of-(\d+)/i);
      const bestOf = bestOfMatch ? parseInt(bestOfMatch[1]) : 3;
      const legsToWin = Math.ceil(bestOf / 2);
      const gameMode = myLobby.starting_score;

      // Create the match room first
      const roomPayload = {
        lobby_id: myLobby.id,
        player1_id: myLobby.player1_id,
        player2_id: request.requester_id,
        game_mode: gameMode,
        status: 'active',
        current_leg: 1,
        legs_to_win: legsToWin,
        match_format: myLobby.match_format,
        player1_remaining: gameMode,
        player2_remaining: gameMode,
        current_turn: myLobby.player1_id,
      };

      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .insert(roomPayload)
        .select()
        .maybeSingle();

      if (roomError || !room) {
        throw new Error('Failed to create match room');
      }

      // Update the join request with match_id and accepted status
      await supabase
        .from('quick_match_join_requests')
        .update({ 
          status: 'accepted',
          match_id: room.id
        })
        .eq('id', request.id);

      // Update the lobby
      await supabase
        .from('quick_match_lobbies')
        .update({
          player2_id: request.requester_id,
          status: 'in_progress',
          match_id: room.id
        })
        .eq('id', myLobby.id);

      // Decline all other pending requests for this lobby
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('lobby_id', myLobby.id)
        .eq('status', 'pending')
        .neq('id', request.id);

      setShowJoinRequestModal(false);
      setCurrentJoinRequest(null);
      toast.success('Match starting!');
      router.push(`/app/play/quick-match/match/${room.id}`);
    } catch (error: any) {
      console.error('[ACCEPT] Failed:', error);
      toast.error(`Failed to accept: ${error.message}`);
      setProcessingRequest(false);
    }
  }

  async function handleDeclineJoinRequest(request: JoinRequest) {
    if (processingRequest) return;

    setProcessingRequest(true);

    try {
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);

      // Remove from local state
      setJoinRequests(prev => prev.filter(r => r.id !== request.id));
      setShowJoinRequestModal(false);
      setCurrentJoinRequest(null);
      toast.info('Join request declined');
    } catch (error: any) {
      console.error('[DECLINE] Failed:', error);
      toast.error(`Failed to decline: ${error.message}`);
    } finally {
      setProcessingRequest(false);
    }
  }

  async function cancelLobby() {
    if (!myLobby || !userId) return;

    try {
      console.log('[CANCEL] Cancelling lobby:', myLobby.id);

      // Delete the lobby - use created_by to verify ownership
      const { error } = await supabase
        .from('quick_match_lobbies')
        .delete()
        .eq('id', myLobby.id)
        .eq('created_by', userId);

      if (error) {
        console.error('[CANCEL] Delete error:', error);
        throw error;
      }

      // Immediately update local state (don't wait for realtime)
      setMyLobby(null);
      setLobbies((prev) => prev.filter(l => l.id !== myLobby.id));
      
      toast.info('Lobby cancelled');
      console.log('[CANCEL] Lobby deleted successfully');
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

  const formatMatchFormat = (format: string): string => {
    const match = format.match(/best-of-(\d+)/i);
    if (match) {
      return `Best of ${match[1]}`;
    }
    return format;
  };

  const getGameModeClass = (mode: string): string => {
    if (mode === '301') return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    if (mode === '501') return 'bg-green-600/20 text-green-400 border-green-500/30';
    return 'bg-slate-600/20 text-slate-400 border-slate-500/30';
  };

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
                  {(userStats?.overall_3dart_avg || myLobby.player1?.overall_3dart_avg) ? (
                    <div className="flex items-center gap-1 pt-1">
                      <Target className="w-3 h-3 text-blue-400" />
                      <span className="text-blue-400">
                        Your 3-Dart Avg: {(userStats?.overall_3dart_avg || myLobby.player1?.overall_3dart_avg || 0).toFixed(1)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              
              {/* Join Request Status */}
              {currentJoinRequest ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                    <span className="text-sm text-amber-400">
                      {currentJoinRequest.requester_username} wants to join
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-gray-500 text-center">
                    No join requests yet. Waiting for players...
                  </p>
                </div>
              )}
              
              {/* Manual Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-white/10 text-gray-400 hover:text-white"
                onClick={() => {
                  if (myLobby) {
                    fetchPendingRequestsForLobby(myLobby.id);
                    toast.info('Checking for join requests...');
                  }
                }}
              >
                <Loader2 className="w-4 h-4 mr-2" />
                Check for Requests
              </Button>
              
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
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-white font-semibold">
                            {lobby.player1?.username ?? 'Player'}
                          </h3>
                          <TrustRatingBadge
                            letter={lobby.player1?.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E' | null}
                            count={lobby.player1?.trust_rating_count || 0}
                            showTooltip={false}
                          />
                          {/* Always show 3-dart average */}
                          <Badge 
                            className={`text-xs px-2 py-0.5 rounded-full border ${
                              (lobby.player1?.overall_3dart_avg || 0) > 0
                                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                                : 'bg-gray-600/20 text-gray-400 border-gray-500/30'
                            }`}
                            title="3-Dart Average"
                          >
                            <Target className="w-3 h-3 mr-1" />
                            {(lobby.player1?.overall_3dart_avg || 0) > 0
                              ? `${(lobby.player1?.overall_3dart_avg || 0).toFixed(1)} avg`
                              : 'New'
                            }
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={`${getGameModeClass(lobby.game_type)} text-base font-bold px-3 py-1 rounded-full border`}
                          >
                            {lobby.game_type}
                          </Badge>
                          <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-base font-bold px-3 py-1 rounded-full border">
                            {formatMatchFormat(lobby.match_format)}
                          </Badge>
                          <Badge
                            className={`${lobby.double_out
                              ? 'bg-green-600/20 text-green-400 border-green-500/30'
                              : 'bg-slate-600/20 text-slate-400 border-slate-500/30'
                            } text-xs px-2 py-0.5 rounded-full border`}
                          >
                            Double Out: {lobby.double_out ? 'ON' : 'OFF'}
                          </Badge>
                          {!lobby.double_in && (
                            <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-xs px-2 py-0.5 rounded-full border">
                              Straight In
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => joinLobby(lobby.id)}
                        disabled={joining === lobby.id}
                        className="bg-emerald-500 hover:bg-emerald-600 shrink-0"
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

      {/* Join Request Modal - Shows when someone wants to join your lobby */}
      {showJoinRequestModal && currentJoinRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowJoinRequestModal(false);
                  // Check for more requests after a short delay
                  setTimeout(() => {
                    if (myLobby) {
                      fetchPendingRequestsForLobby(myLobby.id);
                    }
                  }, 500);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                Join Request
              </h2>
              <p className="text-gray-400">
                {currentJoinRequest.requester_username} wants to join your match
              </p>
            </div>

            <div className="bg-white/5 rounded-lg p-4 mb-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Player</span>
                <span className="text-white font-semibold">{currentJoinRequest.requester_username}</span>
              </div>
              {currentJoinRequest.requester_3dart_avg !== undefined && currentJoinRequest.requester_3dart_avg > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">3-Dart Average</span>
                  <Badge className="bg-blue-600/20 text-blue-400 border-blue-500/30">
                    <Target className="w-3 h-3 mr-1" />
                    {currentJoinRequest.requester_3dart_avg.toFixed(1)}
                  </Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Camera</span>
                {currentJoinRequest.requester_has_camera ? (
                  <Badge className="bg-green-600/20 text-green-400 border-green-500/30">
                    <Camera className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-gray-600/20 text-gray-400 border-gray-500/30">
                    <CameraOff className="w-3 h-3 mr-1" />
                    No Camera
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => handleDeclineJoinRequest(currentJoinRequest)}
                disabled={processingRequest}
              >
                {processingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decline'}
              </Button>
              <Button
                className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                onClick={() => handleAcceptJoinRequest(currentJoinRequest)}
                disabled={processingRequest}
              >
                {processingRequest ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Join Request Indicator */}
      {pendingLobbyId && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900 border border-emerald-500/30 rounded-lg px-6 py-4 shadow-2xl z-40">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="text-white">Waiting for host approval...</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingLobbyId(null);
                setJoining(null);
              }}
              className="text-gray-400 hover:text-white ml-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
