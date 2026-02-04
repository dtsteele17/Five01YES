'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Trophy, RotateCcw, Chrome as Home, X, Check, LogOut, Wifi, WifiOff, UserPlus, Video, VideoOff, Mic, MicOff, Camera, CameraOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mapRoomToMatchState, type MappedMatchState } from '@/lib/match/mapRoomToMatchState';
import EditVisitModal from '@/components/app/EditVisitModal';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';
import { clearMatchStorage } from '@/lib/utils/match-storage';
import { clearMatchState } from '@/lib/utils/match-resume';
import { getTrustRatingDisplay, getTrustRatingButtonGradient, getTrustRatingDescription, getUnratedLabel } from '@/lib/utils/trust-rating';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';
import { QuickMatchScoringPanel } from '@/components/match/QuickMatchScoringPanel';
import { QuickMatchVisitHistoryPanel } from '@/components/match/QuickMatchVisitHistoryPanel';
import { MatchChatDrawer } from '@/components/match/MatchChatDrawer';
import { Separator } from '@/components/ui/separator';
import { MessageCircle } from 'lucide-react';

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
  multiplier: number;
  label: string;
  score: number;
  is_double: boolean;
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
  trust_rating_letter?: string;
}

interface QuickMatchVisit {
  id: string;
  room_id: string;
  player_id: string;
  leg: number;
  turn_no: number;
  score: number;
  remaining_before: number;
  remaining_after: number;
  darts: any[];
  darts_thrown: number;
  darts_at_double: number;
  is_bust: boolean;
  bust_reason: string | null;
  is_checkout: boolean;
  created_at: string;
}

