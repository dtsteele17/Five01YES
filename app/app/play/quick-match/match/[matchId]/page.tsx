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
import { Separator } from '@/components/ui/separator';
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
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';
import { MatchHUDTop } from '@/components/match/MatchHUDTop';
import { MatchCameraPanel } from '@/components/match/MatchCameraPanel';
import { MatchTurnPanel } from '@/components/match/MatchTurnPanel';
import { clearMatchStorage, hasAttemptedMatch, markMatchAttempted } from '@/lib/utils/match-storage';
import { clearMatchState } from '@/lib/utils/match-resume';
import { clearStaleMatchState } from '@/lib/utils/stale-state-cleanup';
import { getTrustRatingDisplay, getTrustRatingButtonGradient, getTrustRatingDescription, getUnratedLabel } from '@/lib/utils/trust-rating';

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
  trust_rating_letter?: string;
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
  const [scoreInput, setScoreInput] = useState('');
  const [inputModeError, setInputModeError] = useState<string>('');

  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [showOpponentForfeitModal, setShowOpponentForfeitModal] = useState(false);
  const [showOpponentForfeitSignalModal, setShowOpponentForfeitSignalModal] = useState(false);
  const [didIForfeit, setDidIForfeit] = useState(false);
  const [forfeitLoading, setForfeitLoading] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const [rematchDisabled, setRematchDisabled] = useState(false);
  const [rematchData, setRematchData] = useState<any>(null);
  const hasRedirectedRef = { current: false };
  const [rematchCount, setRematchCount] = useState(0);
  const [starting, setStarting] = useState(false);

  const [showEditVisitModal, setShowEditVisitModal] = useState(false);
  const [editingVisit, setEditingVisit] = useState<{ id: string; score: number; visitNumber: number } | null>(null);

  const [opponentTrustRating, setOpponentTrustRating] = useState<{ letter: string | null; count: number } | null>(null);
  const [myRatingOfOpponent, setMyRatingOfOpponent] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [hasSubmittedRating, setHasSubmittedRating] = useState(false);

  // Match-start sound
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showSoundBanner, setShowSoundBanner] = useState(false);

  // Stale state cleanup - run once when room not found
  const hasCleanedStaleState = useRef(false);

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

  // Match-start sound effect
  useEffect(() => {
    const storageKey = `played_match_start_${matchId}`;

    // Initialize audio once
    if (!audioRef.current) {
      audioRef.current = new Audio('https://azrmgtukcgqslnilodky.supabase.co/storage/v1/object/public/public-assets/gameon-darts.mp3');
      audioRef.current.volume = 0.6;
    }

    // Check if match is truly active: status === 'active' AND both players present
    const isMatchActive =
      room?.status === 'active' &&
      room?.player1_id &&
      room?.player2_id;

    // Check if we've already played the sound for this room
    const hasPlayed = sessionStorage.getItem(storageKey) === 'true';

    if (isMatchActive && !hasPlayed) {
      console.log('[MATCH_START_SOUND] Playing game-on sound for room:', matchId);

      // Mark as played immediately to prevent any re-triggers
      sessionStorage.setItem(storageKey, 'true');

      // Attempt to play
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[MATCH_START_SOUND] Sound played successfully');
            setShowSoundBanner(false);
          })
          .catch((error) => {
            console.log('[MATCH_START_SOUND] Autoplay blocked, showing banner:', error);
            setShowSoundBanner(true);
          });
      }
    }
  }, [matchId, room?.status, room?.player1_id, room?.player2_id]);

  const handleEnableSound = () => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          console.log('[MATCH_START_SOUND] Sound enabled by user');
          setShowSoundBanner(false);
        })
        .catch((error) => {
          console.error('[MATCH_START_SOUND] Failed to play after user interaction:', error);
        });
    }
  };

  // Clear stale state when room not found
  useEffect(() => {
    if (!loading && !room && !hasCleanedStaleState.current) {
      console.log('[STALE_STATE] Room not found, clearing stale match state once');
      hasCleanedStaleState.current = true;
      clearStaleMatchState();
    }
  }, [loading, room]);

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

  // Load trust rating data when match ends
  useEffect(() => {
    async function loadTrustRating() {
      if (!opponentId || !currentUserId || !matchState?.endedReason) return;

      try {
        // Fetch opponent's profile to get their trust rating
        const { data: opponentProfile } = await supabase
          .from('profiles')
          .select('trust_rating_letter, trust_rating_count')
          .eq('id', opponentId)
          .maybeSingle();

        if (opponentProfile) {
          setOpponentTrustRating({
            letter: opponentProfile.trust_rating_letter || 'C',
            count: opponentProfile.trust_rating_count || 0
          });
        }

        // Fetch user's previous rating of this opponent
        const { data: existingRating } = await supabase
          .from('trust_ratings')
          .select('rating')
          .eq('rater_user_id', currentUserId)
          .eq('ratee_user_id', opponentId)
          .maybeSingle();

        if (existingRating) {
          setMyRatingOfOpponent(existingRating.rating);
          setSelectedRating(existingRating.rating);
        }
      } catch (error) {
        console.error('[TRUST_RATING] Failed to load trust rating:', error);
      }
    }

    loadTrustRating();
  }, [opponentId, currentUserId, matchState?.endedReason]);

  async function initializeMatch() {
    try {
      // Check if we've already attempted to load this match
      if (hasAttemptedMatch(matchId)) {
        console.log('[MATCH_LOAD] Already attempted to load this match, preventing retry');
        return;
      }

      // Mark this match as attempted
      markMatchAttempted(matchId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      const matchLoaded = await loadMatchData();

      // Check if room was loaded successfully
      if (!matchLoaded) {
        console.error('[MATCH_LOAD] Match room not found, cleaning up and navigating away');

        // Clear all match-related storage
        // Show user-friendly message
        toast.error('Match no longer available');

        // Navigate to play page
        await clearMatchState(matchId);
        router.push('/app/play');
        return;
      }

      const cleanup = setupRealtimeSubscriptions();

      return cleanup;
    } catch (error: any) {
      console.error('Initialization error:', error);
      toast.error(`Error: ${error.message}`);

      // Clean up storage on error as well
      await clearMatchState(matchId);
      router.push('/app/play');
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

    if (roomError) {
      console.error('[MATCH_ROOM_LOAD] Failed to load room:', roomError);
      toast.error(`Failed to load match room: ${roomError.message}`);
      return false;
    }

    if (!roomData) {
      console.error('[MATCH_ROOM_LOAD] No room data returned (match not found)');
      return false;
    }

    setRoom(roomData);

    if (roomData.status === 'finished') {
      setShowMatchCompleteModal(true);
    }

    const playerIds = [roomData.player1_id, roomData.player2_id].filter(Boolean);

    if (playerIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, username, trust_rating_letter')
        .in('user_id', playerIds);

      if (profilesError) {
        console.error('[MATCH_ROOM_LOAD] Failed to load profiles:', profilesError);
        toast.error(`Failed to load player profiles: ${profilesError.message}`);
      } else if (profilesData) {
        setProfiles(profilesData);

        // Set opponent trust rating for display
        const opponent = profilesData.find(p => p.user_id !== currentUserId);
        if (opponent) {
          setOpponentTrustRating({
            letter: opponent.trust_rating_letter || 'C',
            count: 0
          });
        }
      }
    }

    const { data: eventsData } = await supabase
      .from('match_events')
      .select('*')
      .eq('room_id', matchId)
      .order('seq', { ascending: true });

    setEvents(eventsData || []);
    return true;
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

          // Handle forfeit signals
          if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
            console.log('[SIGNALS] Opponent forfeited, showing modal');
            setShowOpponentForfeitSignalModal(true);

            // Cleanup after short delay to allow modal to show
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
      supabase.removeChannel(signalsChannel);
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
        .maybeSingle();

      if (roomError || !roomData) {
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
        toast.error(`Failed to forfeit: ${errorMsg}`);
        setDidIForfeit(false);
        setForfeitLoading(false);
        return;
      }

      console.log('[FORFEIT] Match forfeited successfully');

      // Send forfeit signal to opponent
      if (opponentId) {
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
      }

      toast.success('Match forfeited');

      // Cleanup and navigate
      if (cleanupMatchRef.current) {
        cleanupMatchRef.current();
      }
      await clearMatchState(matchId);
      router.push('/app/play');
    } catch (error: any) {
      console.error('[FORFEIT] Failed to forfeit:', error);
      toast.error(`Failed to forfeit: ${error.message}`);
      setDidIForfeit(false);
      setForfeitLoading(false);
    }
  }

  const handleTrustRating = async (rating: string) => {
    if (!opponentId || ratingLoading || hasSubmittedRating) return;

    setRatingLoading(true);

    try {
      console.log('[TRUST_RATING] Submitting rating:', rating, 'for opponent:', opponentId);

      const { data, error } = await supabase.rpc('rpc_set_trust_rating', {
        p_room_id: matchId,
        p_opponent_user_id: opponentId,
        p_rating: rating
      });

      console.log('[TRUST_RATING] RPC response:', data);

      if (error) {
        console.error('[TRUST_RATING] RPC error:', error);
        toast.error("Couldn't save trust rating. Try again.");
        setRatingLoading(false);
        return;
      }

      if (!data || data.ok === false) {
        const errorMsg = data?.error || "Couldn't save trust rating";
        console.error('[TRUST_RATING] RPC returned error:', errorMsg);
        toast.error("Couldn't save trust rating. Try again.");
        setRatingLoading(false);
        return;
      }

      console.log('[TRUST_RATING] Rating saved successfully');
      toast.success('Rating saved');
      setSelectedRating(rating);
      setMyRatingOfOpponent(rating);
      setHasSubmittedRating(true);

      // Refresh opponent's trust rating to show updated badge
      const { data: opponentProfile } = await supabase
        .from('profiles')
        .select('trust_rating_letter, trust_rating_count, trust_rating_avg')
        .eq('id', opponentId)
        .maybeSingle();

      if (opponentProfile) {
        console.log('[TRUST_RATING] Updated opponent trust rating:', opponentProfile);
        setOpponentTrustRating({
          letter: opponentProfile.trust_rating_letter,
          count: opponentProfile.trust_rating_count || 0
        });
      }
    } catch (error: any) {
      console.error('[TRUST_RATING] Failed to save rating:', error);
      toast.error("Couldn't save trust rating. Try again.");
    } finally {
      setRatingLoading(false);
    }
  };

  const handleSkipRating = () => {
    console.log('[TRUST_RATING] User skipped rating');
    setHasSubmittedRating(true);
    setSelectedRating(null);
  };

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

  const handleReturnToApp = async () => {
    await clearMatchState(matchId);
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
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex flex-col">
      {showSoundBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-emerald-600 text-white px-4 py-2 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">Tap to enable match sound</span>
          <Button
            size="sm"
            onClick={handleEnableSound}
            className="bg-white text-emerald-600 hover:bg-emerald-50 ml-4"
          >
            Enable Sound
          </Button>
        </div>
      )}

      {/* Forfeit Button - Top Right */}
      <div className="absolute top-3 right-3 z-10 flex items-center space-x-3">
        {isConnected ? (
          <Wifi className="w-4 h-4 text-emerald-400" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-400" />
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowEndMatchDialog(true)}
          disabled={forfeitLoading}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 bg-slate-900/80 backdrop-blur-sm"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Forfeit
        </Button>
      </div>

      {/* Top Row: Best of X + Player Score Cards */}
      <MatchHUDTop
        bestOf={matchState.matchFormat.replace('best-of-', 'Best of ')}
        myPlayer={{
          name: myName,
          remaining: myRemaining,
          average: myAvg,
          legsWon: myLegs,
          isActive: isMyTurn,
          isMe: true,
        }}
        opponentPlayer={{
          name: opponentName,
          remaining: opponentRemaining,
          average: opponentAvg,
          legsWon: opponentLegs,
          isActive: !isMyTurn,
          isMe: false,
        }}
        legsToWin={matchState.legsToWin}
      />

      {/* Main Row: Camera Panel (left) + Turn Panel (right) */}
      <div className="flex-1 grid grid-cols-2 gap-4 px-4 pb-4 min-h-0" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
        <MatchCameraPanel
          liveVideoRef={liveVideoRef}
          localStream={localStream}
          remoteStream={remoteStream}
          isMyTurn={isMyTurn}
          myName={myName}
          opponentName={opponentName}
          callStatus={callStatus}
          isCameraOn={isCameraOn}
          isMicMuted={isMicMuted}
          isVideoDisabled={isVideoDisabled}
          toggleCamera={toggleCamera}
          toggleMic={toggleMic}
          toggleVideo={toggleVideo}
        />

        <MatchTurnPanel
          isMyTurn={isMyTurn}
          scoreInput={scoreInput}
          setScoreInput={setScoreInput}
          inputModeError={inputModeError}
          setInputModeError={setInputModeError}
          handleInputScoreSubmit={handleInputScoreSubmit}
          submitting={submitting}
          isOnCheckout={isOnCheckout}
          myRemaining={myRemaining}
          checkoutOptions={checkoutOptions}
          currentVisit={currentVisit}
          getDartLabel={getDartLabel}
          visitTotal={visitTotal}
          dartboardGroup={dartboardGroup}
          setDartboardGroup={setDartboardGroup}
          handleDartClick={handleDartClick}
          handleClearVisit={handleClearVisit}
          handleSubmitVisit={handleSubmitVisit}
          handleBust={handleBust}
          visitHistory={matchState.visitHistory}
          handleEditVisit={handleEditVisit}
        />
      </div>

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

      <Dialog open={showOpponentForfeitSignalModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white text-center">
              Opponent forfeited the match.
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <Button
              onClick={async () => {
                setShowOpponentForfeitSignalModal(false);
                if (cleanupMatchRef.current) {
                  cleanupMatchRef.current();
                }
                await clearMatchState(matchId);
                router.push('/app/play');
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
            >
              Return
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
