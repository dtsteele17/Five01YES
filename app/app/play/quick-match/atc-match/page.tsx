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
  Zap, Crosshair, Clock, Flame, BarChart3, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  
  // WebRTC Camera Hook - Same as other quick matches
  const {
    localStream,
    remoteStream,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
  } = useMatchWebRTC({
    roomId: matchId,
    myUserId: currentUser,
    coinTossComplete: match?.status === 'in_progress' || match?.status === 'completed',
  });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
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
  
  // Connect video streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);
  
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);
  
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
  
  // Handle camera refresh
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
  
  // In Progress - PREMIUM DASHBOARD STYLE
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
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefreshCamera}
              disabled={isRefreshingCamera}
              className="text-slate-400 hover:text-emerald-400 h-8 w-8 p-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
            </Button>
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
      <div className="flex-1 flex gap-2 p-2 min-h-0 overflow-hidden">
        {/* LEFT SIDE - Camera with WebRTC */}
        <div className="w-1/2 flex flex-col gap-2">
          {/* Camera Container */}
          <div className="flex-1 bg-black rounded-xl overflow-hidden relative min-h-0 shadow-2xl">
            {isMyTurn() ? (
              /* MY TURN: Show MY local camera */
              <>
                {isCameraOn && localStream ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900">
                    <div className="text-center">
                      <CameraOff className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-500 text-sm mb-3">Your camera is off</p>
                      <Button onClick={toggleCamera} className="bg-emerald-500 hover:bg-emerald-600 text-sm">
                        <Camera className="w-4 h-4 mr-2" />
                        Enable Camera
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Camera refresh overlay button */}
                {isCameraOn && (
                  <div className="absolute top-3 right-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshCamera}
                      disabled={isRefreshingCamera}
                      className="bg-black/50 hover:bg-black/70 text-white text-xs h-8 px-2"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
                      {isRefreshingCamera ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              /* OPPONENT'S TURN: Show THEIR remote camera */
              <>
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-900">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 text-slate-600 mx-auto mb-2 animate-spin" />
                      <p className="text-slate-500 text-sm">
                        {callStatus === 'connecting' 
                          ? "Connecting to opponent's camera..." 
                          : callStatus === 'failed'
                          ? "Connection failed. Waiting for opponent..."
                          : "Waiting for opponent's camera..."}
                      </p>
                    </div>
                  </div>
                )}
                
                {/* My camera preview (small) when opponent's turn */}
                {isCameraOn && (
                  <div className="absolute top-3 right-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefreshCamera}
                      disabled={isRefreshingCamera}
                      className="bg-black/50 hover:bg-black/70 text-white text-xs h-8 px-2"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
                      Refresh My Cam
                    </Button>
                  </div>
                )}
                
                {/* Warning if my camera is off during opponent's turn */}
                {!isCameraOn && (
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-2 flex items-center justify-between">
                      <span className="text-amber-400 text-xs">
                        ⚠️ Enable your camera for your turn
                      </span>
                      <Button 
                        size="sm" 
                        onClick={toggleCamera}
                        className="h-6 text-xs bg-amber-500 hover:bg-amber-600"
                      >
                        <Camera className="w-3 h-3 mr-1" />
                        Enable
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            
            {/* Turn Indicator Overlay */}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="text-white font-bold text-sm">
                {isMyTurn() ? '🎯 Your Turn' : `👀 ${currentPlayer?.username}'s Turn`}
              </span>
            </div>
          </div>
          
          {/* Target Display - Premium Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-xl p-3 text-center border border-blue-500/30 backdrop-blur-sm relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Crosshair className="h-4 w-4 text-blue-400" />
                <span className="text-blue-300 text-xs font-medium uppercase tracking-wider">
                  {isMyTurn() ? 'Your Target' : `${currentPlayer?.username}'s Target`}
                </span>
              </div>
              <AnimatePresence mode="wait">
                <motion.p 
                  key={getCurrentTarget()}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className="text-5xl font-black text-white drop-shadow-lg"
                >
                  {getCurrentTarget()}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
        
        {/* RIGHT SIDE - PREMIUM DASHBOARD STYLE */}
        <div className="w-1/2 flex flex-col gap-2 min-h-0 overflow-hidden">
          {isMyTurn() ? (
            /* USER'S TURN - PREMIUM LAYOUT */
            <>
              {/* Player Progress Cards */}
              <div className="flex flex-col gap-2">
                {match.players?.map((player, idx) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className={`p-3 ${
                      player.id === currentUser 
                        ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border-emerald-500/30' 
                        : 'bg-slate-800/50 border-slate-700/50'
                    } backdrop-blur-sm`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                            player.id === currentUser 
                              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' 
                              : 'bg-gradient-to-br from-slate-500 to-slate-600'
                          }`}>
                            {player.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className={`font-bold text-sm ${
                              player.id === currentUser ? 'text-emerald-300' : 'text-slate-300'
                            }`}>
                              {player.username}
                              {player.id === currentUser && (
                                <span className="ml-2 text-[10px] bg-emerald-500/30 text-emerald-400 px-1.5 py-0.5 rounded">You</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-sm font-black px-2 py-0.5 ${
                            player.id === currentUser 
                              ? 'bg-purple-500 text-white' 
                              : 'bg-slate-600 text-slate-200'
                          }`}>
                            {getPlayerTarget(player)}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Progress</span>
                          <span className={player.id === currentUser ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                            {player.completed_targets?.length || 0}/21
                          </span>
                        </div>
                        <Progress 
                          value={getPlayerProgress(player)} 
                          className="h-2 bg-slate-700"
                        />
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
              
              {/* Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-3 gap-2"
              >
                <Card className="bg-slate-800/50 border-slate-700/50 p-2 text-center backdrop-blur-sm">
                  <Zap className="h-4 w-4 text-yellow-400 mx-auto mb-1" />
                  <p className="text-lg font-black text-white">{dartCount}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Darts</p>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50 p-2 text-center backdrop-blur-sm">
                  <Target className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                  <p className="text-lg font-black text-white">{currentPlayer?.total_darts_thrown || 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total</p>
                </Card>
                <Card className="bg-slate-800/50 border-slate-700/50 p-2 text-center backdrop-blur-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                  <p className="text-lg font-black text-white">{currentPlayer?.completed_targets?.length || 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Done</p>
                </Card>
              </motion.div>
              
              {/* Current Visit Display */}
              <AnimatePresence>
                {dartCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Card className="bg-slate-800/50 border-slate-700/50 p-2 backdrop-blur-sm">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Current Visit</p>
                      <div className="flex gap-2">
                        {[currentVisit.dart1, currentVisit.dart2, currentVisit.dart3].map((dart, i) => (
                          <motion.div 
                            key={i}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className={`flex-1 py-2 rounded-lg font-bold text-center text-sm ${
                              dart?.segment === 'D' ? 'bg-red-500/80 text-white' :
                              dart?.segment === 'T' ? 'bg-amber-500/80 text-white' :
                              dart?.segment === 'DB' ? 'bg-red-600/80 text-white' :
                              dart?.segment === 'SB' ? 'bg-emerald-500/80 text-white' :
                              dart?.segment === 'MISS' ? 'bg-slate-600/80 text-white' :
                              dart ? 'bg-blue-500/80 text-white' :
                              'bg-slate-700/30 text-slate-600'
                            }`}
                          >
                            {dart?.label || '-'}
                          </motion.div>
                        ))}
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Scoring Buttons - Premium Style */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex-1 min-h-0"
              >
                <Card className="bg-slate-800/50 border-slate-700/50 p-3 h-full backdrop-blur-sm flex flex-col">
                  <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-blue-400" />
                    Enter Your Throw
                  </p>
                  
                  {target === 'bull' ? (
                    /* Bull Mode */
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex-1 flex gap-2">
                        {(mode === 'singles' || mode === 'increase') && (
                          <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                            <Button
                              onClick={() => handleDartThrow('SB')}
                              className="h-full w-full text-xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
                            >
                              Single Bull
                            </Button>
                          </motion.div>
                        )}
                        {(mode === 'doubles' || mode === 'increase') && (
                          <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                            <Button
                              onClick={() => handleDartThrow('DB')}
                              className="h-full w-full text-xl font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 border-2 border-red-400/50"
                            >
                              Double Bull
                            </Button>
                          </motion.div>
                        )}
                      </div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                        <Button
                          onClick={() => handleDartThrow('MISS')}
                          className="h-14 w-full text-xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
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
                          className="h-full w-full text-3xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
                        >
                          S{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.05 }}>
                        <Button
                          onClick={() => handleDartThrow('D', target as number)}
                          className="h-full w-full text-3xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 border-2 border-emerald-400/50"
                        >
                          D{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                        <Button
                          onClick={() => handleDartThrow('T', target as number)}
                          className="h-full w-full text-3xl font-black bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/25 border-2 border-amber-400/50"
                        >
                          T{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.15 }}>
                        <Button
                          onClick={() => handleDartThrow('MISS')}
                          className="h-full w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
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
                          className={`h-full w-full text-5xl font-black shadow-lg border-2 ${
                            mode === 'singles' 
                              ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 shadow-cyan-500/25 border-cyan-400/50' :
                            mode === 'doubles' 
                              ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/25 border-emerald-400/50' :
                              'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/25 border-amber-400/50'
                          }`}
                        >
                          {mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T'}{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                        <Button
                          onClick={() => handleDartThrow('MISS')}
                          className="h-14 w-full text-xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
                        >
                          Miss
                        </Button>
                      </motion.div>
                    </div>
                  )}
                </Card>
              </motion.div>
            </>
          ) : (
            /* OPPONENT'S TURN - PREMIUM VIEW */
            <div className="flex flex-col gap-2 h-full">
              {/* Waiting Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Card className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border-emerald-500/30 p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                    </div>
                    <div>
                      <p className="text-white font-bold">Waiting for {currentPlayer?.username}</p>
                      <p className="text-emerald-400 text-sm">Their turn to throw...</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
              
              {/* Player Stats */}
              <div className="flex-1 overflow-auto space-y-2">
                {match.players.map((player, idx) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className={`p-3 ${
                      player.id === currentPlayer?.id 
                        ? 'bg-emerald-500/10 border-emerald-500/30' 
                        : 'bg-slate-800/50 border-slate-700/50'
                    } backdrop-blur-sm`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            player.id === currentPlayer?.id 
                              ? 'bg-emerald-500/20' 
                              : 'bg-slate-700'
                          }`}>
                            {player.id === currentPlayer?.id ? (
                              <Activity className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <span className="text-slate-400 font-bold text-sm">
                                {player.username.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="text-white font-bold text-sm">{player.username}</p>
                            {player.id === currentUser && (
                              <span className="text-[10px] text-blue-400">You</span>
                            )}
                          </div>
                        </div>
                        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                          {getPlayerTarget(player)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-900/50 rounded p-1.5">
                          <p className="text-lg font-bold text-white">{player.completed_targets?.length || 0}</p>
                          <p className="text-[10px] text-slate-400">Done</p>
                        </div>
                        <div className="bg-slate-900/50 rounded p-1.5">
                          <p className="text-lg font-bold text-emerald-400">{player.total_darts_thrown || 0}</p>
                          <p className="text-[10px] text-slate-400">Darts</p>
                        </div>
                        <div className="bg-slate-900/50 rounded p-1.5">
                          <p className="text-lg font-bold text-blue-400">
                            {Math.round(((player.completed_targets?.length || 0) / 21) * 100)}%
                          </p>
                          <p className="text-[10px] text-slate-400">Progress</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
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
