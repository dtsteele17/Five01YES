'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { LogOut, Wifi, WifiOff, UserPlus, Video, VideoOff, Mic, MicOff, Camera, CameraOff, Edit2, Trash2, RotateCcw, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mapRoomToMatchState, type MappedMatchState } from '@/lib/match/mapRoomToMatchState';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';
import { clearMatchState } from '@/lib/utils/match-resume';
import { getTrustRatingDescription, getUnratedLabel } from '@/lib/utils/trust-rating';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';
import { MatchChatDrawer } from '@/components/match/MatchChatDrawer';
import { Separator } from '@/components/ui/separator';
import { WinnerPopup } from '@/components/game/WinnerPopup';
import { createClient } from '@/lib/supabase/client';
import { useMatchAcceptance } from '@/lib/hooks/useMatchAcceptance';
import { RematchModal } from '@/components/match/RematchModal';
import { MatchBottomBar } from '@/components/match/MatchBottomBar';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  double_out: boolean;
  player1_legs: number;
  player2_legs: number;
  source: string;
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
  darts: { n: number; mult: string }[];
  darts_thrown: number;
  darts_at_double: number;
  is_bust: boolean;
  bust_reason: string | null;
  is_checkout: boolean;
  created_at: string;
}

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
  is_double?: boolean;
}

interface LegEvent {
  id: string;
  player_id: string;
  seq: number;
  event_type: 'visit' | 'leg_start' | 'leg_end';
  payload: {
    score?: number;
    remaining?: number;
    is_bust?: boolean;
    is_checkout?: boolean;
    leg?: number;
    winner_id?: string;
  };
  created_at: string;
}

