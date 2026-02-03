'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Target, Undo2, Trophy, TrendingUp, Zap, RotateCcw, Chrome as Home, X, Check, LogOut, Wifi, WifiOff, UserPlus, Video, VideoOff, Mic, MicOff, PhoneOff, Edit } from 'lucide-react';
import { getCheckoutOptions } from '@/lib/match-logic';
import { toast } from 'sonner';
import { mapRoomToMatchState, type MappedMatchState } from '@/lib/match/mapRoomToMatchState';
import EditVisitModal from '@/components/app/EditVisitModal';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
}

interface MatchRoom {
  id: string;
  player1_id: string;
  player2_id: string;
  game_mode: number;
  match_format: string;
  match_type: string;
  status: string;
  current_leg: number;
  legs_to_win: number;
  player1_remaining: number;
  player2_remaining: number;
  current_turn: string;
  winner_id: string | null;
  summary: {
    player1_legs?: number;
    player2_legs?: number;
  };
}

interface Profile {
  user_id: string;
  username: string;
}

interface MatchEvent {
  id: string;
  player_id: string;
  seq: number;
  event_type: string;
  payload: {
    score: number;
    remaining: number;
    is_bust: boolean;
    is_checkout: boolean;
    leg: number;
  };
  created_at: string;
}

export default function QuickMatchRoomPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const supabase = createClient();

  const [room, setRoom] = useState<MatchRoom | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const matchState = mapRoomToMatchState(room, events, profiles, currentUserId);

  // Compute opponent ID from room
  const opponentId = room && currentUserId
    ? (currentUserId === room.player1_id ? room.player2_id : room.player1_id)
    : null;

  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [dartboardGroup, setDartboardGroup] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');
  const [scoringMode, setScoringMode] = useState<'quick' | 'input'>('quick');
  const [scoreInput, setScoreInput] = useState('');
  const [inputModeError, setInputModeError] = useState<string>('');

  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [showOpponentForfeitModal, setShowOpponentForfeitModal] = useState(false);
  const [didIForfeit, setDidIForfeit] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchDisabled, setRematchDisabled] = useState(false);
  const [rematchData, setRematchData] = useState<any>(null);
  const hasRedirectedRef = { current: false };
  const [rematchCount, setRematchCount] = useState(0);
  const [starting, setStarting] = useState(false);

  const [showEditVisitModal, setShowEditVisitModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<{ id: string; score: number; visitNumber: number } | null>(null);

  // Unified WebRTC hook - works for ALL match formats (BO1, BO3, BO5, BO7)
  // Hook fetches opponent from match_rooms and manages all signaling
  const webrtc = useMatchWebRTC({
    roomId: matchId,
    myUserId: currentUserId,
    isMyTurn: room?.current_turn === currentUserId
  });

  // Destructure for backward compatibility
  const {
    localStream,
    remoteStream,
    isCameraOn,
    isMicMuted,
    isVideoDisabled,
    callStatus,
    cameraError,
    toggleCamera,
    toggleMic,
    toggleVideo,
    stopCamera,
    liveVideoRef
  } = webrtc;

  // Note: Video display and WebRTC setup now handled by useMatchWebRTC hook

  // Cleanup function defined early
  const cleanupMatchRef = useRef<() => void>();

  cleanupMatchRef.current = () => {
    console.log('[CLEANUP] Starting match cleanup');

    // Stop camera and close peer connections
    stopCamera('match cleanup');

    // Clear any cached match context
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`match_context_${matchId}`);
      sessionStorage.removeItem(`lobby_id_${matchId}`);
    }

    console.log('[CLEANUP] Match cleanup complete');
  };

  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    initializeMatch().then((cleanup) => {
      if (cleanup && typeof cleanup === 'function') {
        cleanupFn = cleanup;
      }
    });

    // Cleanup on unmount
    return () => {
      console.log('[LIFECYCLE] Component unmounting, cleaning up');
      if (cleanupMatchRef.current) {
        cleanupMatchRef.current();
      }
      if (cleanupFn && typeof cleanupFn === 'function') {
        cleanupFn();
      }
    };
  }, [matchId]);

  // Debug logging for ID tracking and current_turn changes
  useEffect(() => {
    if (room && currentUserId) {
      console.log('[TURN DEBUG] ===== TURN STATE CHANGED =====');
      console.log('[TURN DEBUG] Current state:', {
        myId: currentUserId,
        opponentId,
        current_turn: room.current_turn,
        isMyTurn: room.current_turn === currentUserId,
        player1: room.player1_id,
        player2: room.player2_id
      });
      console.log('[TURN DEBUG] This effect is for LOGGING ONLY, NO cleanup occurs here');
      console.log('[TURN DEBUG] ================================');
    }
  }, [currentUserId, opponentId, room?.current_turn]);

  // Camera controls now handled by useMatchWebRTC hook

  // WebRTC diagnostics now handled by useMatchWebRTC hook

  useEffect(() => {
    if (!matchState) return;

    if (matchState.endedReason === 'forfeit' && !didIForfeit) {
      setShowOpponentForfeitModal(true);
    } else if (matchState.endedReason === 'win') {
      setShowMatchCompleteModal(true);
    }

    // Clean up WebRTC when match ends
    if (matchState.endedReason) {
      stopCamera(`match ended: ${matchState.endedReason}`);
    }
  }, [matchState?.endedReason, didIForfeit]);

  async function initializeMatch() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      await loadMatchData();
      const cleanup = setupRealtimeSubscriptions();

      return cleanup;
    } catch (error: any) {
      console.error('Initialization error:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadMatchData() {
    const { data: roomData, error: roomError } = await supabase
      .from('match_rooms')
      .select('*')
      .eq('id', matchId)
      .single();

    if (roomError) {
      console.error('[MATCH_ROOM_LOAD] Failed to load room:', roomError);
      toast.error(`Failed to load match room: ${roomError.message}`);
      return;
    }

    if (!roomData) {
      console.error('[MATCH_ROOM_LOAD] No room data returned');
      toast.error('Match room not found');
      return;
    }

    setRoom(roomData);

    if (roomData.status === 'finished') {
      setShowMatchCompleteModal(true);
    }

    const playerIds = [roomData.player1_id, roomData.player2_id].filter(Boolean);

    if (playerIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, username')
        .in('user_id', playerIds);

      if (profilesError) {
        console.error('[MATCH_ROOM_LOAD] Failed to load profiles:', profilesError);
        toast.error(`Failed to load player profiles: ${profilesError.message}`);
      } else if (profilesData) {
        setProfiles(profilesData);
      }
    }

    const { data: eventsData } = await supabase
      .from('match_events')
      .select('*')
      .eq('room_id', matchId)
      .order('seq', { ascending: true });

    setEvents(eventsData || []);
  }

  function setupRealtimeSubscriptions() {
    const roomChannel = supabase
      .channel(`room_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_rooms',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[REALTIME] Room updated:', payload.new);
          const updatedRoom = payload.new as MatchRoom;
          setRoom(updatedRoom);

          // Auto-exit if match ended (forfeited or finished)
          if (updatedRoom.status === 'forfeited' || updatedRoom.status === 'finished') {
            console.log('[REALTIME] Match ended, status:', updatedRoom.status);

            // Show appropriate modal first
            if (updatedRoom.status === 'forfeited') {
              // Check if we forfeited or opponent did
              if (!didIForfeit) {
                setShowOpponentForfeitModal(true);
              }
            } else if (updatedRoom.status === 'finished') {
              setShowMatchCompleteModal(true);
            }

            // Cleanup after short delay to allow modal to show
            setTimeout(() => {
              if (!hasRedirectedRef.current && cleanupMatchRef.current) {
                console.log('[REALTIME] Auto-cleanup triggered');
                cleanupMatchRef.current();
              }
            }, 100);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `room_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[REALTIME] Event inserted:', payload.new);
          const newEvent = payload.new as MatchEvent;
          setEvents((prev) => [...prev, newEvent]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_events',
          filter: `room_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[REALTIME] Event updated:', payload.new);
          const updatedEvent = payload.new as MatchEvent;
          setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    const rematchChannel = supabase
      .channel(`rematch_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_rematches',
          filter: `old_room_id=eq.${matchId}`,
        },
        (payload) => {
          const data = payload.new as any;

          console.log('[REMATCH DEBUG] Realtime update received:', {
            old_room_id: data?.old_room_id,
            player1_ready: data?.player1_ready,
            player2_ready: data?.player2_ready,
            new_room_id: data?.new_room_id,
            start_at: data?.start_at,
            event: payload.eventType
          });

          if (data) {
            const readyCount = (data.player1_ready ? 1 : 0) + (data.player2_ready ? 1 : 0);

            console.log('[REMATCH DEBUG] Computed ready count:', readyCount);

            // Update rematch data state - this will update UI
            setRematchData(data);

            // Only redirect when server has created the new room
            if (data.new_room_id && !hasRedirectedRef.current) {
              console.log('[REMATCH DEBUG] New room detected:', data.new_room_id);
              hasRedirectedRef.current = true;

              // Calculate delay from start_at
              let delay = 0;
              if (data.start_at) {
                const startTime = new Date(data.start_at).getTime();
                const now = Date.now();
                delay = Math.max(0, startTime - now);
                console.log('[REMATCH DEBUG] Calculated delay:', delay, 'ms');
              } else {
                console.log('[REMATCH DEBUG] No start_at found, redirecting immediately');
              }

              // Show message and redirect after delay
              if (delay > 0) {
                console.log('[REMATCH DEBUG] Showing countdown toast');
                toast.success(`Both players ready! Starting in ${Math.ceil(delay / 1000)}s...`);
              } else {
                console.log('[REMATCH DEBUG] Showing immediate toast');
                toast.success('Both players ready! Starting rematch...');
              }

              setTimeout(() => {
                console.log('[REMATCH DEBUG] Redirecting to new room:', data.new_room_id);
                router.push(`/app/play/quick-match/match/${data.new_room_id}`);
              }, delay);
            } else if (data.new_room_id) {
              console.log('[REMATCH DEBUG] New room exists but already redirected');
            } else {
              console.log('[REMATCH DEBUG] No new room yet, waiting for server to create it');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(rematchChannel);
    };
  }

  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`rematch:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_rematches",
          filter: `old_room_id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as any;

          const count =
            (row.player1_ready ? 1 : 0) + (row.player2_ready ? 1 : 0);

          setRematchCount(count);

          if (row.new_room_id) {
            setStarting(true);
            setTimeout(() => {
              router.push(`/app/play/quick-match/match/${row.new_room_id}`);
            }, 700);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // WebRTC signaling subscription now handled by useMatchWebRTC hook

  const handleDartClick = (type: 'singles' | 'doubles' | 'triples' | 'bulls', number: number) => {
    if (currentVisit.length >= 3) return;

    let value = 0;
    let dartType: 'single' | 'double' | 'triple' | 'bull';

    if (type === 'singles') {
      value = number;
      dartType = 'single';
    } else if (type === 'doubles') {
      value = number * 2;
      dartType = 'double';
    } else if (type === 'triples') {
      value = number * 3;
      dartType = 'triple';
    } else {
      value = number;
      dartType = 'bull';
    }

    const dart: Dart = { type: dartType, number, value };
    setCurrentVisit([...currentVisit, dart]);
  };

  const handleClearVisit = () => {
    setCurrentVisit([]);
  };

  const handleSubmitVisit = async () => {
    if (!room || !currentUserId || submitting) return;

    const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);

    if (visitTotal === 0 && currentVisit.length === 0) {
      toast.error('Please enter darts or use the Bust button');
      return;
    }

    console.log('[HANDLE_SUBMIT] ===== SUBMIT VISIT CLICKED =====');
    console.log('[HANDLE_SUBMIT] Room ID:', matchId);
    console.log('[HANDLE_SUBMIT] User ID:', currentUserId);
    console.log('[HANDLE_SUBMIT] Visit Total:', visitTotal);
    console.log('[HANDLE_SUBMIT] Darts:', currentVisit);
    console.log('[HANDLE_SUBMIT] ========================');

    await submitScore(visitTotal);
  };

  const handleInputScoreSubmit = async (score: number) => {
    if (!room || !currentUserId || submitting) return;
    await submitScore(score);
  };

  const handleBust = async () => {
    if (!room || !currentUserId || submitting) return;
    console.log('[BUST] ===== BUST CLICKED =====');
    console.log('[BUST] Room ID:', matchId);
    console.log('[BUST] User ID:', currentUserId);
    console.log('[BUST] ========================');
    await submitScore(0);
  };

  async function submitScore(score: number) {
    if (!room || !matchState || !currentUserId) return;

    if (!isMyTurn) {
      toast.error('Not your turn');
      return;
    }

    if (score < 0 || score > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    setSubmitting(true);

    try {
      console.log('[SUBMIT] ===== SUBMIT VISIT =====');
      console.log('[SUBMIT] Room ID:', matchId);
      console.log('[SUBMIT] User ID:', currentUserId);
      console.log('[SUBMIT] Score:', score);
      console.log('[SUBMIT] Match Type:', room.match_type);
      console.log('[SUBMIT] Room Status:', room.status);
      console.log('[SUBMIT] Current Turn:', room.current_turn);
      console.log('[SUBMIT] Is My Turn:', isMyTurn);
      console.log('[SUBMIT] ========================');

      const { data, error } = await supabase.rpc('submit_quick_match_throw', {
        p_room_id: matchId,
        p_score: score,
      });

      if (error) {
        console.error('[SUBMIT] Supabase Error:', error);
        throw error;
      }

      console.log('[SUBMIT] ===== SUCCESS =====');
      console.log('[SUBMIT] Response:', data);
      console.log('[SUBMIT] ========================');

      if (data.is_bust) {
        toast.error('Bust!');
      } else if (data.is_checkout) {
        toast.success('Checkout!');
      }

      if (data.leg_won) {
        toast.success('Leg won!');
      }

      if (data.match_won) {
        console.log('[SUBMIT] Match complete!');
        setShowMatchCompleteModal(true);
      }

      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
    } catch (error: any) {
      console.error('[SUBMIT] Error:', error);
      toast.error(`Failed to submit: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const handleEditVisit = (visit: any) => {
    setEditingVisit({
      id: visit.id,
      score: visit.score,
      visitNumber: visit.turnNumberInLeg,
    });
    setShowEditVisitModal(true);
  };

  const handleSaveEditedVisit = async (newScore: number) => {
    if (!editingVisit) return;

    try {
      console.log('[EDIT VISIT] Calling RPC with event_id:', editingVisit.id, 'new_score:', newScore);

      const { data, error } = await supabase.rpc('rpc_edit_quick_match_visit', {
        p_event_id: editingVisit.id,
        p_new_score: newScore,
      });

      if (error) {
        console.error('[EDIT VISIT] RPC Error:', error);
        throw new Error(error.message || 'Failed to edit visit');
      }

      console.log('[EDIT VISIT] RPC Response:', data);

      // Refresh room state to get updated remaining scores
      const { data: roomData, error: roomError } = await supabase
        .from('match_rooms')
        .select('*')
        .eq('id', matchId)
        .single();

      if (roomError) {
        console.error('[EDIT VISIT] Failed to refresh room:', roomError);
        throw new Error('Failed to refresh match state');
      }

      // Refresh events to get updated data
      const { data: eventsData } = await supabase
        .from('match_events')
        .select('*')
        .eq('room_id', matchId)
        .order('seq', { ascending: true });

      if (roomData) {
        setRoom(roomData);

        // Check if match is now finished
        if (roomData.status === 'finished' && !showMatchCompleteModal) {
          console.log('[EDIT VISIT] Match completed after edit!');
          setShowMatchCompleteModal(true);
        }
      }

      if (eventsData) {
        setEvents(eventsData);

        // Check if the edited visit resulted in a checkout (leg won)
        const editedEvent = eventsData.find((e: any) => e.id === editingVisit.id);
        if (editedEvent && editedEvent.remaining_after === 0) {
          toast.success('Checkout! Leg won!');
        }
      }

      toast.success('Visit updated successfully');

      setShowEditVisitModal(false);
      setEditingVisit(null);
    } catch (error: any) {
      console.error('[EDIT VISIT] Error:', error);
      throw error;
    }
  };

  async function forfeitMatch() {
    if (!room || !matchState) return;

    try {
      setDidIForfeit(true);
      setShowEndMatchDialog(false);

      console.log('[FORFEIT] Calling rpc_forfeit_match for room:', matchId);

      const { data, error } = await supabase.rpc('rpc_forfeit_match', {
        p_room_id: matchId,
      });

      console.log('[FORFEIT] RPC response:', data);

      if (error) {
        console.error('[FORFEIT] RPC error:', error);
        throw error;
      }

      if (!data || data.ok === false) {
        const errorMsg = data?.error || 'Unknown error';
        console.error('[FORFEIT] RPC returned error:', errorMsg);
        toast.error(`Failed to forfeit: ${errorMsg}`);
        setDidIForfeit(false);
        return;
      }

      console.log('[FORFEIT] Match forfeited successfully');
      toast.info('Match forfeited');

      // Cleanup and navigate
      if (cleanupMatchRef.current) {
        cleanupMatchRef.current();
      }
      router.push('/app/play');
    } catch (error: any) {
      console.error('[FORFEIT] Failed to forfeit:', error);
      toast.error(`Failed to forfeit: ${error.message}`);
      setDidIForfeit(false);
    }
  }

  const handleRematch = async () => {
    if (!room || rematchLoading || rematchDisabled) return;

    console.log('[REMATCH DEBUG] User clicked rematch button');
    setRematchLoading(true);
    setRematchDisabled(true);

    try {
      const { data, error } = await supabase.rpc('request_rematch', {
        p_old_room_id: room.id
      });

      if (error) {
        console.log('[REMATCH DEBUG] RPC error:', error);
        toast.error(`Failed to request rematch: ${error.message}`);
        setRematchLoading(false);
        setRematchDisabled(false);
        return;
      }

      console.log('[REMATCH DEBUG] RPC response:', data);

      // Don't update local state - let realtime handle all state updates
      // Just show feedback that the request was sent
      if (data) {
        const readyCount = data.ready_count || 0;

        if (readyCount === 1) {
          toast.info('Rematch requested! Waiting for opponent...');
        }

        setRematchLoading(false);
        // Keep button disabled - rematch is in progress
      }
    } catch (error: any) {
      console.log('[REMATCH DEBUG] Exception:', error);
      toast.error(`Failed to request rematch: ${error.message}`);
      setRematchLoading(false);
      setRematchDisabled(false);
    }
  };

  const onRematchClick = async () => {
    const { data, error } = await supabase.rpc("request_rematch", {
      p_old_room_id: matchId,
    });

    if (error) {
      console.error(error);
      return;
    }

    const row = data?.[0];

    if (row?.ready_count != null) {
      setRematchCount(row.ready_count);
    }

    if (row?.new_room_id) {
      setStarting(true);
      setTimeout(() => {
        router.push(`/app/play/quick-match/match/${row.new_room_id}`);
      }, 700);
    }
  };

  const handleReturnToApp = () => {
    if (room?.match_type === 'tournament') {
      router.push('/app/tournaments');
    } else {
      router.push('/app/play/quick-match');
    }
  };

  // ICE server fetching now handled by useMatchWebRTC hook

  // All WebRTC functions now handled by useMatchWebRTC hook
  // toggleCamera, toggleMic, toggleVideo, stopCamera are destructured from the hook above

  const getDartLabel = (dart: Dart) => {
    if (dart.number === 0 && dart.value === 0) {
      return 'MISS';
    }
    if (dart.type === 'bull') {
      return dart.number === 25 ? 'SB' : 'DB';
    }
    const prefix = dart.type === 'single' ? 'S' : dart.type === 'double' ? 'D' : 'T';
    return `${prefix}${dart.number}`;
  };

  if (loading) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Loading match...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <p className="text-white text-lg mb-4">Match room not found</p>
          <Button
            onClick={() => router.push('/app')}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  if (!room.player2_id) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <div className="text-white text-lg mb-2">Waiting for opponent...</div>
          <p className="text-gray-400 text-sm">Room ID: {matchId.slice(0, 8)}...</p>
        </Card>
      </div>
    );
  }

  if (!matchState) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Loading match data...</div>
      </div>
    );
  }

  const myPlayer = matchState.youArePlayer === 1 ? matchState.players[0] : matchState.players[1];
  const opponentPlayer = matchState.youArePlayer === 1 ? matchState.players[1] : matchState.players[0];

  const myName = myPlayer.name;
  const opponentName = opponentPlayer.name;
  const myRemaining = myPlayer.remaining;
  const opponentRemaining = opponentPlayer.remaining;
  const myLegs = myPlayer.legsWon;
  const opponentLegs = opponentPlayer.legsWon;
  const myAvg = myPlayer.threeDartAvg;
  const opponentAvg = opponentPlayer.threeDartAvg;

  const myVisits = matchState.visitHistory.filter(v => v.playerId === myPlayer.id);
  const opponentVisits = matchState.visitHistory.filter(v => v.playerId === opponentPlayer.id);
  const myHighestVisit = myVisits.length > 0 ? Math.max(...myVisits.map(v => v.score)) : 0;
  const opponentHighestVisit = opponentVisits.length > 0 ? Math.max(...opponentVisits.map(v => v.score)) : 0;

  const isMyTurn = matchState.currentTurnPlayer === matchState.youArePlayer;
  const matchComplete = matchState.status === 'finished' || matchState.status === 'abandoned' || matchState.status === 'forfeited';
  const winner = matchComplete && matchState.winnerId
    ? (matchState.winnerId === currentUserId ? 'you' : 'opponent')
    : null;

  const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
  const checkoutOptions = getCheckoutOptions(myRemaining, true);
  const isOnCheckout = myRemaining > 1 && myRemaining <= 170;

  const doubleOut = matchState.matchFormat.includes('best-of');

  return (
    <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Target className="w-6 h-6 text-emerald-400" />
                <span className="text-xl font-bold text-white">FIVE<span className="text-emerald-400">01</span></span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {room?.match_type === 'tournament' ? 'TOURNAMENT GAME' : 'QUICK MATCH'}
              </Badge>
              {isConnected ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>{matchState.gameMode}</span>
              <span>•</span>
              <span>{matchState.matchFormat.replace('best-of-', 'Best of ')}</span>
              {doubleOut && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                    Double Out
                  </Badge>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEndMatchDialog(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Forfeit
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-[1800px] mx-auto px-4 py-2 h-full flex flex-col">
          <div className="grid grid-cols-3 gap-3 mb-2 flex-shrink-0">
            <Card className="bg-slate-900/50 border-white/10 p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Current Leg</h3>
                  <Badge variant="outline" className="text-xs">Leg {matchState.currentLeg}</Badge>
                </div>
                <div className="flex items-center justify-center space-x-4 py-2">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-white">{myLegs}</p>
                    <p className="text-xs text-gray-400 mt-1">You</p>
                  </div>
                  <div className="text-4xl font-bold text-gray-600">-</div>
                  <div className="text-center">
                    <p className="text-4xl font-bold text-white">{opponentLegs}</p>
                    <p className="text-xs text-gray-400 mt-1">{opponentName}</p>
                  </div>
                </div>
                <div className="text-center py-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-emerald-400 text-sm font-semibold">
                    {isMyTurn ? 'Your' : `${opponentName}'s`} Turn
                  </p>
                </div>
              </div>
            </Card>

            <Card className={`p-3 transition-all relative ${isMyTurn ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-900/50 border-white/10'}`}>
              <div className="flex items-center space-x-2 mb-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-sm">
                    {myName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-white">{myName}</p>
                </div>
              </div>
              <div className="flex items-center justify-center py-6">
                <span className="text-6xl font-bold text-white">{myRemaining}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xl font-bold text-emerald-400">Avg {myAvg.toFixed(2)}</span>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-gray-400 mb-1">Remaining</p>
                  <div className="flex items-center space-x-2">
                    {Array.from({ length: matchState.legsToWin }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-4 h-4 rounded-full ${
                          idx < myLegs
                            ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                            : 'border-2 border-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <Card className={`p-3 transition-all relative ${!isMyTurn ? 'bg-blue-500/20 border-blue-500/50' : 'bg-slate-900/50 border-white/10'}`}>
              <div className="flex items-center space-x-2 mb-3">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white text-sm">
                    {opponentName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-white">{opponentName}</p>
                </div>
              </div>
              <div className="flex items-center justify-center py-6">
                <span className="text-6xl font-bold text-white">{opponentRemaining}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xl font-bold text-blue-400">Avg {opponentAvg.toFixed(2)}</span>
                <div className="flex flex-col items-end">
                  <p className="text-xs text-gray-400 mb-1">Remaining</p>
                  <div className="flex items-center space-x-2">
                    {Array.from({ length: matchState.legsToWin }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`w-4 h-4 rounded-full ${
                          idx < opponentLegs
                            ? 'bg-gradient-to-br from-blue-400 to-cyan-500'
                            : 'border-2 border-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: '0.75fr 1.25fr' }}>
            <div className="flex flex-col gap-3 overflow-hidden">
              <Card className="bg-slate-900/50 border-white/10 p-3 flex flex-col overflow-hidden" style={{ height: '400px' }}>
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-white">Live Camera</h3>
                  <Badge
                    variant="outline"
                    className={`text-xs ${isMyTurn ? 'border-emerald-500/50 text-emerald-400' : 'border-blue-500/50 text-blue-400'}`}
                  >
                    {isMyTurn ? 'Your Turn' : 'Opponent Turn'}
                  </Badge>
                </div>
                <div className="flex-1 relative rounded-lg overflow-hidden bg-slate-950/50" style={{ minHeight: 0 }}>
                  <div className="absolute inset-0">
                    <video
                      ref={liveVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover rounded-lg"
                      style={{ display: (isMyTurn && localStream) || (!isMyTurn && remoteStream) ? 'block' : 'none' }}
                    />
                    {((isMyTurn && localStream) || (!isMyTurn && remoteStream)) && (
                      <>
                        <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/70 rounded-lg text-sm text-white font-medium">
                          {isMyTurn ? 'You' : opponentName}
                        </div>
                        {callStatus === 'connected' && !isMyTurn && remoteStream && (
                          <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        )}
                      </>
                    )}
                    {!((isMyTurn && localStream) || (!isMyTurn && remoteStream)) && (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                        {isMyTurn
                          ? 'Your camera is off'
                          : (callStatus === 'connected' || callStatus === 'connecting')
                            ? 'Opponent camera connecting...'
                            : 'Opponent camera is off'
                        }
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="bg-slate-900/50 border-white/10 p-3 flex flex-col overflow-hidden flex-1" style={{ minHeight: 0 }}>
                <h3 className="text-sm font-semibold text-white mb-2 flex-shrink-0">Visit History</h3>
                <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0 }}>
                  <div className="space-y-2 pr-2">
                    {matchState.visitHistory.slice().reverse().map((visit, idx) => {
                      const isMyVisit = visit.by === 'you';
                      const canEdit = isMyVisit && !visit.isCheckout;
                      return (
                        <div
                          key={visit.id}
                          className={`flex items-center justify-between text-sm p-2 rounded ${
                            isMyVisit
                              ? 'bg-teal-500/5 border-l-2 border-l-teal-400/60'
                              : 'bg-slate-700/20 border-l-2 border-l-slate-500/60'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1 py-0 ${
                                isMyVisit
                                  ? 'border-teal-400/40 text-teal-300'
                                  : 'border-slate-500/50 text-slate-300'
                              }`}
                            >
                              {visit.label}
                            </Badge>
                            <span className="text-gray-500 text-xs">
                              #{visit.turnNumberInLeg}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {visit.isBust && (
                              <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                                BUST
                              </Badge>
                            )}
                            {visit.isCheckout && (
                              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                                CHECKOUT
                              </Badge>
                            )}
                            <span className="text-white font-semibold">{visit.score}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-gray-400">{visit.remainingAfter}</span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditVisit(visit)}
                                className="h-6 w-6 p-0 hover:bg-teal-500/10 text-teal-400 hover:text-teal-300"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {matchState.visitHistory.length === 0 && (
                      <p className="text-gray-500 text-center py-8 text-sm">No visits yet</p>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <Card className="bg-slate-900/50 border-white/10 p-2 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <h3 className="text-base font-semibold text-white">Scoring</h3>
                <Tabs value={scoringMode} onValueChange={(v) => setScoringMode(v as 'quick' | 'input')}>
                  <TabsList className="bg-slate-800/50 h-8">
                    <TabsTrigger value="quick" className="data-[state=active]:bg-emerald-500 text-xs">Quick</TabsTrigger>
                    <TabsTrigger value="input" className="data-[state=active]:bg-emerald-500 text-xs">Input</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isOnCheckout && isMyTurn && (
                checkoutOptions && checkoutOptions.length > 0 && checkoutOptions[0]?.description ? (
                  <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center space-x-2 mb-0.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <h4 className="text-xs font-semibold text-white">CHECKOUT AVAILABLE</h4>
                      <span className="text-amber-400 font-bold text-base ml-auto">{myRemaining}</span>
                    </div>
                    <div className="text-amber-300 text-xs font-semibold">
                      {checkoutOptions[0].description}
                    </div>
                  </Card>
                ) : (
                  <Card className="bg-gradient-to-br from-gray-500/20 to-slate-500/20 border-gray-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-3.5 h-3.5 text-gray-400" />
                      <h4 className="text-xs font-semibold text-white">CHECKOUT NOT POSSIBLE</h4>
                      <span className="text-gray-400 font-bold text-base ml-auto">{myRemaining}</span>
                    </div>
                  </Card>
                )
              )}

              {scoringMode === 'quick' ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <Card className="bg-emerald-500/10 border-emerald-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-emerald-400">Current Visit</h4>
                      <span className="text-emerald-400 font-bold text-sm">Total: {visitTotal}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 mt-1">
                      {currentVisit.map((dart, idx) => (
                        <Badge key={idx} className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs py-0.5">
                          {getDartLabel(dart)} ({dart.value})
                        </Badge>
                      ))}
                      {[...Array(3 - currentVisit.length)].map((_, idx) => (
                        <div key={idx} className="w-14 h-5 border-2 border-dashed border-gray-600 rounded"></div>
                      ))}
                    </div>
                  </Card>

                  <div className="flex flex-col">
                    <div className="flex space-x-1.5 mb-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'singles' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('singles')}
                        className={`${dartboardGroup === 'singles' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={!isMyTurn || submitting}
                      >
                        Singles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'doubles' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('doubles')}
                        className={`${dartboardGroup === 'doubles' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={!isMyTurn || submitting}
                      >
                        Doubles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'triples' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('triples')}
                        className={`${dartboardGroup === 'triples' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={!isMyTurn || submitting}
                      >
                        Triples
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'bulls' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('bulls')}
                        className={`${dartboardGroup === 'bulls' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={!isMyTurn || submitting}
                      >
                        Bulls
                      </Button>
                    </div>

                    {dartboardGroup !== 'bulls' ? (
                      <div className="grid grid-cols-5 gap-1 mb-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((num) => (
                          <Button
                            key={num}
                            onClick={() => handleDartClick(dartboardGroup, num)}
                            disabled={currentVisit.length >= 3 || !isMyTurn || submitting}
                            className="h-10 text-xs font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                          >
                            {dartboardGroup === 'singles' ? `S${num}` : dartboardGroup === 'doubles' ? `D${num}` : `T${num}`}
                            <span className="text-[10px] text-gray-400 ml-0.5">
                              ({dartboardGroup === 'singles' ? num : dartboardGroup === 'doubles' ? num * 2 : num * 3})
                            </span>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <Button
                          onClick={() => handleDartClick('bulls', 25)}
                          disabled={currentVisit.length >= 3 || !isMyTurn || submitting}
                          className="h-12 text-sm font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                        >
                          Single Bull
                          <span className="block text-xs text-gray-400">(25)</span>
                        </Button>
                        <Button
                          onClick={() => handleDartClick('bulls', 50)}
                          disabled={currentVisit.length >= 3 || !isMyTurn || submitting}
                          className="h-12 text-sm font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                        >
                          Double Bull
                          <span className="block text-xs text-gray-400">(50)</span>
                        </Button>
                      </div>
                    )}

                    <Button
                      onClick={() => handleDartClick('singles', 0)}
                      variant="outline"
                      disabled={!isMyTurn || submitting}
                      className="w-full h-8 mb-1 border-white/10 text-white hover:bg-white/5 font-semibold text-sm flex-shrink-0"
                    >
                      Miss (0)
                    </Button>

                    <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                      <Button
                        onClick={handleClearVisit}
                        disabled={currentVisit.length === 0 || !isMyTurn || submitting}
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white hover:bg-white/5"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        onClick={handleSubmitVisit}
                        disabled={currentVisit.length === 0 || !isMyTurn || submitting}
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Submit Visit
                      </Button>
                      <Button
                        onClick={handleBust}
                        disabled={!isMyTurn || submitting}
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        Bust
                      </Button>
                    </div>

                    <div className="flex items-center space-x-2 mt-2">
                      <Button
                        onClick={toggleCamera}
                        disabled={callStatus === 'connecting'}
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white hover:bg-white/5"
                      >
                        {callStatus === 'connecting' ? 'Connecting...' : isCameraOn ? 'Camera Off' : 'Camera On'}
                      </Button>

                      {isCameraOn && (
                        <>
                          <Button
                            onClick={toggleMic}
                            variant="ghost"
                            size="sm"
                            className={`p-2 h-8 w-8 ${isMicMuted ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                            title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
                          >
                            {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          </Button>
                          <Button
                            onClick={toggleVideo}
                            variant="ghost"
                            size="sm"
                            className={`p-2 h-8 w-8 ${isVideoDisabled ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                            title={isVideoDisabled ? 'Enable Camera' : 'Disable Camera'}
                          >
                            {isVideoDisabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-0.5 min-h-0">
                  <Card className="bg-emerald-500/10 border-emerald-500/30 p-1.5 flex-shrink-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-xs font-semibold text-emerald-400">Current Visit</h4>
                      <span className="text-emerald-400 font-bold">Total: {scoreInput && !isNaN(parseInt(scoreInput)) ? parseInt(scoreInput) : 0}</span>
                    </div>
                    <div className="text-center text-white text-sm">
                      {scoreInput && !isNaN(parseInt(scoreInput)) ? `Visit total: ${scoreInput}` : 'Enter visit total (0-180)'}
                    </div>
                  </Card>

                  {inputModeError && (
                    <Card className="bg-red-500/20 border-red-500/30 p-2 flex-shrink-0">
                      <p className="text-red-400 text-xs text-center">{inputModeError}</p>
                    </Card>
                  )}

                  <div className="flex space-x-2 flex-shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="180"
                      value={scoreInput}
                      onChange={(e) => {
                        setScoreInput(e.target.value);
                        setInputModeError('');
                      }}
                      placeholder="Enter score (0-180)"
                      className="flex-1 bg-white/5 border-white/10 text-white text-lg"
                      disabled={!isMyTurn || submitting}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && scoreInput) {
                          const score = parseInt(scoreInput);
                          if (score >= 0 && score <= 180) {
                            handleInputScoreSubmit(score);
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        if (scoreInput) {
                          const score = parseInt(scoreInput);
                          if (score >= 0 && score <= 180) {
                            handleInputScoreSubmit(score);
                          }
                        }
                      }}
                      disabled={!scoreInput || parseInt(scoreInput) < 0 || parseInt(scoreInput) > 180 || !isMyTurn || submitting}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
                    >
                      Submit
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                      <Button
                        key={num}
                        onClick={() => setScoreInput(prev => prev + num.toString())}
                        disabled={!isMyTurn || submitting}
                        className="h-12 text-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                      >
                        {num}
                      </Button>
                    ))}
                    <Button
                      onClick={() => setScoreInput('')}
                      disabled={!isMyTurn || submitting}
                      className="h-12 text-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400"
                    >
                      Clear
                    </Button>
                  </div>

                  <div className="flex items-center space-x-2 mt-2 flex-shrink-0">
                    <Button
                      onClick={toggleCamera}
                      disabled={callStatus === 'connecting'}
                      variant="outline"
                      size="sm"
                      className="border-white/10 text-white hover:bg-white/5"
                    >
                      {callStatus === 'connecting' ? 'Connecting...' : isCameraOn ? 'Camera Off' : 'Camera On'}
                    </Button>

                    {isCameraOn && (
                      <>
                        <Button
                          onClick={toggleMic}
                          variant="ghost"
                          size="sm"
                          className={`p-2 h-8 w-8 ${isMicMuted ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                          title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
                        >
                          {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                        <Button
                          onClick={toggleVideo}
                          variant="ghost"
                          size="sm"
                          className={`p-2 h-8 w-8 ${isVideoDisabled ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                          title={isVideoDisabled ? 'Enable Camera' : 'Disable Camera'}
                        >
                          {isVideoDisabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Forfeit Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to forfeit this match? Your opponent will win.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={forfeitMatch}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Forfeit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showMatchCompleteModal || showOpponentForfeitModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-3xl">
          <DialogHeader>
            <div className="flex flex-col items-center space-y-2 mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <DialogTitle className="text-3xl font-bold text-white text-center">
                {matchState?.endedReason === 'forfeit'
                  ? 'Opponent Forfeited'
                  : `${matchState?.winnerName} Wins!`}
              </DialogTitle>
              <p className="text-base text-gray-400 text-center">
                {matchState?.endedReason === 'forfeit'
                  ? 'Match ended early'
                  : `Final score: ${myLegs}-${opponentLegs}`}
              </p>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <h3 className="text-lg font-semibold text-white mb-3">Match Stats</h3>

            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-white/10 p-4">
                <div className="flex items-center space-x-3 mb-4">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                      {myName.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-white">{myName}</p>
                    <p className="text-xs text-gray-400">{winner === 'you' ? 'Winner' : 'Runner-up'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">3-Dart Average</span>
                    <span className="text-lg font-bold text-emerald-400">{myAvg.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Highest Visit</span>
                    <span className="text-lg font-bold text-amber-400">{myHighestVisit}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Legs Won</span>
                    <span className="text-lg font-bold text-blue-400">{myLegs}</span>
                  </div>
                </div>
              </Card>

              <Card className="bg-slate-800/50 border-white/10 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                        {opponentName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-white">{opponentName}</p>
                      <p className="text-xs text-gray-400">{winner === 'opponent' ? 'Winner' : 'Runner-up'}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.info('Add friend feature coming soon!')}
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add Friend
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">3-Dart Average</span>
                    <span className="text-lg font-bold text-emerald-400">{opponentAvg.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Highest Visit</span>
                    <span className="text-lg font-bold text-amber-400">{opponentHighestVisit}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Legs Won</span>
                    <span className="text-lg font-bold text-blue-400">{opponentLegs}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="flex justify-center space-x-4 pt-4 border-t border-white/10">
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                if (cleanupMatchRef.current) {
                  cleanupMatchRef.current();
                }
                router.push('/app/play');
              }}
              className="border-white/20 text-white hover:bg-white/10 px-8"
            >
              <Home className="w-5 h-5 mr-2" />
              Leave
            </Button>
            <Button
              size="lg"
              onClick={onRematchClick}
              disabled={starting}
              className={`bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-8 ${
                rematchCount === 1 ? 'ring-2 ring-emerald-400 animate-pulse ring-offset-2 ring-offset-slate-900' : ''
              } ${
                rematchCount === 2 ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              {starting ? 'Starting…' : `Rematch ${rematchCount}/2`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {editingVisit && (
        <EditVisitModal
          open={showEditVisitModal}
          onOpenChange={setShowEditVisitModal}
          visitNumber={editingVisit.visitNumber}
          originalScore={editingVisit.score}
          onSave={handleSaveEditedVisit}
        />
      )}

    </div>
  );
}