export default function QuickMatchRoomPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const supabase = createClient();

  const [room, setRoom] = useState<MatchRoom | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [visits, setVisits] = useState<QuickMatchVisit[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MappedMatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Scoring state
  const [scoreInput, setScoreInput] = useState('');
  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [showOpponentForfeitModal, setShowOpponentForfeitModal] = useState(false);
  const [showOpponentForfeitSignalModal, setShowOpponentForfeitSignalModal] = useState(false);
  const [didIForfeit, setDidIForfeit] = useState(false);
  const [forfeitLoading, setForfeitLoading] = useState(false);

  // Visit editing
  const [showEditVisitModal, setShowEditVisitModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<{ visitNumber: number; score: number } | null>(null);

  // Trust rating
  const [opponentTrustRating, setOpponentTrustRating] = useState<any>(null);
  const [hasSubmittedRating, setHasSubmittedRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Rematch
  const [rematchCount, setRematchCount] = useState(0);
  const [starting, setStarting] = useState(false);

  // Chat
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  const hasRedirectedRef = useRef(false);
  const cleanupMatchRef = useRef<() => void>();

  // WebRTC
  const isMyTurnForWebRTC = matchState ? matchState.currentTurnPlayer === matchState.youArePlayer : false;
  const webrtc = useMatchWebRTC({
    roomId: matchId,
    myUserId: currentUserId,
    isMyTurn: isMyTurnForWebRTC,
  });
  const {
    localStream,
    remoteStream,
    callStatus,
    isCameraOn,
    isMicMuted,
    isVideoDisabled,
    toggleCamera,
    toggleMic,
    toggleVideo,
    stopCamera,
    liveVideoRef
  } = webrtc;

  cleanupMatchRef.current = () => {
    console.log('[CLEANUP] Starting match cleanup');
    stopCamera('match cleanup');
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

  async function initializeMatch() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      const matchLoaded = await loadMatchData();

      if (!matchLoaded) {
        console.error('[MATCH_LOAD] Match room not found, cleaning up and navigating away');
        toast.error('Match no longer available');
        await clearMatchState(matchId);
        router.push('/app/play/quick-match');
        return;
      }

      const cleanup = setupRealtimeSubscriptions();

      return cleanup;
    } catch (error: any) {
      console.error('Initialization error:', error);
      toast.error(`Error: ${error.message}`);
      await clearMatchState(matchId);
      router.push('/app/play/quick-match');
    } finally {
      setLoading(false);
    }
  }

  async function loadMatchData(): Promise<boolean> {
    const { data: roomData, error: roomError } = await supabase
      .from('match_rooms')
      .select('*')
      .eq('id', matchId)
      .maybeSingle();

    if (roomError || !roomData) {
      console.error('[LOAD] Room not found:', roomError);
      return false;
    }

    setRoom(roomData as MatchRoom);

    const { data: visitsData } = await supabase
      .from('quick_match_visits')
      .select('*')
      .eq('room_id', matchId)
      .eq('leg', roomData.current_leg)
      .order('created_at', { ascending: true });

    setVisits((visitsData as QuickMatchVisit[]) || []);

    const playerIds = [roomData.player1_id, roomData.player2_id].filter(Boolean);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, trust_rating_letter')
      .in('user_id', playerIds);

    setProfiles((profilesData as Profile[]) || []);

    return true;
  }

  useEffect(() => {
    if (room && profiles.length > 0) {
      // Convert visits to match_events format for mapRoomToMatchState
      const eventsFromVisits = visits.map(v => ({
        id: v.id,
        player_id: v.player_id,
        seq: v.turn_no,
        event_type: 'visit',
        payload: {
          score: v.score,
          remaining: v.remaining_after,
          is_bust: v.is_bust,
          is_checkout: v.is_checkout,
          leg: v.leg
        },
        created_at: v.created_at
      }));
      const mapped = mapRoomToMatchState(room, eventsFromVisits, profiles, currentUserId || '');
      setMatchState(mapped);
    }
  }, [room, visits, profiles, currentUserId]);

  // Refetch visits when leg changes
  useEffect(() => {
    if (room && room.current_leg) {
      console.log('[LEG_CHANGE] Leg changed to', room.current_leg, 'refetching visits');
      supabase
        .from('quick_match_visits')
        .select('*')
        .eq('room_id', matchId)
        .eq('leg', room.current_leg)
        .order('created_at', { ascending: true })
        .then(({ data }) => {
          setVisits((data as QuickMatchVisit[]) || []);
        });
    }
  }, [room?.current_leg]);

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

          if (updatedRoom.status === 'forfeited' || updatedRoom.status === 'finished') {
            console.log('[REALTIME] Match ended, status:', updatedRoom.status);

            if (updatedRoom.status === 'forfeited') {
              if (!didIForfeit) {
                setShowOpponentForfeitModal(true);
              }
            } else if (updatedRoom.status === 'finished') {
              setShowMatchCompleteModal(true);
            }

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
          table: 'quick_match_visits',
          filter: `room_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[REALTIME] Visit inserted:', payload.new);
          const newVisit = payload.new as QuickMatchVisit;
          // Only add if it's for the current leg
          if (room && newVisit.leg === room.current_leg) {
            setVisits((prev) => [...prev, newVisit]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_match_visits',
          filter: `room_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[REALTIME] Visit updated:', payload.new);
          const updatedVisit = payload.new as QuickMatchVisit;
          setVisits((prev) => prev.map((v) => (v.id === updatedVisit.id ? updatedVisit : v)));
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    const signalsChannel = supabase
      .channel(`signals_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_signals',
          filter: `room_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('[SIGNALS] Signal received:', payload.new);
          const signal = payload.new as any;

          if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
            console.log('[SIGNALS] Opponent forfeited, showing modal');
            setShowOpponentForfeitSignalModal(true);

            setTimeout(() => {
              if (cleanupMatchRef.current) {
                console.log('[SIGNALS] Auto-cleanup triggered after forfeit');
                cleanupMatchRef.current();
              }
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      roomChannel.unsubscribe();
      signalsChannel.unsubscribe();
    };
  }

  const handleDartClick = (dartType: 'single' | 'double' | 'triple' | 'bull', number: number) => {
    if (currentVisit.length >= 3) return;

    let value = 0;
    let multiplier = 1;
    let label = '';
    let isDouble = false;

    if (dartType === 'bull') {
      value = number; // 25 or 50
      multiplier = number === 50 ? 2 : 1;
      label = number === 50 ? 'DBULL' : 'SBULL';
      isDouble = number === 50;
      // For bulls, the "number" we pass to backend should be 25
      number = 25;
    } else if (dartType === 'single') {
      value = number;
      multiplier = 1;
      label = `S${number}`;
      isDouble = false;
    } else if (dartType === 'double') {
      value = number * 2;
      multiplier = 2;
      label = `D${number}`;
      isDouble = true;
    } else if (dartType === 'triple') {
      value = number * 3;
      multiplier = 3;
      label = `T${number}`;
      isDouble = false;
    }

    const dart: Dart = {
      type: dartType,
      number,
      value,
      multiplier,
      label,
      score: value,
      is_double: isDouble,
    };
    setCurrentVisit([...currentVisit, dart]);
  };

  const handleClearVisit = () => {
    setCurrentVisit([]);
  };

  const handleUndoDart = () => {
    setCurrentVisit((prev) => prev.slice(0, -1));
  };

  const handleMiss = () => {
    if (currentVisit.length >= 3) {
      toast.error('Visit already has 3 darts');
      return;
    }

    const missDart: Dart = {
      type: 'single',
      number: 0,
      value: 0,
      multiplier: 1,
      label: 'MISS',
      score: 0,
      is_double: false,
    };

    setCurrentVisit([...currentVisit, missDart]);
  };

  const handleBust = async () => {
    if (!room || !currentUserId || submitting) return;

    const isMyTurn = matchState ? matchState.currentTurnPlayer === matchState.youArePlayer : false;

    if (!isMyTurn) {
      toast.error('Not your turn');
      return;
    }

    console.log('[HANDLE_BUST] ===== BUST CLICKED =====');
    console.log('[HANDLE_BUST] Room ID:', matchId);
    console.log('[HANDLE_BUST] User ID:', currentUserId);
    console.log('[HANDLE_BUST] Darts thrown:', currentVisit);
    console.log('[HANDLE_BUST] ========================');

    // Bust = score is 0, isBust = true, but still send all darts thrown
    await submitScore(0, true, currentVisit);
  };

  const handleSubmitVisit = async () => {
    if (!room || !currentUserId || submitting) return;

    const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);

    // Allow 0 score if darts were thrown (e.g., 3 misses)
    if (currentVisit.length === 0) {
      toast.error('Please enter darts or use the Bust button');
      return;
    }

    console.log('[HANDLE_SUBMIT] ===== SUBMIT VISIT CLICKED =====');
    console.log('[HANDLE_SUBMIT] Room ID:', matchId);
    console.log('[HANDLE_SUBMIT] User ID:', currentUserId);
    console.log('[HANDLE_SUBMIT] Visit Total:', visitTotal);
    console.log('[HANDLE_SUBMIT] Darts:', currentVisit);
    console.log('[HANDLE_SUBMIT] ========================');

    await submitScore(visitTotal, false, currentVisit);
  };

  const handleInputScoreSubmit = async () => {
    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0 || score > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }
    await submitScore(score, false);
  };

  async function submitScore(score: number, isBust: boolean = false, darts: Dart[] = []) {
    if (!room || !matchState || !currentUserId) return;

    const isMyTurn = matchState.currentTurnPlayer === matchState.youArePlayer;

    if (!isMyTurn) {
      toast.error('Not your turn');
      return;
    }

    // Ensure score is valid integer
    const visitTotal = Math.floor(score);
    if (visitTotal < 0 || visitTotal > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    // Convert darts to server format
    const dartsArray = darts.map(dart => {
      let mult: 'S' | 'D' | 'T' | 'SB' | 'DB' = 'S';
      if (dart.type === 'bull') {
        mult = dart.value === 50 ? 'DB' : 'SB';
      } else if (dart.type === 'double') {
        mult = 'D';
      } else if (dart.type === 'triple') {
        mult = 'T';
      }
      return {
        n: dart.number,
        mult
      };
    });

    setSubmitting(true);

    try {
      console.log('[SUBMIT] ===== SUBMIT VISIT =====');
      console.log('[SUBMIT] Room ID:', matchId);
      console.log('[SUBMIT] Score:', visitTotal);
      console.log('[SUBMIT] Is Bust:', isBust);
      console.log('[SUBMIT] Darts Array:', dartsArray);
      console.log('[SUBMIT] ========================');

      const { data, error } = await supabase.rpc("rpc_quick_match_submit_visit_v3", {
        p_room_id: matchId,
        p_score: visitTotal,
        p_darts: dartsArray,
        p_is_bust: !!isBust
      });

      if (error) {
        console.error("[SUBMIT] RPC Error:", error.message);
        toast.error(error.message || 'Failed to submit visit');
        return;
      }

      console.log('[SUBMIT] Success:', data);

      if (!data?.ok) {
        toast.error('Failed to submit visit');
        return;
      }

      // Clear visit on successful submission
      setScoreInput('');
      setCurrentVisit([]);

      // Show leg won notification
      if (data.leg_won) {
        toast.success('Leg won!');
      }

      // The room state will be updated via realtime subscription
      // Visit history will auto-refresh for new leg due to useEffect watching room.current_leg
    } catch (error: any) {
      console.error('[SUBMIT] Error:', error);
      toast.error(error?.message || 'Failed to submit visit');
    } finally {
      setSubmitting(false);
    }
  }

  async function forfeitMatch() {
    if (!room || !matchState || !currentUserId) {
      toast.error("Match data not available");
      return;
    }

    // Check if match is already completed
    if (room.status === 'completed' || room.status === 'finished' || room.status === 'forfeited') {
      toast.error("Match already ended");
      setShowEndMatchDialog(false);
      return;
    }

    // Get opponent ID safely
    const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;
    if (!opponentId) {
      toast.error("Couldn't forfeit—opponent not found");
      return;
    }

    setForfeitLoading(true);

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

        // Handle specific error types
        if (errorMsg === 'not_your_turn') {
          toast.error("You can only forfeit on your turn");
        } else if (errorMsg === 'match_already_ended') {
          toast.error("Match already ended");
        } else {
          toast.error("Couldn't forfeit—try again");
        }

        setDidIForfeit(false);
        setForfeitLoading(false);
        return;
      }

      console.log('[FORFEIT] Match forfeited successfully');

      // Send forfeit signal to opponent
      console.log('[FORFEIT] Sending forfeit signal to opponent:', opponentId);
      const { error: signalError } = await supabase
        .from('match_signals')
        .insert({
          room_id: matchId,
          from_user_id: currentUserId,
          to_user_id: opponentId,
          type: 'forfeit',
          payload: { message: 'Opponent forfeited the match' }
        });

      if (signalError) {
        console.error('[FORFEIT] Failed to send forfeit signal:', signalError);
      } else {
        console.log('[FORFEIT] Forfeit signal sent successfully');
      }

      toast.success('You forfeited the match');

      // Cleanup and redirect
      if (cleanupMatchRef.current) {
        cleanupMatchRef.current();
      }
      await clearMatchState(matchId);

      // Navigate to play hub
      router.push('/app/play');
    } catch (error: any) {
      console.error('[FORFEIT] Failed to forfeit:', error);
      toast.error("Couldn't forfeit—try again");
      setDidIForfeit(false);
      setForfeitLoading(false);
    }
  }

  const handleEditVisit = (visitNumber: number, currentScore: number) => {
    setEditingVisit({ visitNumber, score: currentScore });
    setShowEditVisitModal(true);
  };

  const handleSaveEditedVisit = async (newScore: number) => {
    if (!editingVisit) return;

    try {
      const { error } = await supabase.rpc('rpc_edit_quick_match_visit', {
        p_room_id: matchId,
        p_visit_number: editingVisit.visitNumber,
        p_new_score: newScore,
      });

      if (error) throw error;

      toast.success('Visit updated');
      setShowEditVisitModal(false);
      setEditingVisit(null);

      await loadMatchData();
    } catch (error: any) {
      console.error('[EDIT] Failed to edit visit:', error);
      toast.error(`Failed to update visit: ${error.message}`);
    }
  };

  const handleTrustRating = async (rating: string) => {
    if (!matchState || hasSubmittedRating || ratingLoading) return;

    const opponentId = matchState.youArePlayer === 1 ? room?.player2_id : room?.player1_id;
    if (!opponentId) return;

    setRatingLoading(true);

    try {
      const { error } = await supabase.rpc('rpc_submit_trust_rating', {
        p_rated_user_id: opponentId,
        p_rating: rating,
      });

      if (error) throw error;

      setSelectedRating(rating);
      setHasSubmittedRating(true);
      toast.success(`Rated ${rating}: ${getTrustRatingDescription(rating as any)}`);
    } catch (error: any) {
      console.error('[TRUST_RATING] Failed:', error);
      toast.error(`Failed to submit rating: ${error.message}`);
    } finally {
      setRatingLoading(false);
    }
  };

  const handleSkipRating = () => {
    setHasSubmittedRating(true);
    toast.info('Rating skipped');
  };

  const handleReturnToApp = async () => {
    await clearMatchState(matchId);
    if (room?.match_type === 'tournament') {
      router.push('/app/tournaments');
    } else {
      router.push('/app/play/quick-match');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden">
        <div className="text-white">Loading match...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden">
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
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden">
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <div className="text-white text-lg mb-2">Waiting for opponent...</div>
          <p className="text-gray-400 text-sm">Room ID: {matchId.slice(0, 8)}...</p>
        </Card>
      </div>
    );
  }

  if (!matchState) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center overflow-hidden">
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

  const myVisits = matchState.visitHistory.filter(v => v.playerId === myPlayer.id).map((v, idx) => ({
    visitNumber: idx + 1,
    score: v.score,
    remaining: v.remainingAfter,
    isBust: v.isBust,
    isCheckout: v.isCheckout,
  }));
  const opponentVisits = matchState.visitHistory.filter(v => v.playerId === opponentPlayer.id).map((v, idx) => ({
    visitNumber: idx + 1,
    score: v.score,
    remaining: v.remainingAfter,
    isBust: v.isBust,
    isCheckout: v.isCheckout,
  }));

  const myLastScore = myVisits.length > 0 ? myVisits[myVisits.length - 1].score : 0;
  const opponentLastScore = opponentVisits.length > 0 ? opponentVisits[opponentVisits.length - 1].score : 0;
  const myDartsThrown = myVisits.length * 3;
  const opponentDartsThrown = opponentVisits.length * 3;

  const isMyTurn = matchState.currentTurnPlayer === matchState.youArePlayer;
  const matchComplete = matchState.status === 'finished' || matchState.status === 'abandoned' || matchState.status === 'forfeited';
  const winner = matchComplete && matchState.winnerId
    ? (matchState.winnerId === currentUserId ? 'you' : 'opponent')
    : null;

  const myHighestVisit = myVisits.length > 0 ? Math.max(...myVisits.map(v => v.score)) : 0;
  const opponentHighestVisit = opponentVisits.length > 0 ? Math.max(...opponentVisits.map(v => v.score)) : 0;

  // Calculate preview remaining when darts are selected
  const currentVisitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
  const myPreviewRemaining = isMyTurn && currentVisit.length > 0 ? myRemaining - currentVisitTotal : null;

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex flex-col">
      {/* Top Bar with Forfeit and Chat */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        {/* Forfeit Button - Top Left */}
        <div className="flex items-center space-x-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!isMyTurn) {
                        toast.error("You can only forfeit on your turn");
                        return;
                      }
                      if (matchComplete) {
                        return;
                      }
                      setShowEndMatchDialog(true);
                    }}
                    disabled={forfeitLoading || !isMyTurn || matchComplete}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed bg-slate-900/80 backdrop-blur-sm"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Forfeit
                  </Button>
                </div>
              </TooltipTrigger>
              {!isMyTurn && !matchComplete && (
                <TooltipContent side="bottom" className="bg-slate-800 border-white/10 text-white">
                  <p>You can only forfeit on your turn</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <div className="px-3 py-1 bg-slate-900/80 backdrop-blur-sm border border-white/10 rounded-full shadow-lg shadow-blue-500/10">
            <span className="text-xs font-semibold text-white/90 tracking-wider uppercase">Quick Match</span>
          </div>
          {isConnected ? (
            <Wifi className="w-4 h-4 text-emerald-400" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-400" />
          )}
        </div>

        {/* Best of X - Center */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <h2 className="text-2xl font-bold text-white tracking-wide">
            {matchState.matchFormat.replace('best-of-', 'BEST OF ').toUpperCase()}
          </h2>
        </div>

        {/* Chat Icon - Top Right */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChatDrawer(true)}
            className="border-white/10 text-white hover:bg-white/5 bg-slate-900/80 backdrop-blur-sm"
          >
            <MessageCircle className="w-4 h-4" />
          </Button>
          {hasUnreadMessages && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900" />
          )}
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex-1 grid grid-cols-[1.4fr_1fr] gap-4 p-4 pt-20 min-h-0">
        {/* LEFT COLUMN: Camera Panel */}
        <div className="flex flex-col min-h-0">
          <Card className="flex-1 bg-slate-800/50 border-white/10 flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">Camera</h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400">
                  {callStatus === 'connected' ? 'Connected' : callStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleCamera}
                  className={`h-8 w-8 p-0 ${isCameraOn ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleMic}
                  className={`h-8 w-8 p-0 ${!isMicMuted ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {!isMicMuted ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleVideo}
                  className={`h-8 w-8 p-0 ${!isVideoDisabled ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {!isVideoDisabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="flex-1 relative bg-slate-900/50 overflow-hidden min-h-0">
              <video
                ref={liveVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-gray-500 text-sm">Camera Off</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Match UI */}
        <div className="flex flex-col space-y-3 min-h-0">
          {/* Player Score Cards with Stats */}
          <div className="flex gap-2">
            <div className="flex-1">
              <QuickMatchPlayerCard
                name={myName}
                remaining={myRemaining}
                legs={myLegs}
                legsToWin={matchState.legsToWin}
                isActive={isMyTurn}
                color="text-emerald-400"
                position="left"
                stats={{
                  average: myAvg,
                  lastScore: myLastScore,
                  dartsThrown: myDartsThrown,
                }}
                previewRemaining={myPreviewRemaining}
              />
            </div>
            <div className="flex-1">
              <QuickMatchPlayerCard
                name={opponentName}
                remaining={opponentRemaining}
                legs={opponentLegs}
                legsToWin={matchState.legsToWin}
                isActive={!isMyTurn}
                color="text-blue-400"
                position="right"
                stats={{
                  average: opponentAvg,
                  lastScore: opponentLastScore,
                  dartsThrown: opponentDartsThrown,
                }}
              />
            </div>
          </div>

          {/* Scoring or Visit History Panel */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 p-4 overflow-hidden flex flex-col min-h-0">
            {isMyTurn ? (
              <QuickMatchScoringPanel
                scoreInput={scoreInput}
                onScoreInputChange={setScoreInput}
                onTypeScoreSubmit={handleInputScoreSubmit}
                onSubmitVisit={handleSubmitVisit}
                onMiss={handleMiss}
                onBust={handleBust}
                currentDarts={currentVisit || []}
                onDartClick={handleDartClick}
                onUndoDart={handleUndoDart}
                onClearVisit={handleClearVisit}
                submitting={submitting}
                currentRemaining={myRemaining}
              />
            ) : (
              <>
                <h3 className="text-sm font-semibold text-white mb-3">Visit History</h3>
                <div className="flex-1 overflow-hidden min-h-0">
                  {currentUserId && (
                    <QuickMatchVisitHistoryPanel
                      roomId={matchId}
                      currentLeg={room.current_leg || 1}
                      myUserId={currentUserId}
                      opponentUserId={matchState.youArePlayer === 1 ? room.player2_id! : room.player1_id!}
                      myName={myName}
                      opponentName={opponentName}
                      myColor="text-emerald-400"
                      opponentColor="text-blue-400"
                      onEditVisit={handleEditVisit}
                    />
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Forfeit Confirmation Dialog */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={(open) => !forfeitLoading && setShowEndMatchDialog(open)}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Forfeit Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to forfeit? This will end the match.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={forfeitLoading}
              className="bg-white/5 border-white/10 text-white hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={forfeitMatch}
              disabled={forfeitLoading}
              className="bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
            >
              {forfeitLoading ? 'Forfeiting...' : 'Forfeit'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Opponent Forfeit Signal Modal */}
      <Dialog open={showOpponentForfeitSignalModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <div className="flex flex-col items-center space-y-2 mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <DialogTitle className="text-3xl font-bold text-white text-center">
                Opponent Forfeited
              </DialogTitle>
              <p className="text-base text-gray-400 text-center">
                You win by forfeit
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
                    <p className="text-xs text-gray-400">Winner</p>
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
                <div className="flex items-center space-x-3 mb-4">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                      {opponentName.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-white">{opponentName}</p>
                    <p className="text-xs text-gray-400">Forfeited</p>
                  </div>
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

          <div className="flex space-x-3 pt-4">
            <Button
              onClick={async () => {
                setShowOpponentForfeitSignalModal(false);
                if (cleanupMatchRef.current) {
                  cleanupMatchRef.current();
                }
                await clearMatchState(matchId);
                router.push('/app/play');
              }}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Play
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Match Complete Modal */}
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

                <Separator className="my-4 bg-white/10" />

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Trust Rating</span>
                    <div className="flex items-center space-x-2">
                      <TrustRatingBadge
                        letter={opponentTrustRating?.letter as any}
                        count={opponentTrustRating?.count || 0}
                        showTooltip={false}
                      />
                      <span className="text-xs text-gray-500">
                        {opponentTrustRating?.letter ? `(${opponentTrustRating.count || 0})` : getUnratedLabel()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 mb-2">Rate this player (optional):</p>
                    {!hasSubmittedRating ? (
                      <>
                        <div className="grid grid-cols-5 gap-2">
                          {(['A', 'B', 'C', 'D', 'E'] as const).map((rating) => {
                            return (
                              <button
                                key={rating}
                                onClick={() => handleTrustRating(rating)}
                                disabled={ratingLoading || hasSubmittedRating}
                                className={`
                                  relative p-2 rounded-lg transition-all
                                  bg-white/5 hover:bg-white/10
                                  ${ratingLoading || hasSubmittedRating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                title={getTrustRatingDescription(rating)}
                              >
                                <span className="text-sm font-bold text-gray-400">
                                  {rating}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={handleSkipRating}
                          disabled={ratingLoading}
                          className="mt-2 w-full text-xs text-gray-500 hover:text-gray-400 transition-colors disabled:opacity-50"
                        >
                          Skip
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center space-x-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-400">
                          {selectedRating ? `Rated ${selectedRating}: ${getTrustRatingDescription(selectedRating as any)}` : 'Skipped rating'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="flex justify-center space-x-4 pt-4 border-t border-white/10">
            <Button
              size="lg"
              variant="outline"
              onClick={async () => {
                if (cleanupMatchRef.current) {
                  cleanupMatchRef.current();
                }
                await clearMatchState(matchId);
                router.push('/app/play');
              }}
              className="border-white/20 text-white hover:bg-white/10 px-8"
            >
              <Home className="w-5 h-5 mr-2" />
              Return to Play
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

      <MatchChatDrawer
        roomId={matchId}
        myUserId={currentUserId || ''}
        opponentName={opponentName}
        isOpen={showChatDrawer}
        onOpenChange={setShowChatDrawer}
        onUnreadChange={setHasUnreadMessages}
      />
    </div>
  );
}
