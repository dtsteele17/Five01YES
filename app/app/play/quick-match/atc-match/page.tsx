'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Target, Users, ArrowLeft, CheckCircle2, 
  Camera, CameraOff, Loader2, Trophy, X, RefreshCw,
  Zap, Crosshair, Wifi, WifiOff, RotateCcw, UserPlus
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';

// Types
interface Player {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
  current_target: number | 'bull';
  completed_targets: (number | 'bull')[];
  is_winner: boolean;
  visit_history?: Visit[];
  total_darts_thrown: number;
}

interface Visit {
  dart1?: { segment: string; number?: number; label: string };
  dart2?: { segment: string; number?: number; label: string };
  dart3?: { segment: string; number?: number; label: string };
  completed_target?: number | 'bull';
  timestamp: string;
}

interface ATCMatch {
  id: string;
  lobby_id: string;
  status: 'waiting' | 'starting' | 'in_progress' | 'completed';
  game_mode: string;
  atc_settings: {
    order: 'sequential' | 'random';
    mode: 'singles' | 'doubles' | 'trebles' | 'increase';
    player_count: number;
  };
  players: Player[];
  current_player_index: number;
  created_by: string;
  winner_id?: string;
}

// Utility functions
const getTargetLabel = (target: number | 'bull'): string => {
  if (target === 'bull') return 'BULL';
  return target.toString();
};

const generateTargets = (order: 'sequential' | 'random'): (number | 'bull')[] => {
  const targets: (number | 'bull')[] = [...Array(20)].map((_, i) => i + 1);
  targets.push('bull');
  
  if (order === 'random') {
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
  }
  
  return targets;
};

// Calculate next target based on hit type (for increase mode)
const calculateNextTarget = (
  currentTarget: number | 'bull',
  segment: string,
  allTargets: (number | 'bull')[]
): number | 'bull' | null => {
  if (currentTarget === 'bull') return null;
  
  const currentIndex = allTargets.indexOf(currentTarget);
  if (currentIndex === -1 || currentIndex >= allTargets.length - 1) {
    return null;
  }
  
  let advance = 1;
  if (segment === 'D') advance = 2;
  else if (segment === 'T') advance = 3;
  
  const nextIndex = Math.min(currentIndex + advance, allTargets.length - 1);
  return allTargets[nextIndex];
};