export default function QuickMatchPage() {
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

  // Match end stats state - stores player1 and player2 data with winner info
  const [matchEndStats, setMatchEndStats] = useState<{
    player1: { id: string; name: string; legs: number };
    player2: { id: string; name: string; legs: number };
    player1FullStats: any;
    player2FullStats: any;
    winnerId: string;
  } | null>(null);

  // Rematch state - simplified and more reliable
  const [rematchStatus, setRematchStatus] = useState<'none' | 'waiting' | 'ready' | 'creating'>('none');
  const [opponentRematchReady, setOpponentRematchReady] = useState(false);
  const [newRematchRoomId, setNewRematchRoomId] = useState<string | null>(null);
  const rematchAttemptedRef = useRef(false);
  
  // Track if stats have been saved to prevent duplicates
  const statsSavedRef = useRef(false);

  const cleanupMatchRef = useRef<() => void>();
  
  // Navigate to rematch room when set
  useEffect(() => {
    if (newRematchRoomId && newRematchRoomId !== matchId) {
      console.log('[REMATCH] Auto-navigating to:', newRematchRoomId);
      window.location.href = `/app/play/quick-match/match/${newRematchRoomId}`;
    }
  }, [newRematchRoomId, matchId]);

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
    isCameraOn,
    isMicMuted,
    isVideoDisabled,
    callStatus,
    toggleCamera,
    toggleMic,
    toggleVideo,
    stopCamera,
    liveVideoRef
  } = webrtc;

  cleanupMatchRef.current = () => {
    stopCamera('match cleanup');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`match_context_${matchId}`);
      sessionStorage.removeItem(`lobby_id_${matchId}`);
    }
  };

  // State for UI
  const [gameMode, setGameMode] = useState<'scoring' | 'darts'>('scoring');
  const [scoreInput, setScoreInput] = useState('');
  const [currentDarts, setCurrentDarts] = useState<Dart[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [forfeitLoading, setForfeitLoading] = useState(false);
  const [didIForfeit, setDidIForfeit] = useState(false);
  const [showOpponentForfeitModal, setShowOpponentForfeitModal] = useState(false);
  const [showOpponentForfeitSignalModal, setShowOpponentForfeitSignalModal] = useState(false);
  const [currentLeg, setCurrentLeg] = useState(1);
  
  // Edit state
  const [editingVisit, setEditingVisit] = useState<QuickMatchVisit | null>(null);
  const [editScore, setEditScore] = useState('');
  const [editDarts, setEditDarts] = useState<Dart[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  
  // Notification state for opponent editing
  const [editNotification, setEditNotification] = useState<{
    show: boolean;
    playerName: string;
    oldScore: number;
    newScore: number;
  } | null>(null);
  
  // Chat drawer
  const [chatOpen, setChatOpen] = useState(false);

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    getUser();
  }, [supabase]);

  // Load room data
  useEffect(() => {
    if (!matchId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const success = await fetchRoomData();
        if (success) {
          setupRealtimeSubscriptions();
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Cleanup
    return () => {
      cleanupMatchRef.current?.();
    };
  }, [matchId]);

  // Calculate BEST LEG (fewest darts thrown in a winning leg)
  const calculateBestLeg = (playerId: string, visitData: QuickMatchVisit[]) => {
    const playerVisits = visitData.filter(v => v.player_id === playerId && !v.is_bust);
    
    // Group visits by leg
    const visitsByLeg = new Map<number, typeof playerVisits>();
    for (const visit of playerVisits) {
      if (!visitsByLeg.has(visit.leg)) {
        visitsByLeg.set(visit.leg, []);
      }
      visitsByLeg.get(visit.leg)!.push(visit);
    }
    
    // Find the leg with fewest darts (that had a checkout)
    let bestLegDarts = Infinity;
    let bestLegNum = 0;
    
    for (const [legNum, legVisits] of visitsByLeg) {
      const hasCheckout = legVisits.some(v => v.is_checkout);
      if (hasCheckout) {
        const legDarts = legVisits.reduce((sum, v) => sum + v.darts_thrown, 0);
        if (legDarts < bestLegDarts) {
          bestLegDarts = legDarts;
          bestLegNum = legNum;
        }
      }
    }
    
    return {
      darts: bestLegDarts === Infinity ? 0 : bestLegDarts,
      legNum: bestLegNum
    };
  };

  // Calculate player stats from provided visits array (for accurate calculation)
  const calculatePlayerStatsFromVisits = (visitData: QuickMatchVisit[], playerId: string, playerName: string, legsWon: number) => {
    const playerVisits = visitData.filter(v => v.player_id === playerId && !v.is_bust);
    
    const totalDarts = playerVisits.reduce((sum, v) => sum + v.darts_thrown, 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    // Calculate FIRST 9 DART AVERAGE (first 3 visits, max 9 darts)
    let first9Score = 0;
    let first9Darts = 0;
    for (const visit of playerVisits.slice(0, 3)) {
      first9Score += visit.score;
      first9Darts += visit.darts_thrown;
      if (first9Darts >= 9) break;
    }
    const first9Average = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;
    
    // Find highest checkout (even for losing players - they might have won some legs)
    const checkouts = playerVisits.filter(v => v.is_checkout);
    const highestCheckout = checkouts.length > 0 
      ? Math.max(...checkouts.map(v => v.score))
      : 0;
    
    // Calculate checkout percentage
    const checkoutAttempts = playerVisits.filter(v => v.remaining_before <= 170 && v.remaining_before > 0).length;
    const successfulCheckouts = checkouts.length;
    const checkoutPercentage = checkoutAttempts > 0 
      ? (successfulCheckouts / checkoutAttempts) * 100 
      : 0;
    
    // Calculate BEST LEG (fewest darts to win a leg)
    const bestLeg = calculateBestLeg(playerId, visitData);
    
    // Count 100+, 140+, and 180s
    const count100Plus = playerVisits.filter(v => v.score >= 100 && v.score < 140).length;
    const count140Plus = playerVisits.filter(v => v.score >= 140 && v.score < 180).length;
    const oneEighties = playerVisits.filter(v => v.score === 180).length;
    
    return {
      id: playerId,
      name: playerName,
      legsWon,
      threeDartAverage,
      first9Average,
      highestCheckout,
      checkoutPercentage,
      totalDartsThrown: totalDarts,
      bestLegDarts: bestLeg.darts,
      bestLegNum: bestLeg.legNum,
      totalScore: totalScored,
      checkouts: successfulCheckouts,
      checkoutAttempts,
      count100Plus,
      count140Plus,
      oneEighties,
    };
  };

  // Calculate player stats from visits - for FINISHED match (all legs)
  const calculatePlayerStats = (playerId: string, playerName: string, legsWon: number, extraVisit?: any) => {
    let playerVisits = visits.filter(v => v.player_id === playerId && !v.is_bust);
    
    // Add extra visit if provided (for when match just ended)
    if (extraVisit && extraVisit.player_id === playerId && !extraVisit.is_bust) {
      playerVisits = [...playerVisits, extraVisit];
    }
    
    const totalDarts = playerVisits.reduce((sum, v) => sum + v.darts_thrown, 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    // Calculate FIRST 9 DART AVERAGE (first 3 visits, max 9 darts)
    let first9Score = 0;
    let first9Darts = 0;
    for (const visit of playerVisits.slice(0, 3)) {
      first9Score += visit.score;
      first9Darts += visit.darts_thrown;
      if (first9Darts >= 9) break;
    }
    const first9Average = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;
    
    // Find highest checkout (even for losing players - they might have won some legs)
    const checkouts = playerVisits.filter(v => v.is_checkout);
    const highestCheckout = checkouts.length > 0 
      ? Math.max(...checkouts.map(v => v.score))
      : 0;
    
    // Calculate checkout percentage
    const checkoutAttempts = playerVisits.filter(v => v.remaining_before <= 170 && v.remaining_before > 0).length;
    const successfulCheckouts = checkouts.length;
    const checkoutPercentage = checkoutAttempts > 0 
      ? (successfulCheckouts / checkoutAttempts) * 100 
      : 0;
    
    // Calculate BEST LEG (fewest darts to win a leg)
    const bestLeg = calculateBestLeg(playerId, visits);
    // If this was the winning leg and extraVisit provided, check if it's the best
    if (extraVisit && extraVisit.player_id === playerId && extraVisit.is_checkout) {
      const currentLegDarts = playerVisits
        .filter(v => v.leg === extraVisit.leg)
        .reduce((sum, v) => sum + v.darts_thrown, 0);
      if (currentLegDarts < bestLeg.darts || bestLeg.darts === 0) {
        bestLeg.darts = currentLegDarts;
        bestLeg.legNum = extraVisit.leg;
      }
    }
    
    return {
      id: playerId,
      name: playerName,
      legsWon,
      threeDartAverage,
      first9Average,
      highestCheckout,
      checkoutPercentage,
      totalDartsThrown: totalDarts,
      bestLegDarts: bestLeg.darts,
      bestLegNum: bestLeg.legNum,
      totalScore: totalScored,
      checkouts: successfulCheckouts,
      checkoutAttempts,
    };
  };

  // Wrapper for winner that includes the final visit
  const calculatePlayerStatsWithVisit = (playerId: string, playerName: string, legsWon: number, extraVisit: any) => {
    return calculatePlayerStats(playerId, playerName, legsWon, extraVisit);
  };

  // Calculate leg wins from visits (fallback if DB columns don't exist)
  const calculateLegWinsFromVisits = () => {
    const p1Checkouts = visits.filter(v => v.player_id === room?.player1_id && v.is_checkout);
    const p2Checkouts = visits.filter(v => v.player_id === room?.player2_id && v.is_checkout);
    return {
      p1: p1Checkouts.length,
      p2: p2Checkouts.length
    };
  };

  // Update match state when room/visits/profiles change
  useEffect(() => {
    if (room && profiles.length > 0) {
      const eventsFromVisits = visits.map(v => ({
        id: v.id,
        player_id: v.player_id,
        seq: v.turn_no,
        event_type: 'visit' as const,
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

  async function fetchRoomData() {
    // Get room data
    const { data: roomData, error: roomError } = await supabase
      .from('match_rooms')
      .select('*')
      .eq('id', matchId)
      .single();

    if (roomError || !roomData) {
      console.error('[LOAD] Error loading room:', roomError);
      toast.error('Failed to load match');
      return false;
    }

    console.log('[LOAD] Room loaded:', {
      id: roomData.id,
      p1: roomData.player1_id,
      p2: roomData.player2_id,
      status: roomData.status,
      p1_legs: roomData.player1_legs,
      p2_legs: roomData.player2_legs,
      legs_to_win: roomData.legs_to_win,
      winner_id: roomData.winner_id
    });
    
    setRoom(roomData as MatchRoom);

    // Load visits for ALL legs ordered by leg and turn_no
    const { data: visitsData, error: visitsError } = await supabase
      .from('quick_match_visits')
      .select('*')
      .eq('room_id', matchId)
      .order('leg', { ascending: true })
      .order('turn_no', { ascending: true });

    console.log('[LOAD] Visits loaded:', visitsData?.length || 0, 'Error:', visitsError);
    console.log('[LOAD] Room leg:', roomData.current_leg, 'Match ID:', matchId);
    console.log('[LOAD] Visits data:', visitsData);
    setVisits((visitsData as QuickMatchVisit[]) || []);

    const playerIds = [roomData.player1_id, roomData.player2_id].filter(Boolean);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, trust_rating_letter')
      .in('user_id', playerIds);

    setProfiles((profilesData as Profile[]) || []);
    return true;
  }

  function setupRealtimeSubscriptions() {
    const roomChannel = supabase
      .channel(`room_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_rooms', filter: `id=eq.${matchId}` },
        (payload) => {
          const updatedRoom = payload.new as MatchRoom;
          console.log('[ROOM] Realtime update:', updatedRoom);
          
          setRoom(prev => prev ? { ...prev, ...updatedRoom } : updatedRoom);
          
          // Handle match finished - show winner popup
          if (updatedRoom.status === 'finished' && updatedRoom.winner_id && !matchEndStats) {
            (async () => {
              console.log('[ROOM] Match finished detected, showing winner popup');
              
              const winnerId = updatedRoom.winner_id;
              const isPlayer1Winner = winnerId === updatedRoom.player1_id;
              const loserId = isPlayer1Winner ? updatedRoom.player2_id : updatedRoom.player1_id;
              
              // Ensure profiles are loaded - fetch if needed
              let currentProfiles = profiles;
              if (currentProfiles.length === 0) {
                const playerIds = [updatedRoom.player1_id, updatedRoom.player2_id].filter(Boolean);
                const { data: profilesData } = await supabase
                  .from('profiles')
                  .select('user_id, username, trust_rating_letter')
                  .in('user_id', playerIds);
                currentProfiles = (profilesData as Profile[]) || [];
                setProfiles(currentProfiles);
              }
              
              const winnerProfile = currentProfiles.find(p => p.user_id === winnerId);
              const loserProfile = currentProfiles.find(p => p.user_id === loserId);
              
              // Fetch ALL visits from database to ensure we have complete data for both players
              const { data: allVisits } = await supabase
                .from('quick_match_visits')
                .select('*')
                .eq('room_id', matchId)
                .order('leg', { ascending: true })
                .order('turn_no', { ascending: true });
              
              // Temporarily update visits state for accurate calculation
              const completeVisits = (allVisits as QuickMatchVisit[]) || visits;
              
              // Calculate legs from visits (count checkouts per player)
              const p1LegsFromVisits = completeVisits.filter(v => v.player_id === updatedRoom.player1_id && v.is_checkout).length;
              const p2LegsFromVisits = completeVisits.filter(v => v.player_id === updatedRoom.player2_id && v.is_checkout).length;
              
              // Use visit count if available (more accurate), otherwise fall back to room data
              // Note: Use > 0 check because 0 is a valid leg count
              const p1Legs = p1LegsFromVisits > 0 ? p1LegsFromVisits : (updatedRoom.player1_legs || 0);
              const p2Legs = p2LegsFromVisits > 0 ? p2LegsFromVisits : (updatedRoom.player2_legs || 0);
              
              console.log('[MATCH END] Legs calculated:', { p1Legs, p2Legs, p1LegsFromVisits, p2LegsFromVisits, roomP1Legs: updatedRoom.player1_legs, roomP2Legs: updatedRoom.player2_legs });
              
              // Calculate stats for both players using complete visits
              const wStats = calculatePlayerStatsFromVisits(
                completeVisits,
                winnerId,
                winnerProfile?.username || 'Winner',
                isPlayer1Winner ? p1Legs : p2Legs
              );
              const lStats = calculatePlayerStatsFromVisits(
                completeVisits,
                loserId,
                loserProfile?.username || 'Loser',
                isPlayer1Winner ? p2Legs : p1Legs
              );
              
              // Update visits state to match
              setVisits(completeVisits);
              
              // Determine player1 and player2 based on room data
              const p1Id = updatedRoom.player1_id;
              const p2Id = updatedRoom.player2_id;
              const p1Profile = currentProfiles.find(p => p.user_id === p1Id);
              const p2Profile = currentProfiles.find(p => p.user_id === p2Id);
              
              console.log('[MATCH END] Setting match end stats:', { p1Legs, p2Legs, winnerId });
              
              setMatchEndStats({
                player1: { id: p1Id, name: p1Profile?.username || 'Player 1', legs: p1Legs },
                player2: { id: p2Id, name: p2Profile?.username || 'Player 2', legs: p2Legs },
                player1FullStats: p1Id === winnerId ? wStats : lStats,
                player2FullStats: p2Id === winnerId ? wStats : lStats,
                winnerId: winnerId,
              });
              
              // Only save stats if this is the current user (prevents double saving from realtime)
              if (currentUserId === winnerId && !statsSavedRef.current) {
                await saveMatchStats(matchId, winnerId, loserId, isPlayer1Winner ? p1Legs : p2Legs, isPlayer1Winner ? p2Legs : p1Legs, updatedRoom.game_mode);
              }
            })();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const newVisit = payload.new as QuickMatchVisit;
          // Add all visits - the VisitHistoryPanel will filter by currentLeg
          setVisits((prev) => {
            const exists = prev.find(v => v.id === newVisit.id);
            if (exists) return prev;
            return [...prev, newVisit];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const updatedVisit = payload.new as QuickMatchVisit;
          
          // Get old visit from current state to compare scores
          setVisits((prev) => {
            const oldVisit = prev.find(v => v.id === updatedVisit.id);
            
            // Show notification if another player edited their visit and score changed
            if (oldVisit && updatedVisit.player_id !== currentUserId && oldVisit.score !== updatedVisit.score) {
              const player = profiles.find(p => p.user_id === updatedVisit.player_id);
              setEditNotification({
                show: true,
                playerName: player?.username || 'Opponent',
                oldScore: oldVisit.score,
                newScore: updatedVisit.score,
              });
              // Hide after 2 seconds
              setTimeout(() => setEditNotification(null), 2000);
            }
            
            return prev.map((v) => (v.id === updatedVisit.id ? updatedVisit : v));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setVisits((prev) => prev.filter((v) => v.id !== deletedId));
        }
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRED'));

    const signalsChannel = supabase
      .channel(`signals_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_signals', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const signal = payload.new as any;
          if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
            setShowOpponentForfeitSignalModal(true);
            setTimeout(() => cleanupMatchRef.current?.(), 100);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(signalsChannel);
    };
  }

  // Submit visit
  async function submitVisit() {
    if (!room || !currentUserId || submitting) return;
    if (room.status !== 'active') {
      toast.error('Match is not active');
      return;
    }

    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0 || score > 180) {
      toast.error('Enter a valid score (0-180)');
      return;
    }

    // Determine if this would be a bust
    const isPlayer1 = currentUserId === room.player1_id;
    const currentRemaining = isPlayer1 ? room.player1_remaining : room.player2_remaining;
    const newRemaining = currentRemaining - score;
    
    // Check for bust conditions
    let isBust = false;
    let bustReason: string | undefined;
    
    if (newRemaining < 0) {
      isBust = true;
      bustReason = 'below_zero';
    } else if (newRemaining === 1 && room.double_out) {
      isBust = true;
      bustReason = 'left_on_one';
    }

    // Build darts array for the RPC
    const darts: Dart[] = [];
    let remaining = score;
    
    // Simple dart breakdown for the RPC
    while (remaining > 0 && darts.length < 3) {
      if (remaining >= 60) {
        darts.push({ type: 'triple', number: 20, value: 60 });
        remaining -= 60;
      } else if (remaining >= 40) {
        darts.push({ type: 'double', number: 20, value: 40 });
        remaining -= 40;
      } else if (remaining >= 20) {
        darts.push({ type: 'single', number: 20, value: 20 });
        remaining -= 20;
      } else {
        darts.push({ type: 'single', number: remaining, value: remaining });
        remaining = 0;
      }
    }

    // Pad to 3 darts if needed
    while (darts.length < 3) {
      darts.push({ type: 'single', number: 0, value: 0 });
    }

    setSubmitting(true);

    try {
      console.log('[SUBMIT] Calling rpc_quick_match_submit_visit_v3...');

      const { data, error } = await supabase.rpc("rpc_quick_match_submit_visit_v3", {
        p_room_id: matchId,
        p_score: score,
        p_darts: darts.map(d => ({ n: d.number, mult: d.type === 'double' ? 'D' : d.type === 'triple' ? 'T' : 'S' })),
        p_is_bust: isBust
      });

      console.log('[SUBMIT] RPC returned', { data, error });

      if (error) {
        console.error('[SUBMIT] Supabase RPC error:', error);
        toast.error(error.message || 'Failed to submit');
        return;
      }

      if (!data?.ok) {
        console.error('[SUBMIT] RPC returned error:', data?.error);
        toast.error(data?.error || 'Failed to submit visit');
        return;
      }

      console.log('[SUBMIT] Success! is_checkout:', data.is_checkout, 'match_won:', data.match_won);

      // Clear input
      setScoreInput('');
      setCurrentDarts([]);

      // Check if match was won
      if (data.match_won) {
        console.log('[SUBMIT] MATCH WON!');
        toast.success('🏆 MATCH WON!');
        
        const winnerId = currentUserId;
        const isPlayer1Winner = winnerId === room.player1_id;
        
        const winnerProfile = profiles.find(p => p.user_id === winnerId);
        const loserId = isPlayer1Winner ? room.player2_id : room.player1_id;
        const loserProfile = profiles.find(p => p.user_id === loserId);
        
        // Get current leg counts
        const currentP1Legs = room.player1_legs || 0;
        const currentP2Legs = room.player2_legs || 0;
        const isPlayer1 = currentUserId === room.player1_id;
        
        // Add the leg we just won
        const newP1Legs = isPlayer1 ? currentP1Legs + 1 : currentP1Legs;
        const newP2Legs = !isPlayer1 ? currentP2Legs + 1 : currentP2Legs;
        const legsToWin = room.legs_to_win || 1;
        
        // Check if match is won (either from RPC response or our calculation)
        const isMatchWon = data.match_won || newP1Legs >= legsToWin || newP2Legs >= legsToWin;
        
        console.log('[SUBMIT] Checking match win - P1 legs:', newP1Legs, 'P2 legs:', newP2Legs, 
                    'Legs to win:', legsToWin, 'IsMatchWon:', isMatchWon, 'RPC match_won:', data.match_won);
        
        if (isMatchWon) {
          console.log('[SUBMIT] MATCH WON!');
          toast.success('🏆 MATCH WON!');
          
          const winnerId = currentUserId;
          const isPlayer1Winner = winnerId === room.player1_id;
          
          const winnerProfile = profiles.find(p => p.user_id === winnerId);
          const loserId = isPlayer1Winner ? room.player2_id : room.player1_id;
          const loserProfile = profiles.find(p => p.user_id === loserId);
          
          // Calculate winner and loser legs
          const winnerLegs = isPlayer1Winner ? newP1Legs : newP2Legs;
          const loserLegs = isPlayer1Winner ? newP2Legs : newP1Legs;
          
          // Fetch ALL visits from database to ensure accurate stats for both players
          const { data: allVisits } = await supabase
            .from('quick_match_visits')
            .select('*')
            .eq('room_id', matchId)
            .order('leg', { ascending: true })
            .order('turn_no', { ascending: true });
          
          // Create the final winning visit
          const finalVisit: QuickMatchVisit = {
            id: 'temp-' + Date.now(),
            room_id: matchId,
            player_id: currentUserId,
            leg: room.current_leg,
            turn_no: 999,
            score: isBust ? 0 : score,
            remaining_before: isPlayer1 ? room.player1_remaining : room.player2_remaining,
            remaining_after: data.remaining_after,
            darts: darts.map(d => ({ n: d.number, mult: d.type === 'bull' ? (d.value === 50 ? 'DB' : 'SB') : d.type === 'double' ? 'D' : d.type === 'triple' ? 'T' : 'S' })),
            darts_thrown: darts.length,
            darts_at_double: darts.filter(d => d.is_double).length,
            is_bust: isBust,
            is_checkout: true,
            created_at: new Date().toISOString()
          };
          
          const completeVisits = [...((allVisits as QuickMatchVisit[]) || visits), finalVisit];
          
          // Verify legs from visits (count checkouts per player) - more accurate than state
          const p1LegsFromVisits = completeVisits.filter(v => v.player_id === room.player1_id && v.is_checkout).length;
          const p2LegsFromVisits = completeVisits.filter(v => v.player_id === room.player2_id && v.is_checkout).length;
          
          // Use visit count if available (more accurate), otherwise fall back to calculated legs
          // Note: Use > 0 check because 0 is a valid leg count for the loser
          const finalP1Legs = p1LegsFromVisits > 0 ? p1LegsFromVisits : newP1Legs;
          const finalP2Legs = p2LegsFromVisits > 0 ? p2LegsFromVisits : newP2Legs;
          
          console.log('[MATCH END] Legs from visits:', { finalP1Legs, finalP2Legs, p1LegsFromVisits, p2LegsFromVisits });
          
          // Calculate stats for both players using complete visits
          const wStats = calculatePlayerStatsFromVisits(
            completeVisits,
            winnerId,
            winnerProfile?.username || 'Winner',
            isPlayer1Winner ? finalP1Legs : finalP2Legs
          );
          const lStats = calculatePlayerStatsFromVisits(
            completeVisits,
            loserId,
            loserProfile?.username || 'Loser',
            isPlayer1Winner ? finalP2Legs : finalP1Legs
          );
          
          // Update visits state
          setVisits(completeVisits);
          
          // Show winner popup immediately for the winner
          // Determine player1 and player2 based on room data
          const p1Id = room.player1_id;
          const p2Id = room.player2_id;
          const p1Profile = profiles.find(p => p.user_id === p1Id);
          const p2Profile = profiles.find(p => p.user_id === p2Id);
          
          console.log('[MATCH END] Setting winner popup stats:', { finalP1Legs, finalP2Legs, winnerId });
          
          setMatchEndStats({
            player1: { id: p1Id, name: p1Profile?.username || 'Player 1', legs: finalP1Legs },
            player2: { id: p2Id, name: p2Profile?.username || 'Player 2', legs: finalP2Legs },
            player1FullStats: p1Id === winnerId ? wStats : lStats,
            player2FullStats: p2Id === winnerId ? wStats : lStats,
            winnerId: winnerId,
          });
          
          // Save stats to database for both players using accurate leg counts
          const finalWinnerLegs = isPlayer1Winner ? finalP1Legs : finalP2Legs;
          const finalLoserLegs = isPlayer1Winner ? finalP2Legs : finalP1Legs;
          await saveMatchStats(matchId, winnerId, loserId, finalWinnerLegs, finalLoserLegs, room.game_mode);
          
          // Update room state
          setRoom({
            ...room,
            player1_legs: finalP1Legs,
            player2_legs: finalP2Legs,
            status: 'finished',
            winner_id: winnerId,
          });
        }
      } else if (isBust) {
        toast.error('💥 BUST!');
      }

      console.log('[SUBMIT] Submit completed successfully');
    } catch (error: any) {
      console.error('[SUBMIT] Unexpected error:', error);
      toast.error(error?.message || 'Failed to submit visit');
    } finally {
      setSubmitting(false);
      console.log('[SUBMIT] Submitting flag cleared');
    }
  }

  async function forfeitMatch() {
    if (!room || !matchState || !currentUserId) return;
    if (['completed', 'finished', 'forfeited'].includes(room.status)) {
      toast.error("Match already ended");
      setShowEndMatchDialog(false);
      return;
    }

    const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;
    if (!opponentId) return;

    setForfeitLoading(true);
    setDidIForfeit(true);
    setShowEndMatchDialog(false);

    try {
      const { data, error } = await supabase.rpc('rpc_forfeit_match', { p_room_id: matchId });
      if (error) throw error;

      if (!data?.ok) {
        toast.error(data?.error || "Couldn't forfeit");
        setDidIForfeit(false);
        return;
      }

      await supabase.from('match_signals').insert({
        room_id: matchId,
        from_user_id: currentUserId,
        to_user_id: opponentId,
        type: 'forfeit',
        payload: { reason: 'user_forfeit' }
      });

      toast.success('You forfeited the match');
      cleanupMatchRef.current?.();
      
      setTimeout(() => {
        router.push('/app/play');
      }, 1500);
    } catch (err: any) {
      console.error('Forfeit error:', err);
      toast.error(err.message || 'Failed to forfeit');
      setDidIForfeit(false);
    } finally {
      setForfeitLoading(false);
    }
  }

  // Simple rematch - when both players click, create room and navigate both
  const handleRematch = async () => {
    if (!room || !currentUserId || !matchEndStats || rematchAttemptedRef.current) return;
    
    const opponentId = matchEndStats.player1.id === currentUserId 
      ? matchEndStats.player2.id 
      : matchEndStats.player1.id;
    
    // Prevent double-clicks
    rematchAttemptedRef.current = true;
    setRematchStatus('waiting');
    
    try {
      // Send ready signal
      await supabase.from('match_signals').insert({
        room_id: matchId,
        from_user_id: currentUserId,
        to_user_id: opponentId,
        type: 'rematch_ready',
        payload: { ready: true, timestamp: Date.now() }
      });
      
      console.log('[REMATCH] Ready signal sent');
      
      // Check if both ready - if so, create room
      // Use a check function that queries the database
      await checkAndCreateRematchRoom(opponentId);
      
    } catch (error: any) {
      console.error('[REMATCH] Error:', error);
      setRematchStatus('none');
      rematchAttemptedRef.current = false;
      toast.error('Failed to start rematch');
    }
  };
  
  // Check if both players are ready and create room
  const checkAndCreateRematchRoom = async (opponentId: string) => {
    if (!room || !currentUserId) return;
    
    // Query for rematch ready signals
    const { data: signals } = await supabase
      .from('match_signals')
      .select('*')
      .eq('room_id', matchId)
      .eq('type', 'rematch_ready')
      .order('created_at', { ascending: false })
      .limit(10);
    
    const mySignal = signals?.find(s => s.from_user_id === currentUserId);
    const opponentSignal = signals?.find(s => s.from_user_id === opponentId);
    
    if (mySignal && opponentSignal) {
      // Both ready - create rematch room
      console.log('[REMATCH] Both players ready, creating room');
      setRematchStatus('creating');
      
      try {
        // Determine who creates the room (player1 from original match)
        const isPlayer1 = room.player1_id === currentUserId;
        
        if (isPlayer1) {
          // Create new room with same settings
          const { data: newRoom, error } = await supabase
            .from('match_rooms')
            .insert({
              player1_id: room.player1_id,
              player2_id: room.player2_id,
              game_mode: room.game_mode,
              match_format: room.match_format,
              match_type: room.match_type,
              double_out: room.double_out,
              legs_to_win: room.legs_to_win,
              status: 'active',
              current_leg: 1,
              player1_remaining: room.game_mode,
              player2_remaining: room.game_mode,
              current_turn: 'player1',
              player1_legs: 0,
              player2_legs: 0
            })
            .select()
            .single();
          
          if (error) throw error;
          
          console.log('[REMATCH] Room created:', newRoom.id);
          
          // Send room created signal
          await supabase.from('match_signals').insert({
            room_id: matchId,
            from_user_id: currentUserId,
            to_user_id: opponentId,
            type: 'rematch_created',
            payload: { new_room_id: newRoom.id }
          });
          
          setNewRematchRoomId(newRoom.id);
          setRematchStatus('ready');
        }
      } catch (error: any) {
        console.error('[REMATCH] Error creating room:', error);
        setRematchStatus('none');
        rematchAttemptedRef.current = false;
        toast.error('Failed to create rematch room');
      }
    } else if (mySignal && !opponentSignal) {
      // Only I'm ready, wait for opponent
      console.log('[REMATCH] Waiting for opponent');
      setOpponentRematchReady(false);
      
      // Poll for opponent signal
      setTimeout(() => checkAndCreateRematchRoom(opponentId), 1000);
    }
  };

  const handleReturn = () => {
    cleanupMatchRef.current?.();
    router.push('/app/play');
  };

  // Save match stats to database
  async function saveMatchStats(roomId: string, winnerId: string, loserId: string, winnerLegs: number, loserLegs: number, gameMode: number) {
    if (statsSavedRef.current) return;
    statsSavedRef.current = true;
    
    console.log('[STATS] Saving match stats:', { roomId, winnerId, loserId, winnerLegs, loserLegs });
    
    try {
      // Save winner stats
      const { data: winnerResult, error: winnerError } = await supabase.rpc('fn_update_player_match_stats', {
        p_room_id: roomId,
        p_user_id: winnerId,
        p_opponent_id: loserId,
        p_result: 'win',
        p_legs_won: winnerLegs,
        p_legs_lost: loserLegs,
        p_game_mode: gameMode
      });
      
      if (winnerError) {
        console.error('[STATS] Error saving winner stats:', winnerError);
      } else {
        console.log('[STATS] Winner stats saved:', winnerResult);
      }
      
      // Save loser stats
      const { data: loserResult, error: loserError } = await supabase.rpc('fn_update_player_match_stats', {
        p_room_id: roomId,
        p_user_id: loserId,
        p_opponent_id: winnerId,
        p_result: 'loss',
        p_legs_won: loserLegs,
        p_legs_lost: winnerLegs,
        p_game_mode: gameMode
      });
      
      if (loserError) {
        console.error('[STATS] Error saving loser stats:', loserError);
      } else {
        console.log('[STATS] Loser stats saved:', loserResult);
      }
    } catch (error) {
      console.error('[STATS] Error saving match stats:', error);
    }
  }

  // Render loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p>Loading match...</p>
        </div>
      </div>
    );
  }

  // Render match not found
  if (!room || !matchState) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">Match not found</p>
          <Button onClick={() => router.push('/app/play')}>Return to Play</Button>
        </div>
      </div>
    );
  }

  const isMyTurn = matchState.currentTurnPlayer === matchState.youArePlayer;
  const currentRemaining = matchState.youArePlayer === 1 
    ? matchState.player1.remaining 
    : matchState.player2.remaining;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => setShowEndMatchDialog(true)}>
              <LogOut className="w-4 h-4 mr-2" />
              Leave
            </Button>
            <div>
              <h1 className="text-white font-bold">Quick Match</h1>
              <p className="text-slate-400 text-sm">
                {room.game_mode} • Best of {room.legs_to_win * 2 - 1} • {room.double_out ? 'Double Out' : 'Straight Out'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isConnected ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                <Wifi className="w-3 h-3 mr-1" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                <WifiOff className="w-3 h-3 mr-1" />
                Offline
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - LAYOUT CHANGE: Camera on left full height, Player cards and scoring/visit history on right */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* LEFT: Camera - Full height like in screenshot 2 */}
        <Card className="bg-slate-800/50 border-white/10 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-white/5">
            <span className="text-xs text-gray-400">Camera</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={toggleCamera}>
                {isCameraOn ? <Camera className="w-3 h-3" /> : <CameraOff className="w-3 h-3" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={toggleMic}>
                {isMicMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          <div className="flex-1 relative">
            <video ref={liveVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        </Card>

        {/* RIGHT: Player Cards + Scoring Panel OR Visit History */}
        <div className="flex flex-col gap-4 overflow-hidden">
          
          {/* Player Cards - Compact horizontal like in screenshot 1 */}
          <div className="grid grid-cols-2 gap-2">
            <QuickMatchPlayerCard
              player={matchState.player1}
              isCurrentPlayer={matchState.currentTurnPlayer === 1}
              isYou={matchState.youArePlayer === 1}
              legsWon={matchState.player1.legsWon}
              gameMode={room.game_mode}
            />
            <QuickMatchPlayerCard
              player={matchState.player2}
              isCurrentPlayer={matchState.currentTurnPlayer === 2}
              isYou={matchState.youArePlayer === 2}
              legsWon={matchState.player2.legsWon}
              gameMode={room.game_mode}
            />
          </div>

          {/* Scoring Panel OR Visit History */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 overflow-hidden flex flex-col">
            {/* Scoring UI when it's my turn */}
            {isMyTurn && room.status === 'active' && (
              <div className="p-4 flex flex-col h-full">
                <div className="text-center mb-4">
                  <p className="text-gray-400 text-sm mb-1">Your Turn</p>
                  <p className="text-4xl font-bold text-white">{currentRemaining}</p>
                  <p className="text-gray-500 text-xs">remaining</p>
                </div>

                {/* Score Input */}
                <div className="flex gap-2 mb-4">
                  <Input
                    type="number"
                    value={scoreInput}
                    onChange={(e) => setScoreInput(e.target.value)}
                    placeholder="Enter score"
                    className="flex-1 bg-slate-700 border-slate-600 text-white text-center text-2xl h-14"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        submitVisit();
                      }
                    }}
                    disabled={submitting}
                  />
                  <Button 
                    onClick={submitVisit} 
                    disabled={submitting || !scoreInput}
                    className="h-14 px-6 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {submitting ? '...' : <Check className="w-5 h-5" />}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setScoreInput('')}
                    className="flex-1 border-slate-600"
                    disabled={submitting}
                  >
                    Clear
                  </Button>
                </div>

                {/* Checkout suggestions */}
                {currentRemaining <= 170 && currentRemaining > 0 && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                    <p className="text-emerald-400 text-xs mb-1">Checkout:</p>
                    <p className="text-white text-sm">
                      {currentRemaining === 170 ? 'T20 T20 DB' :
                       currentRemaining === 167 ? 'T20 T19 DB' :
                       currentRemaining === 164 ? 'T20 T18 DB' :
                       currentRemaining === 161 ? 'T20 T17 DB' :
                       currentRemaining === 160 ? 'T20 T20 D20' :
                       currentRemaining === 136 ? 'T20 T20 D8' :
                       currentRemaining === 120 ? 'T20 20 D20' :
                       currentRemaining === 100 ? 'T20 D20' :
                       currentRemaining === 80 ? 'T20 D10' :
                       currentRemaining === 60 ? '20 D20' :
                       currentRemaining === 40 ? 'D20' :
                       currentRemaining === 32 ? 'D16' :
                       currentRemaining === 24 ? 'D12' :
                       currentRemaining === 16 ? 'D8' :
                       currentRemaining === 8 ? 'D4' :
                       currentRemaining === 4 ? 'D2' :
                       currentRemaining === 2 ? 'D1' :
                       `Finish ${currentRemaining}`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Waiting message when not my turn */}
            {!isMyTurn && room.status === 'active' && (
              <div className="p-4 flex flex-col items-center justify-center h-full">
                <div className="animate-pulse text-center">
                  <p className="text-gray-400 mb-2">Opponent&apos;s turn</p>
                  <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center mx-auto">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            {/* Match finished state */}
            {room.status === 'finished' && (
              <div className="p-4 flex flex-col items-center justify-center h-full">
                <p className="text-2xl font-bold text-white mb-2">Match Finished</p>
                <p className="text-gray-400">
                  {room.winner_id === currentUserId ? '🏆 You won!' : 'Better luck next time!'}
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Winner Popup - shows when match is finished */}
      {matchEndStats && room?.status === 'finished' && (
        <WinnerPopup
          player1={matchEndStats.player1}
          player2={matchEndStats.player2}
          player1Stats={matchEndStats.player1FullStats}
          player2Stats={matchEndStats.player2FullStats}
          winnerId={matchEndStats.winnerId}
          gameMode={room?.game_mode?.toString() || '501'}
          bestOf={room?.legs_to_win ? room.legs_to_win * 2 - 1 : 1}
          onRematch={handleRematch}
          onReturn={handleReturn}
          rematchStatus={rematchStatus}
          opponentRematchReady={opponentRematchReady}
          youReady={rematchStatus === 'waiting' || rematchStatus === 'ready'}
          currentUserId={currentUserId || ''}
        />
      )}
    </div>
  );
}
