'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Target, Users, ArrowLeft, CheckCircle2, 
  Camera, CameraOff, Loader2, Trophy, X, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [showGameEndPopup, setShowGameEndPopup] = useState(false);
  const [isRefreshingCamera, setIsRefreshingCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
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
  
  // Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false 
      });
      setCameraStream(stream);
      setCameraEnabled(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Could not access camera');
    }
  };
  
  const toggleCamera = async () => {
    if (cameraEnabled) {
      cameraStream?.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    } else {
      await startCamera();
    }
  };
  
  const refreshCamera = async () => {
    setIsRefreshingCamera(true);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    await startCamera();
    setIsRefreshingCamera(false);
    toast.success('Camera refreshed');
  };
  
  useEffect(() => {
    if (match?.status === 'in_progress' && !cameraEnabled && !cameraStream) {
      startCamera();
    }
  }, [match?.status]);
  
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(track => track.stop());
    };
  }, [cameraStream]);
  
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
    router.push('/app/play/quick-match');
  };
  
  const getPlayerTarget = (player: Player): string => {
    return getTargetLabel(player.current_target || 1);
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
      <div className="fixed inset-0 bg-slate-950 p-2 overflow-hidden flex flex-col">
        <div className="max-w-3xl mx-auto w-full space-y-2 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <Link href="/app/play/quick-match">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white h-7 px-2">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Exit
              </Button>
            </Link>
            <h1 className="text-lg font-bold text-white">Around The Clock</h1>
            <div className="w-14" />
          </div>
          
          <Card className="bg-slate-900/50 border-slate-700 p-2">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-purple-400" />
              <h2 className="text-xs font-bold text-white">Settings</h2>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="bg-slate-800/50 rounded p-1">
                <p className="text-slate-400 text-[9px]">Order</p>
                <p className="text-white font-bold text-xs">{match.atc_settings.order === 'sequential' ? 'In Order' : 'Random'}</p>
              </div>
              <div className="bg-slate-800/50 rounded p-1">
                <p className="text-slate-400 text-[9px]">Mode</p>
                <p className="text-white font-bold text-xs capitalize">{match.atc_settings.mode}</p>
              </div>
              <div className="bg-slate-800/50 rounded p-1">
                <p className="text-slate-400 text-[9px]">Players</p>
                <p className="text-white font-bold text-xs">{match.atc_settings.player_count}</p>
              </div>
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-2 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold text-white">Players</h2>
            </div>
            <div className="space-y-1">
              {match.players?.map((player) => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-1.5 bg-slate-800/50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white text-sm">{player.username}</span>
                    {player.id === match.created_by && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[9px] h-4">Host</Badge>
                    )}
                  </div>
                  {player.is_ready ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] h-5">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700 text-slate-400 text-[9px] h-5">Not Ready</Badge>
                  )}
                </div>
              ))}
              
              {Array.from({ length: (match.atc_settings.player_count - (match.players?.length || 0)) }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="flex items-center justify-between p-1.5 bg-slate-800/30 rounded border border-dashed border-slate-700"
                >
                  <span className="text-slate-500 text-xs">Waiting...</span>
                  <Badge className="bg-slate-700 text-slate-500 text-[9px] h-5">Empty</Badge>
                </div>
              ))}
            </div>
          </Card>
          
          <Button
            className={`w-full py-2 text-sm font-bold ${
              isReady 
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
            onClick={toggleReady}
          >
            {isReady ? 'Cancel Ready' : 'Ready Up!'}
          </Button>
        </div>
      </div>
    );
  }
  
  // Spinning wheel
  if (showWheel) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Choosing Starting Player...</h2>
          
          <div className="relative w-56 h-56 mx-auto">
            <motion.div
              className="w-full h-full rounded-full border-8 border-slate-700 bg-slate-800 relative overflow-hidden"
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
                        className="text-white font-bold text-sm"
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
              className="mt-4"
            >
              <p className="text-slate-400 mb-1">Starting Player</p>
              <p className="text-2xl font-bold text-emerald-400">{selectedPlayer.username}</p>
            </motion.div>
          )}
        </div>
      </div>
    );
  }
  
  // In Progress - ULTRA COMPACT APP SCREEN
  const currentPlayer = getCurrentPlayer();
  const target = currentPlayer?.current_target;
  const mode = match.atc_settings.mode;
  const isIncreaseMode = mode === 'increase' && match.atc_settings.order === 'sequential';
  const opponent = match.players.find(p => p.id !== currentUser);
  
  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col">
      {/* Compact Header - No Menu Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-2 py-1 flex-shrink-0">
        <div className="flex items-center justify-between">
          <Link href="/app/play/quick-match">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white h-7 px-2 text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" />
              Exit
            </Button>
          </Link>
          
          {/* Player Info - Compact */}
          <div className="flex items-center gap-2">
            {match.players?.map((player) => (
              <div 
                key={player.id}
                className={`flex flex-col items-center px-2 py-0.5 rounded ${
                  player.id === currentPlayer?.id 
                    ? 'bg-emerald-500/20 border border-emerald-500/50' 
                    : 'bg-slate-800/70 border border-slate-700'
                }`}
              >
                <span className={`font-bold text-xs ${
                  player.id === currentPlayer?.id ? 'text-emerald-300' : 'text-slate-300'
                }`}>
                  {player.username}
                </span>
                <div className="flex items-center gap-1">
                  <Badge className={`text-xs px-1 py-0 h-4 ${
                    player.id === currentPlayer?.id 
                      ? 'bg-purple-500 text-white' 
                      : 'bg-slate-600 text-slate-200'
                  }`}>
                    {getPlayerTarget(player)}
                  </Badge>
                  <span className={`text-xs ${
                    player.id === currentPlayer?.id ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    ({player.completed_targets?.length || 0}/21)
                  </span>
                  <span className="text-[9px] text-slate-400">
                    🎯{player.total_darts_thrown || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-0.5">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refreshCamera}
              disabled={isRefreshingCamera}
              className="text-slate-400 hover:text-emerald-400 h-7 w-7 p-0"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleCamera}
              className={cameraEnabled ? 'text-emerald-400 h-7 w-7 p-0' : 'text-slate-400 h-7 w-7 p-0'}
            >
              {cameraEnabled ? <Camera className="w-3 h-3" /> : <CameraOff className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Game Area - FULL HEIGHT, NO PADDING WASTE */}
      <div className="flex-1 flex gap-1 min-h-0 overflow-hidden">
        {/* LEFT SIDE - Camera & Target - NO WASTED SPACE */}
        <div className="w-1/2 flex flex-col gap-1">
          {/* Camera - Full width, no margins */}
          <div className="flex-1 bg-black relative min-h-0 overflow-hidden">
            {cameraEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-900">
                <div className="text-center">
                  <CameraOff className="w-8 h-8 text-slate-600 mx-auto mb-1" />
                  <p className="text-slate-500 text-xs">Camera Off</p>
                  <Button onClick={startCamera} className="mt-1 bg-emerald-500 hover:bg-emerald-600 text-xs h-6 px-2 py-0">
                    Enable
                  </Button>
                </div>
              </div>
            )}
            
            {/* Turn Indicator Overlay */}
            <div className="absolute top-1 left-1 bg-black/70 px-2 py-0.5 rounded">
              <span className="text-white font-bold text-xs">
                {isMyTurn() ? '🎯 Your Turn' : `👀 ${currentPlayer?.username}'s Turn`}
              </span>
            </div>
            
            {/* Opponent Cam Refresh */}
            {!isMyTurn() && opponent && (
              <div className="absolute top-1 right-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info('Ask opponent to refresh their camera')}
                  className="bg-black/50 hover:bg-black/70 text-white text-[10px] h-5 px-1 py-0"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Opp
                </Button>
              </div>
            )}
          </div>
          
          {/* Target Display - Compact */}
          <div className="bg-gradient-to-r from-purple-900/60 to-pink-900/60 p-1 text-center border-t border-purple-500/40">
            <p className="text-purple-200 text-[10px] uppercase">
              {isMyTurn() ? 'Hit' : `${currentPlayer?.username} hits`}
            </p>
            <p className="text-3xl font-black text-white leading-none">
              {getCurrentTarget()}
            </p>
          </div>
        </div>
        
        {/* RIGHT SIDE - Scoring - COMPACT */}
        <div className="w-1/2 flex flex-col min-h-0 bg-slate-900">
          {isMyTurn() ? (
            /* USER'S TURN */
            <div className="flex-1 flex flex-col gap-0.5 min-h-0 p-0.5">
              {/* Dart Display - Tiny */}
              <div className="flex justify-center gap-1 shrink-0">
                {[currentVisit.dart1, currentVisit.dart2, currentVisit.dart3].map((dart, i) => (
                  <motion.div 
                    key={i}
                    initial={dart ? { scale: 0.8, opacity: 0 } : {}}
                    animate={dart ? { scale: 1, opacity: 1 } : {}}
                    className={`w-10 h-10 rounded flex items-center justify-center text-sm font-bold ${
                      dart ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800/50 text-slate-600 border border-slate-700'
                    }`}
                  >
                    {dart?.label || '-'}
                  </motion.div>
                ))}
              </div>
              
              {/* SMALL Scoring Buttons */}
              <div className="flex-1 flex flex-col gap-0.5 min-h-0">
                {target === 'bull' ? (
                  /* Bull Mode */
                  <>
                    <div className="flex-1 flex gap-0.5">
                      {(mode === 'singles' || mode === 'increase') && (
                        <Button
                          onClick={() => handleDartThrow('SB')}
                          className="flex-1 text-sm font-bold bg-gradient-to-br from-green-500 to-green-600 h-full py-0"
                        >
                          Single Bull
                        </Button>
                      )}
                      {(mode === 'doubles' || mode === 'increase') && (
                        <Button
                          onClick={() => handleDartThrow('DB')}
                          className="flex-1 text-sm font-bold bg-gradient-to-br from-red-500 to-red-600 h-full py-0"
                        >
                          Double Bull
                        </Button>
                      )}
                    </div>
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-8 text-sm font-bold bg-slate-700 hover:bg-slate-600 py-0"
                    >
                      Miss
                    </Button>
                  </>
                ) : isIncreaseMode ? (
                  /* Increase Mode - Small 2x2 */>
                  <div className="flex-1 grid grid-cols-2 gap-0.5">
                    <Button
                      onClick={() => handleDartThrow('S', target as number)}
                      className="h-full text-xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 py-0"
                    >
                      S{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('D', target as number)}
                      className="h-full text-xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 py-0"
                    >
                      D{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('T', target as number)}
                      className="h-full text-xl font-black bg-gradient-to-br from-amber-500 to-amber-600 py-0"
                    >
                      T{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-full text-lg font-bold bg-slate-700 hover:bg-slate-600 py-0"
                    >
                      Miss
                    </Button>
                  </div>
                ) : (
                  /* Singles/Doubles/Trebles - Small */
                  <>
                    <Button
                      onClick={() => handleDartThrow(
                        mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T', 
                        target as number
                      )}
                      className={`flex-1 text-3xl font-black py-0 ${
                        mode === 'singles' ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' :
                        mode === 'doubles' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
                        'bg-gradient-to-br from-amber-500 to-amber-600'
                      }`}
                    >
                      {mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T'}{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-10 text-base font-bold bg-slate-700 hover:bg-slate-600 py-0"
                    >
                      Miss
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* OPPONENT'S TURN */
            <div className="flex-1 flex flex-col gap-0.5 min-h-0 p-0.5">
              {/* Waiting */}
              <div className="flex items-center gap-1 text-white bg-slate-800/50 p-1 rounded shrink-0">
                <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                <span className="text-xs">Waiting for {currentPlayer?.username}...</span>
              </div>
              
              {/* Player Status */}
              <div className="space-y-0.5 shrink-0">
                {match.players.map((player) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-1 rounded ${
                      player.id === currentPlayer?.id 
                        ? 'bg-emerald-500/10 border border-emerald-500/30' 
                        : 'bg-slate-800/50 border border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        player.id === currentPlayer?.id ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                      }`} />
                      <span className="text-white text-xs">{player.username}</span>
                      {player.id === currentUser && (
                        <span className="text-[9px] bg-blue-500/20 text-blue-400 px-0.5 rounded">You</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-purple-400 text-xs font-bold">{getPlayerTarget(player)}</span>
                      <span className="text-slate-500 text-[10px]">
                        {player.completed_targets?.length || 0}/21
                      </span>
                      <span className="text-cyan-400 text-[10px]">
                        🎯{player.total_darts_thrown || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Visit History - Compact */}
              <div className="flex-1 bg-slate-800/30 rounded p-1 overflow-hidden flex flex-col min-h-0">
                <h4 className="text-[10px] font-semibold text-slate-400 mb-0.5 shrink-0">History</h4>
                <div className="flex-1 overflow-auto space-y-0.5">
                  {match.players.map((player) => (
                    <div key={player.id} className="text-[10px]">
                      <p className="text-slate-500 text-[9px]">{player.username}</p>
                      {player.visit_history && player.visit_history.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {[...player.visit_history].reverse().slice(0, 3).map((visit, idx) => (
                            <span key={idx} className="inline-flex items-center gap-0.5 bg-slate-800/50 px-1 rounded text-[9px]">
                              <span className="text-slate-400">
                                {visit.dart1?.label}
                                {visit.dart2?.label ? `,${visit.dart2.label}` : ''}
                                {visit.dart3?.label ? `,${visit.dart3.label}` : ''}
                              </span>
                              {visit.completed_target && (
                                <span className="text-emerald-400">✓</span>
                              )}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-600 text-[9px]">No visits</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Game End Popup */}
      <Dialog open={showGameEndPopup} onOpenChange={setShowGameEndPopup}>
        <DialogContent className="bg-slate-900 border-purple-500/30 text-white max-w-xs p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base font-bold text-center flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Game Over!
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2">
            {match.players.find(p => p.is_winner) && (
              <div className="text-center">
                <p className="text-slate-400 text-xs mb-0.5">Winner</p>
                <p className="text-xl font-black text-emerald-400">
                  {match.players.find(p => p.is_winner)?.username}
                </p>
              </div>
            )}
            
            <div className="bg-slate-800/50 rounded p-2">
              <h4 className="text-xs font-semibold text-slate-400 mb-1">Final Stats</h4>
              <div className="space-y-1">
                {match.players.map((player) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-1.5 rounded ${
                      player.is_winner ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-white text-xs">{player.username}</span>
                      {player.is_winner && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-[9px] h-4 px-1">
                          <Trophy className="w-2 h-2 mr-0.5" />
                          Win
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-purple-400 text-xs">
                        {player.completed_targets?.length || 0}t
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-cyan-400 text-xs">
                        {player.total_darts_thrown || 0}d
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <Button
              onClick={handleEndGame}
              className="w-full py-2 text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              End Game
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