// Player Tile Component
function PlayerTile({ 
  player, 
  isCurrentPlayer, 
  isCurrentUser,
  progress 
}: { 
  player: Player; 
  isCurrentPlayer: boolean;
  isCurrentUser: boolean;
  progress: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl p-4 ${
        isCurrentPlayer 
          ? 'bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-emerald-500/5 border-2 border-emerald-500/50' 
          : 'bg-gradient-to-br from-slate-800/80 via-slate-800/50 to-slate-900/80 border-2 border-slate-700/50'
      }`}
    >
      {/* Animated background for current player */}
      {isCurrentPlayer && (
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-emerald-500/5 animate-pulse" />
      )}
      
      <div className="relative z-10">
        {/* Header with avatar and name */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
            isCurrentPlayer 
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-gradient-to-br from-slate-600 to-slate-700 text-slate-300'
          }`}>
            {player.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`font-bold text-lg ${isCurrentPlayer ? 'text-white' : 'text-slate-300'}`}>
                {player.username}
              </h3>
              {isCurrentUser && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                  You
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {isCurrentPlayer ? 'Currently Throwing' : 'Waiting'}
            </p>
          </div>
          {isCurrentPlayer && (
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
          )}
        </div>
        
        {/* Current Target - Big Display */}
        <div className={`text-center py-3 rounded-xl mb-3 ${
          isCurrentPlayer 
            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30' 
            : 'bg-slate-900/50 border border-slate-700/30'
        }`}>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Current Target</p>
          <p className={`text-4xl font-black ${isCurrentPlayer ? 'text-white' : 'text-slate-400'}`}>
            {getTargetLabel(player.current_target || 1)}
          </p>
        </div>
        
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Progress</span>
            <span className={`font-bold ${isCurrentPlayer ? 'text-emerald-400' : 'text-slate-400'}`}>
              {player.completed_targets?.length || 0}/21
            </span>
          </div>
          <div className="h-3 bg-slate-900/50 rounded-full overflow-hidden">
            <motion.div 
              className={`h-full rounded-full ${
                isCurrentPlayer 
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' 
                  : 'bg-gradient-to-r from-slate-600 to-slate-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
        
        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className={`text-center p-2 rounded-lg ${isCurrentPlayer ? 'bg-emerald-500/10' : 'bg-slate-900/30'}`}>
            <p className="text-xs text-slate-400">Darts Thrown</p>
            <p className={`text-lg font-bold ${isCurrentPlayer ? 'text-emerald-400' : 'text-slate-300'}`}>
              {player.total_darts_thrown || 0}
            </p>
          </div>
          <div className={`text-center p-2 rounded-lg ${isCurrentPlayer ? 'bg-purple-500/10' : 'bg-slate-900/30'}`}>
            <p className="text-xs text-slate-400">Completed</p>
            <p className={`text-lg font-bold ${isCurrentPlayer ? 'text-purple-400' : 'text-slate-300'}`}>
              {player.completed_targets?.length || 0}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Current Visit Display Component
function CurrentVisitDisplay({ 
  visit, 
  dartCount 
}: { 
  visit: Partial<Visit>; 
  dartCount: number;
}) {
  const darts = [visit.dart1, visit.dart2, visit.dart3];
  
  return (
    <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Current Visit</h4>
        <Badge className="bg-emerald-500/20 text-emerald-400">
          {dartCount}/3 Darts
        </Badge>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {darts.map((dart, i) => (
          <motion.div 
            key={i}
            initial={dart ? { scale: 0.8, opacity: 0 } : {}}
            animate={dart ? { scale: 1, opacity: 1 } : {}}
            className={`aspect-square rounded-xl flex flex-col items-center justify-center ${
              dart 
                ? dart.segment === 'D' 
                  ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30' 
                  : dart.segment === 'T' 
                  ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/30'
                  : dart.segment === 'DB'
                  ? 'bg-gradient-to-br from-red-600 to-red-700 text-white shadow-lg shadow-red-600/30'
                  : dart.segment === 'SB'
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : dart.segment === 'MISS'
                  ? 'bg-slate-700 text-slate-400'
                  : 'bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                : 'bg-slate-800/50 border-2 border-dashed border-slate-700 text-slate-600'
            }`}
          >
            {dart ? (
              <>
                <span className="text-2xl font-black">{dart.label}</span>
                {dart.segment !== 'MISS' && (
                  <span className="text-xs opacity-80">
                    {dart.segment === 'D' ? 'Double' : dart.segment === 'T' ? 'Triple' : 'Single'}
                  </span>
                )}
              </>
            ) : (
              <span className="text-2xl font-bold">{i + 1}</span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function ATCMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get('matchId') || '';
  const supabase = createClient();
  
  const [match, setMatch] = useState<ATCMatch | null>(null);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [currentVisit, setCurrentVisit] = useState<Partial<Visit>>({});
  const [dartCount, setDartCount] = useState(0);
  const [showGameEndPopup, setShowGameEndPopup] = useState(false);
  const [isRefreshingCamera, setIsRefreshingCamera] = useState(false);
  const [isRefreshingConnection, setIsRefreshingConnection] = useState(false);
  const cameraInitAttempted = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  
  // WebRTC Camera Hook - EXACTLY like 501/301 matches
  const webrtc = useMatchWebRTC({
    roomId: matchId,
    myUserId: currentUser,
    coinTossComplete: match?.status === 'in_progress' || match?.status === 'completed',
  });
  
  const {
    localStream,
    remoteStream,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
    refreshConnection,
    forceTurnAndRestart,
  } = webrtc;
  
  // Load match data
  useEffect(() => {
    const loadMatch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setCurrentUser(user.id);
      
      const { data: matchData } = await supabase
        .from('atc_matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
        
      if (matchData) {
        setMatch(matchData as ATCMatch);
        const currentPlayer = matchData.players?.find((p: Player) => p.id === user.id);
        setIsReady(currentPlayer?.is_ready || false);
        
        if (matchData.status === 'completed') {
          setShowGameEndPopup(true);
        }
      }
      
      setLoading(false);
    };
    
    loadMatch();
  }, [matchId]);
  
  // Subscribe to match updates
  useEffect(() => {
    if (!matchId) return;
    
    const channel = supabase
      .channel(`atc_match_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atc_matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const updatedMatch = payload.new as ATCMatch;
          setMatch(updatedMatch);
          
          if (updatedMatch.status === 'starting' && !showWheel) {
            setShowWheel(true);
            spinWheel(updatedMatch.players);
          }
          
          if (updatedMatch.status === 'completed' && !showGameEndPopup) {
            setShowGameEndPopup(true);
          }
          
          const currentPlayer = updatedMatch.players?.find((p: Player) => p.id === currentUser);
          setIsReady(currentPlayer?.is_ready || false);
        }
      )
      .subscribe();
      
    return () => {
      channel.unsubscribe();
    };
  }, [matchId, currentUser]);
  
  // Callback refs for video elements - EXACTLY like 501/301 matches
  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && localStream) {
      console.log('[CAMERA] Attaching local stream to video element');
      el.srcObject = localStream;
      el.play().catch(err => console.error('[CAMERA] Error playing local:', err));
    }
    localVideoRef.current = el;
  }, [localStream]);

  const setRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && remoteStream) {
      console.log('[CAMERA] Attaching remote stream to video element');
      el.srcObject = remoteStream;
      el.play().catch(err => console.error('[CAMERA] Error playing remote:', err));
    }
    remoteVideoRef.current = el;
  }, [remoteStream]);
  
  // Auto-start camera when game starts - EXACTLY like 501/301 matches
  useEffect(() => {
    const initCamera = async () => {
      if (match?.status === 'in_progress' && !isCameraOn && !cameraInitAttempted.current) {
        console.log('[CAMERA] Auto-starting camera for ATC match');
        cameraInitAttempted.current = true;
        try {
          await toggleCamera();
          console.log('[CAMERA] Auto-start successful');
        } catch (err) {
          console.error('[CAMERA] Auto-start failed:', err);
          cameraInitAttempted.current = false;
        }
      }
    };
    initCamera();
  }, [match?.status, isCameraOn, toggleCamera]);
  
  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);
  
  // Ready up
  const toggleReady = async () => {
    if (!match || !currentUser) return;
    
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    
    const updatedPlayers = match.players.map(p => 
      p.id === currentUser ? { ...p, is_ready: newReadyState } : p
    );
    
    await supabase
      .from('atc_matches')
      .update({ players: updatedPlayers })
      .eq('id', matchId);
      
    const allReady = updatedPlayers.every(p => p.is_ready);
    if (allReady && updatedPlayers.length >= 2) {
      await supabase
        .from('atc_matches')
        .update({ status: 'starting' })
        .eq('id', matchId);
    }
  };
  
  // Spinning wheel
  const spinWheel = (players: Player[]) => {
    setWheelSpinning(true);
    
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * players.length);
      setSelectedPlayer(players[randomIndex]);
      setWheelSpinning(false);
      
      setTimeout(() => {
        setShowWheel(false);
        startGame(players[randomIndex].id);
      }, 2000);
    }, 3000);
  };
  
  const startGame = async (startingPlayerId: string) => {
    const startingIndex = match?.players.findIndex(p => p.id === startingPlayerId) || 0;
    
    const playersWithHistory = match?.players.map(p => ({
      ...p,
      visit_history: [],
      total_darts_thrown: 0
    }));
    
    await supabase
      .from('atc_matches')
      .update({ 
        status: 'in_progress',
        current_player_index: startingIndex,
        players: playersWithHistory
      })
      .eq('id', matchId);
  };
  
  // Handle camera refresh - EXACTLY like 501/301 matches
  const handleRefreshCamera = async () => {
    setIsRefreshingCamera(true);
    try {
      await refreshCamera();
      toast.success('Camera refreshed');
    } catch (error) {
      toast.error('Failed to refresh camera');
    } finally {
      setIsRefreshingCamera(false);
    }
  };
  
  // Handle connection refresh - EXACTLY like 501/301 matches
  const handleRefreshConnection = async () => {
    setIsRefreshingConnection(true);
    try {
      await refreshConnection();
      toast.success('Connection refreshed');
    } catch (error) {
      toast.error('Failed to refresh connection');
    } finally {
      setIsRefreshingConnection(false);
    }
  };
  
  // Handle dart throw - EVERY input counts as a dart, 3 darts = end turn
  const handleDartThrow = async (segment: string, number?: number) => {
    if (!match || !isMyTurn()) return;
    
    const label = segment === 'MISS' ? 'Miss' : 
                  segment === 'SB' ? 'SB' :
                  segment === 'DB' ? 'DB' :
                  `${segment}${number}`;
    
    const dart = { segment, number, label };
    const currentPlayer = match.players[match.current_player_index];
    const target = currentPlayer.current_target;
    const mode = match.atc_settings.mode;
    
    setCurrentVisit(prev => {
      const newVisit: Partial<Visit> = { ...prev, timestamp: new Date().toISOString() };
      if (!prev.dart1) newVisit.dart1 = dart;
      else if (!prev.dart2) newVisit.dart2 = dart;
      else newVisit.dart3 = dart;
      return newVisit;
    });
    
    const newDartCount = dartCount + 1;
    setDartCount(newDartCount);
    
    let hit = false;
    if (target === 'bull') {
      if (mode === 'singles' && segment === 'SB') hit = true;
      else if (mode === 'doubles' && segment === 'DB') hit = true;
      else if (mode === 'increase' && (segment === 'SB' || segment === 'DB')) hit = true;
    } else {
      if (mode === 'singles' && segment === 'S' && number === target) hit = true;
      else if (mode === 'doubles' && segment === 'D' && number === target) hit = true;
      else if (mode === 'trebles' && segment === 'T' && number === target) hit = true;
      else if (mode === 'increase' && number === target) hit = true;
    }
    
    const allTargets = generateTargets(match.atc_settings.order);
    const updatedPlayers = [...match.players];
    const playerIndex = match.current_player_index;
    
    updatedPlayers[playerIndex].total_darts_thrown = (updatedPlayers[playerIndex].total_darts_thrown || 0) + 1;
    
    if (hit) {
      updatedPlayers[playerIndex].completed_targets.push(target);
      
      let nextTarget: number | 'bull' | null;
      
      if (mode === 'increase' && match.atc_settings.order === 'sequential') {
        nextTarget = calculateNextTarget(target, segment, allTargets);
      } else {
        const currentIndex = allTargets.indexOf(target);
        nextTarget = currentIndex < allTargets.length - 1 ? allTargets[currentIndex + 1] : null;
      }
      
      if (nextTarget === null) {
        updatedPlayers[playerIndex].is_winner = true;
        
        const completedVisit: Visit = {
          ...currentVisit,
          dart1: !currentVisit.dart1 ? dart : currentVisit.dart1,
          dart2: currentVisit.dart1 && !currentVisit.dart2 ? dart : currentVisit.dart2,
          dart3: currentVisit.dart1 && currentVisit.dart2 ? dart : currentVisit.dart3,
          completed_target: target,
          timestamp: new Date().toISOString()
        };
        
        if (!updatedPlayers[playerIndex].visit_history) {
          updatedPlayers[playerIndex].visit_history = [];
        }
        updatedPlayers[playerIndex].visit_history!.push(completedVisit);
        
        await supabase
          .from('atc_matches')
          .update({ 
            status: 'completed',
            winner_id: currentPlayer.id,
            players: updatedPlayers
          })
          .eq('id', matchId);
        
        toast.success(`${currentPlayer.username} wins!`);
        setShowGameEndPopup(true);
        return;
      } else {
        updatedPlayers[playerIndex].current_target = nextTarget;
      }
    }
    
    if (newDartCount >= 3) {
      const completedVisit: Visit = {
        ...currentVisit,
        dart1: !currentVisit.dart1 ? dart : currentVisit.dart1,
        dart2: currentVisit.dart1 && !currentVisit.dart2 ? dart : currentVisit.dart2,
        dart3: currentVisit.dart1 && currentVisit.dart2 ? dart : currentVisit.dart3,
        completed_target: hit ? target : undefined,
        timestamp: new Date().toISOString()
      };
      
      if (!updatedPlayers[playerIndex].visit_history) {
        updatedPlayers[playerIndex].visit_history = [];
      }
      updatedPlayers[playerIndex].visit_history!.push(completedVisit);
      
      await endTurn(updatedPlayers);
    } else {
      await supabase
        .from('atc_matches')
        .update({ players: updatedPlayers })
        .eq('id', matchId);
    }
  };
  
  const isMyTurn = () => {
    if (!match || !currentUser) return false;
    const currentPlayer = match.players[match.current_player_index];
    return currentPlayer?.id === currentUser && match.status === 'in_progress';
  };
  
  const getCurrentPlayer = () => {
    if (!match) return null;
    return match.players[match.current_player_index];
  };
  
  const endTurn = async (updatedPlayers?: Player[]) => {
    if (!match) return;
    
    const players = updatedPlayers || [...match.players];
    const nextIndex = (match.current_player_index + 1) % players.length;
    
    await supabase
      .from('atc_matches')
      .update({ 
        players: players,
        current_player_index: nextIndex 
      })
      .eq('id', matchId);
      
    setCurrentVisit({});
    setDartCount(0);
  };
  
  const getCurrentTarget = (): string => {
    if (!match) return '';
    const currentPlayer = match.players[match.current_player_index];
    return getTargetLabel(currentPlayer?.current_target || 1);
  };
  
  const handleEndGame = () => {
    stopCamera();
    router.push('/app/play/quick-match');
  };
  
  const getPlayerTarget = (player: Player): string => {
    return getTargetLabel(player.current_target || 1);
  };

  const getPlayerProgress = (player: Player) => {
    return ((player.completed_targets?.length || 0) / 21) * 100;
  };
  
  // Button animation variants
  const buttonVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-400" />
      </div>
    );
  }
  
  if (!match) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <Card className="p-8 bg-slate-900 border-slate-700 text-center">
          <p className="text-white text-lg">Match not found</p>
          <Link href="/app/play/quick-match">
            <Button className="mt-4">Back to Lobbies</Button>
          </Link>
        </Card>
      </div>
    );
  }
  
  // Waiting room
  if (match.status === 'waiting') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 overflow-hidden flex flex-col">
        <div className="max-w-3xl mx-auto w-full space-y-4 flex-1 flex flex-col">
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <Link href="/app/play/quick-match">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Exit
              </Button>
            </Link>
            <h1 className="text-2xl font-black text-white">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Around The Clock
              </span>
            </h1>
            <div className="w-16" />
          </motion.div>
          
          {/* Settings Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-slate-800/50 border-slate-700/50 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-purple-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Match Settings</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-1">Order</p>
                  <p className="text-white font-bold">{match.atc_settings.order === 'sequential' ? 'In Order' : 'Random'}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-1">Mode</p>
                  <p className="text-white font-bold capitalize">{match.atc_settings.mode}</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs mb-1">Players</p>
                  <p className="text-white font-bold">{match.atc_settings.player_count}</p>
                </div>
              </div>
            </Card>
          </motion.div>
          
          {/* Players Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex-1"
          >
            <Card className="bg-slate-800/50 border-slate-700/50 p-4 h-full backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Players</h2>
              </div>
              <div className="space-y-2">
                {match.players?.map((player, idx) => (
                  <motion.div 
                    key={player.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.1 }}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-medium">{player.username}</span>
                      {player.id === match.created_by && (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Host</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {player.is_ready ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Ready
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-700 text-slate-400">Not Ready</Badge>
                      )}
                    </div>
                  </motion.div>
                ))}
                
                {Array.from({ length: (match.atc_settings.player_count - (match.players?.length || 0)) }).map((_, i) => (
                  <div 
                    key={`empty-${i}`}
                    className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg border-2 border-dashed border-slate-700/50"
                  >
                    <span className="text-slate-500">Waiting for player...</span>
                    <Badge className="bg-slate-700 text-slate-500">Empty</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
          
          {/* Ready Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Button
              className={`w-full py-4 text-lg font-bold ${
                isReady 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25'
              }`}
              onClick={toggleReady}
            >
              {isReady ? 'Cancel Ready' : 'Ready Up!'}
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }
  
  // Spinning wheel
  if (showWheel) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <motion.h2 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-black text-white mb-8"
          >
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Choosing Starting Player...
            </span>
          </motion.h2>
          
          <div className="relative w-72 h-72 mx-auto">
            <motion.div
              className="w-full h-full rounded-full border-8 border-slate-700 bg-slate-800 relative overflow-hidden shadow-2xl"
              animate={wheelSpinning ? { rotate: 360 * 5 } : {}}
              transition={{ duration: 3, ease: "easeOut" }}
            >
              {match.players?.map((player, index) => {
                const angle = 360 / match.players.length;
                const rotation = index * angle;
                return (
                  <div
                    key={player.id}
                    className="absolute w-full h-full flex items-center justify-center"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin((angle * Math.PI) / 180)}% ${50 - 50 * Math.cos((angle * Math.PI) / 180)}%)`,
                    }}
                  >
                    <div className={`w-full h-full flex items-center justify-center ${
                      index % 2 === 0 ? 'bg-purple-500/30' : 'bg-pink-500/30'
                    }`}>
                      <span 
                        className="text-white font-bold text-base"
                        style={{ transform: `rotate(${angle / 2}deg)` }}
                      >
                        {player.username}
                      </span>
                    </div>
                  </div>
                );
              })}
            </motion.div>
            
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
              <div className="w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-emerald-400" />
            </div>
          </div>
          
          {!wheelSpinning && selectedPlayer && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8"
            >
              <p className="text-slate-400 mb-2">Starting Player</p>
              <p className="text-4xl font-black text-emerald-400">{selectedPlayer.username}</p>
            </motion.div>
          )}
        </div>
      </div>
    );
  }
  
  // In Progress - NEW ENGAGING LAYOUT
  const currentPlayer = getCurrentPlayer();
  const target = currentPlayer?.current_target;
  const mode = match.atc_settings.mode;
  const isIncreaseMode = mode === 'increase' && match.atc_settings.order === 'sequential';
  const opponent = match.players.find(p => p.id !== currentUser);
  
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Premium Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900/80 border-b border-slate-800/50 px-4 py-3 flex-shrink-0 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between">
          <Link href="/app/play/quick-match">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Exit
            </Button>
          </Link>
          
          <div className="text-center">
            <h1 className="text-lg font-black text-white">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Around The Clock
              </span>
            </h1>
          </div>
          
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleRefreshCamera}
                    disabled={isRefreshingCamera}
                    className="text-slate-400 hover:text-emerald-400 h-8 w-8 p-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh Camera</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleCamera}
              className={isCameraOn ? 'text-emerald-400 h-8 w-8 p-0' : 'text-slate-400 h-8 w-8 p-0'}
            >
              {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </motion.div>
      
      {/* Main Game Area */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* LEFT: Camera - EXACTLY like 501/301 matches */}
        <div className="flex flex-col">
          <Card className={`bg-slate-800/50 border-white/10 overflow-hidden flex-1 flex flex-col ${isMyTurn() ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'border-blue-500/30 shadow-lg shadow-blue-500/10'}`}>
            <div className={`flex items-center justify-between p-3 border-b border-white/5 ${isMyTurn() ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
              <span className={`text-sm font-bold ${isMyTurn() ? 'text-emerald-400' : 'text-blue-400'}`}>
                {isMyTurn() ? `🎯 ${currentPlayer?.username}'S TURN (You)` : `🎯 ${currentPlayer?.username}'S TURN`}
              </span>
              <div className="flex gap-2">
                {isMyTurn() ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleCamera}>
                      {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                    </Button>
                    {isCameraOn && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              onClick={handleRefreshCamera}
                              disabled={isRefreshingCamera}
                            >
                              {isRefreshingCamera ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Refresh camera if opponent can't see you</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded">
                      <Wifi className="w-3 h-3" /> Live
                    </span>
                  </>
                ) : (
                  <>
                    {callStatus === 'connected' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded">
                        <Wifi className="w-3 h-3" /> Connected
                      </span>
                    ) : callStatus === 'connecting' ? (
                      <span className="text-xs text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded">
                        <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                      </span>
                    ) : callStatus === 'failed' ? (
                      <span className="text-xs text-red-400 flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded">
                        <WifiOff className="w-3 h-3" /> Failed
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Not connected</span>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className="flex-1 relative bg-slate-900">
              {/* MY TURN: Show MY local camera */}
              {isMyTurn() ? (
                localStream ? (
                  <div className="relative w-full h-full">
                    <video 
                      ref={setLocalVideoRef}
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 right-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="sm"
                              variant="secondary"
                              className="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                              onClick={handleRefreshCamera}
                              disabled={isRefreshingCamera}
                            >
                              {isRefreshingCamera ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Refresh
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>Restart camera if opponent can't see you</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6">
                    <CameraOff className="w-16 h-16 mb-4 opacity-50" />
                    <span className="text-lg font-medium mb-2">Your camera is off</span>
                    <span className="text-sm text-slate-500 mb-4 text-center">
                      It's your turn! Enable your camera so your opponent can see you.
                    </span>
                    <Button 
                      onClick={toggleCamera}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Enable Camera
                    </Button>
                  </div>
                )
              ) : (
                /* OPPONENT'S TURN: Show THEIR remote camera */
                remoteStream ? (
                  <video 
                    ref={setRemoteVideoRef}
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6">
                    <UserPlus className="w-16 h-16 mb-4 opacity-50" />
                    <span className="text-lg font-medium mb-2">
                      {callStatus === 'failed' ? 'Connection failed' : `Waiting for ${opponent?.username}...`}
                    </span>
                    <span className="text-sm text-slate-500 text-center mb-4">
                      {callStatus === 'failed' 
                        ? 'Video connection failed. This may be due to firewall or network restrictions.'
                        : "It's their turn. Their camera will appear when they enable it."
                      }
                    </span>
                    {callStatus === 'failed' && (
                      <Button 
                        onClick={forceTurnAndRestart}
                        variant="outline"
                        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 mb-2"
                      >
                        <Loader2 className="w-4 h-4 mr-2" />
                        Retry with TURN Relay
                      </Button>
                    )}
                    {isCameraOn && (
                      <Button 
                        onClick={handleRefreshCamera}
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 mt-2"
                        disabled={isRefreshingCamera}
                      >
                        {isRefreshingCamera ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Refresh My Camera
                      </Button>
                    )}
                    <Button 
                      onClick={handleRefreshConnection}
                      variant="outline"
                      size="sm"
                      className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 mt-2"
                      disabled={isRefreshingConnection}
                    >
                      {isRefreshingConnection ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Wifi className="w-4 h-4 mr-2" />
                      )}
                      Reconnect to Opponent
                    </Button>
                    {!isCameraOn && callStatus !== 'failed' && (
                      <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <span className="text-sm text-amber-400">
                          ⚠️ You should also enable your camera for your turn
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </Card>
        </div>
        
        {/* RIGHT: Player Tiles + Scoring */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Player Tiles - NEW ENGAGING DESIGN */}
          <div className="grid grid-cols-2 gap-4">
            {match.players.map((player, idx) => (
              <PlayerTile
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === currentPlayer?.id}
                isCurrentUser={player.id === currentUser}
                progress={getPlayerProgress(player)}
              />
            ))}
          </div>
          
          {/* Current Visit Display - Shows darts as entered */}
          {isMyTurn() && (
            <CurrentVisitDisplay visit={currentVisit} dartCount={dartCount} />
          )}
          
          {/* Scoring Panel */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 p-4 overflow-hidden">
            {isMyTurn() ? (
              <div className="h-full flex flex-col">
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Crosshair className="h-4 w-4 text-emerald-400" />
                  Enter Your Throw
                </h4>
                
                {target === 'bull' ? (
                  /* Bull Mode */
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex-1 flex gap-2">
                      {(mode === 'singles' || mode === 'increase') && (
                        <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                          <Button
                            onClick={() => handleDartThrow('SB')}
                            className="h-full w-full text-lg font-bold bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                          >
                            Single Bull
                          </Button>
                        </motion.div>
                      )}
                      {(mode === 'doubles' || mode === 'increase') && (
                        <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                          <Button
                            onClick={() => handleDartThrow('DB')}
                            className="h-full w-full text-lg font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25"
                          >
                            Double Bull
                          </Button>
                        </motion.div>
                      )}
                    </div>
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                      <Button
                        onClick={() => handleDartThrow('MISS')}
                        className="h-12 w-full text-lg font-bold bg-slate-700 hover:bg-slate-600 text-white"
                      >
                        Miss
                      </Button>
                    </motion.div>
                  </div>
                ) : isIncreaseMode ? (
                  /* Increase Mode - 2x2 Grid */
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap">
                      <Button
                        onClick={() => handleDartThrow('S', target as number)}
                        className="h-full w-full text-2xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                      >
                        S{target}
                      </Button>
                    </motion.div>
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.05 }}>
                      <Button
                        onClick={() => handleDartThrow('D', target as number)}
                        className="h-full w-full text-2xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                      >
                        D{target}
                      </Button>
                    </motion.div>
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                      <Button
                        onClick={() => handleDartThrow('T', target as number)}
                        className="h-full w-full text-2xl font-black bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/25"
                      >
                        T{target}
                      </Button>
                    </motion.div>
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.15 }}>
                      <Button
                        onClick={() => handleDartThrow('MISS')}
                        className="h-full w-full text-xl font-bold bg-slate-700 hover:bg-slate-600 text-white"
                      >
                        Miss
                      </Button>
                    </motion.div>
                  </div>
                ) : (
                  /* Singles/Doubles/Trebles */
                  <div className="flex-1 flex flex-col gap-2">
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                      <Button
                        onClick={() => handleDartThrow(
                          mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T', 
                          target as number
                        )}
                        className={`h-full w-full text-4xl font-black shadow-lg ${
                          mode === 'singles' 
                            ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 shadow-cyan-500/25' :
                          mode === 'doubles' 
                            ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/25' :
                            'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/25'
                        }`}
                      >
                        {mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T'}{target}
                      </Button>
                    </motion.div>
                    <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                      <Button
                        onClick={() => handleDartThrow('MISS')}
                        className="h-12 w-full text-lg font-bold bg-slate-700 hover:bg-slate-600 text-white"
                      >
                        Miss
                      </Button>
                    </motion.div>
                  </div>
                )}
              </div>
            ) : (
              /* Waiting for opponent */
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="w-12 h-12 animate-spin mb-4 text-emerald-400" />
                <p className="text-lg font-medium">Waiting for {currentPlayer?.username}</p>
                <p className="text-sm">Their turn to throw...</p>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Game End Popup */}
      <Dialog open={showGameEndPopup} onOpenChange={setShowGameEndPopup}>
        <DialogContent className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-center flex items-center justify-center gap-2">
              <Trophy className="w-8 h-8 text-amber-400" />
              Game Over!
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {match.players.find(p => p.is_winner) && (
              <div className="text-center">
                <p className="text-slate-400 mb-2">Winner</p>
                <p className="text-4xl font-black text-emerald-400">
                  {match.players.find(p => p.is_winner)?.username}
                </p>
              </div>
            )}
            
            <div className="bg-slate-800/50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-slate-400 mb-3">Final Stats</h4>
              <div className="space-y-2">
                {match.players.map((player) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      player.is_winner ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{player.username}</span>
                      {player.is_winner && (
                        <Badge className="bg-amber-500/20 text-amber-400">
                          <Trophy className="w-3 h-3 mr-1" />
                          Winner
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-purple-400">
                        {player.completed_targets?.length || 0} targets
                      </span>
                      <span className="text-slate-500">
                        {player.total_darts_thrown || 0} darts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <Button
              onClick={handleEndGame}
              className="w-full py-6 text-lg font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              End Game
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}