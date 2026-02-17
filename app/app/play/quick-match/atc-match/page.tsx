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
  
  // Increase by segment: S=+1, D=+2, T=+3
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
  
  // Camera - always show for both players
  const toggleCamera = async () => {
    if (cameraEnabled) {
      cameraStream?.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    } else {
      await startCamera();
    }
  };
  
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
  
  // Refresh camera
  const refreshCamera = async () => {
    setIsRefreshingCamera(true);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    }
    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
    await startCamera();
    setIsRefreshingCamera(false);
    toast.success('Camera refreshed');
  };
  
  // Auto-enable camera when game starts
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
    
    // Initialize visit history for each player
    const playersWithHistory = match?.players.map(p => ({
      ...p,
      visit_history: []
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
  
  // Handle dart throw
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
    
    // Update current visit UI
    setCurrentVisit(prev => {
      const newVisit: Partial<Visit> = { ...prev, timestamp: new Date().toISOString() };
      if (!prev.dart1) newVisit.dart1 = dart;
      else if (!prev.dart2) newVisit.dart2 = dart;
      else newVisit.dart3 = dart;
      return newVisit;
    });
    
    const newDartCount = dartCount + 1;
    setDartCount(newDartCount);
    
    // Check if hit target
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
    
    if (hit) {
      // Update completed targets
      updatedPlayers[match.current_player_index].completed_targets.push(target);
      
      // Calculate next target
      let nextTarget: number | 'bull' | null;
      
      if (mode === 'increase' && match.atc_settings.order === 'sequential') {
        // Increase by segment mode
        nextTarget = calculateNextTarget(target, segment, allTargets);
      } else {
        // Normal mode - advance by 1
        const currentIndex = allTargets.indexOf(target);
        nextTarget = currentIndex < allTargets.length - 1 ? allTargets[currentIndex + 1] : null;
      }
      
      if (nextTarget === null) {
        // Player wins!
        updatedPlayers[match.current_player_index].is_winner = true;
        updatedPlayers[match.current_player_index].current_target = target;
        
        // Add visit to history
        const completedVisit: Visit = {
          ...currentVisit,
          dart1: !currentVisit.dart1 ? dart : currentVisit.dart1,
          dart2: currentVisit.dart1 && !currentVisit.dart2 ? dart : currentVisit.dart2,
          dart3: currentVisit.dart1 && currentVisit.dart2 ? dart : currentVisit.dart3,
          completed_target: target,
          timestamp: new Date().toISOString()
        };
        
        if (!updatedPlayers[match.current_player_index].visit_history) {
          updatedPlayers[match.current_player_index].visit_history = [];
        }
        updatedPlayers[match.current_player_index].visit_history!.push(completedVisit);
        
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
        // Update to next target
        updatedPlayers[match.current_player_index].current_target = nextTarget;
        
        // Add visit to history
        const completedVisit: Visit = {
          ...currentVisit,
          dart1: !currentVisit.dart1 ? dart : currentVisit.dart1,
          dart2: currentVisit.dart1 && !currentVisit.dart2 ? dart : currentVisit.dart2,
          dart3: currentVisit.dart1 && currentVisit.dart2 ? dart : currentVisit.dart3,
          completed_target: target,
          timestamp: new Date().toISOString()
        };
        
        if (!updatedPlayers[match.current_player_index].visit_history) {
          updatedPlayers[match.current_player_index].visit_history = [];
        }
        updatedPlayers[match.current_player_index].visit_history!.push(completedVisit);
        
        // Reset current visit for next dart
        setCurrentVisit({});
        setDartCount(0);
        
        // Update match immediately so other player sees progress
        await supabase
          .from('atc_matches')
          .update({ players: updatedPlayers })
          .eq('id', matchId);
        
        // If this was the third dart, end turn
        if (newDartCount >= 3) {
          await endTurn(updatedPlayers);
        }
        return;
      }
    }
    
    // If missed and 3 darts thrown, end turn
    if (newDartCount >= 3) {
      // Add visit to history (missed)
      const completedVisit: Visit = {
        ...currentVisit,
        dart1: !currentVisit.dart1 ? dart : currentVisit.dart1,
        dart2: currentVisit.dart1 && !currentVisit.dart2 ? dart : currentVisit.dart2,
        dart3: currentVisit.dart1 && currentVisit.dart2 ? dart : currentVisit.dart3,
        timestamp: new Date().toISOString()
      };
      
      if (!updatedPlayers[match.current_player_index].visit_history) {
        updatedPlayers[match.current_player_index].visit_history = [];
      }
      updatedPlayers[match.current_player_index].visit_history!.push(completedVisit);
      
      await endTurn(updatedPlayers);
    }
  };
  
  // Check if it's current user's turn
  const isMyTurn = () => {
    if (!match || !currentUser) return false;
    const currentPlayer = match.players[match.current_player_index];
    return currentPlayer?.id === currentUser && match.status === 'in_progress';
  };
  
  // Get current player
  const getCurrentPlayer = () => {
    if (!match) return null;
    return match.players[match.current_player_index];
  };
  
  // End turn
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
  
  // End game and return to lobby
  const handleEndGame = () => {
    router.push('/app/play/quick-match');
  };
  
  // Get player's display target
  const getPlayerTarget = (player: Player): string => {
    return getTargetLabel(player.current_target || 1);
  };
  
  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-400" />
      </div>
    );
  }
  
  if (!match) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
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
      <div className="h-screen w-screen bg-slate-950 p-4 overflow-hidden flex flex-col">
        <div className="max-w-4xl mx-auto w-full space-y-4 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <Link href="/app/play/quick-match">
              <Button variant="ghost" className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Leave
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-white">Around The Clock</h1>
            <div className="w-20" />
          </div>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-3 mb-3">
              <Target className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-bold text-white">Match Settings</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs">Order</p>
                <p className="text-white font-bold text-sm">{match.atc_settings.order === 'sequential' ? '1-20 + Bull' : 'Random'}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs">Mode</p>
                <p className="text-white font-bold text-sm capitalize">{match.atc_settings.mode.replace('_', ' ')}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-slate-400 text-xs">Players</p>
                <p className="text-white font-bold">{match.atc_settings.player_count}</p>
              </div>
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Users className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Players</h2>
            </div>
            <div className="space-y-2">
              {match.players?.map((player) => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{player.username}</span>
                    {player.id === match.created_by && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs">Host</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.is_ready ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ready
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-700 text-slate-400 text-xs">Not Ready</Badge>
                    )}
                  </div>
                </div>
              ))}
              
              {Array.from({ length: (match.atc_settings.player_count - (match.players?.length || 0)) }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700"
                >
                  <span className="text-slate-500 text-sm">Waiting for player...</span>
                  <Badge className="bg-slate-700 text-slate-500 text-xs">Empty</Badge>
                </div>
              ))}
            </div>
          </Card>
          
          <Button
            className={`w-full py-4 text-lg font-bold ${
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
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-8">Choosing Starting Player...</h2>
          
          <div className="relative w-80 h-80 mx-auto">
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
                        className="text-white font-bold text-lg"
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
              <p className="text-4xl font-bold text-emerald-400">{selectedPlayer.username}</p>
            </motion.div>
          )}
        </div>
      </div>
    );
  }
  
  // In Progress - COMPACT LAYOUT
  const currentPlayer = getCurrentPlayer();
  const target = currentPlayer?.current_target;
  const mode = match.atc_settings.mode;
  const isIncreaseMode = mode === 'increase' && match.atc_settings.order === 'sequential';
  const opponent = match.players.find(p => p.id !== currentUser);
  
  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Bar - Compact */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-3 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <Link href="/app/play/quick-match">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white h-8">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Exit
            </Button>
          </Link>
          
          <div className="flex items-center gap-2">
            {match.players?.map((player) => (
              <div 
                key={player.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded ${
                  player.id === currentPlayer?.id 
                    ? 'bg-emerald-500/20 border border-emerald-500/40' 
                    : 'bg-slate-800/50'
                }`}
              >
                <span className="text-white text-xs font-medium">{player.username}</span>
                <Badge className="bg-purple-500/20 text-purple-400 text-[10px] px-1">
                  {getPlayerTarget(player)}
                </Badge>
                <span className="text-slate-400 text-[10px]">({player.completed_targets?.length || 0}/21)</span>
              </div>
            ))}
          </div>
          
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={refreshCamera}
              disabled={isRefreshingCamera}
              className="text-slate-400 hover:text-emerald-400 h-8 w-8 p-0"
              title="Refresh Camera"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingCamera ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={toggleCamera}
              className={cameraEnabled ? 'text-emerald-400 h-8 w-8 p-0' : 'text-slate-400 h-8 w-8 p-0'}
            >
              {cameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Game Area - Compact Split */}
      <div className="flex-1 flex min-h-0 p-2 gap-2">
        {/* LEFT SIDE - Camera & Target */}
        <div className="w-1/2 flex flex-col gap-2">
          {/* Camera */}
          <div className="flex-1 bg-slate-900 rounded-xl overflow-hidden relative min-h-0">
            {cameraEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <CameraOff className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Camera Off</p>
                  <Button onClick={startCamera} className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-xs h-8">
                    <Camera className="w-3 h-3 mr-1" />
                    Enable
                  </Button>
                </div>
              </div>
            )}
            
            {/* Turn Indicator */}
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
              <span className="text-white font-bold text-sm">
                {isMyTurn() ? '🎯 Your Turn' : `👀 ${currentPlayer?.username}'s Turn`}
              </span>
            </div>
            
            {/* Refresh Opponent Camera Button - shown when it's opponent's turn */}
            {!isMyTurn() && opponent && (
              <div className="absolute top-2 right-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toast.info('Ask opponent to refresh their camera')}
                  className="bg-black/50 hover:bg-black/70 text-white text-xs h-7 px-2"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Opponent Cam
                </Button>
              </div>
            )}
          </div>
          
          {/* Current Target - Compact */}
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 rounded-xl p-3 text-center border border-purple-500/30 shrink-0">
            <p className="text-purple-300 text-xs uppercase tracking-wider">
              {isMyTurn() ? 'You need to hit' : `${currentPlayer?.username} needs to hit`}
            </p>
            <p className="text-5xl font-black text-white drop-shadow-lg leading-none mt-1">
              {getCurrentTarget()}
            </p>
          </div>
        </div>
        
        {/* RIGHT SIDE - Scoring / Waiting */}
        <div className="w-1/2 flex flex-col min-h-0">
          {isMyTurn() ? (
            /* USER'S TURN */
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              {/* Current Visit - Compact */}
              <div className="flex justify-center gap-2 shrink-0">
                {[currentVisit.dart1, currentVisit.dart2, currentVisit.dart3].map((dart, i) => (
                  <motion.div 
                    key={i}
                    initial={dart ? { scale: 0.8, opacity: 0 } : {}}
                    animate={dart ? { scale: 1, opacity: 1 } : {}}
                    className={`w-16 h-16 rounded-lg flex items-center justify-center text-xl font-bold ${
                      dart ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40' : 'bg-slate-800/50 text-slate-600 border-2 border-slate-700'
                    }`}
                  >
                    {dart?.label || '-'}
                  </motion.div>
                ))}
              </div>
              
              {/* Scoring Buttons - Compact */}
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                {target === 'bull' ? (
                  /* Bull Mode */
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    {(mode === 'singles' || mode === 'increase') && (
                      <Button
                        onClick={() => handleDartThrow('SB')}
                        className="h-full text-2xl font-black bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500"
                      >
                        Single Bull
                      </Button>
                    )}
                    {(mode === 'doubles' || mode === 'increase') && (
                      <Button
                        onClick={() => handleDartThrow('DB')}
                        className="h-full text-2xl font-black bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500"
                      >
                        Double Bull
                      </Button>
                    )}
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-full text-xl font-bold bg-slate-700 hover:bg-slate-600 col-span-full"
                    >
                      Miss
                    </Button>
                  </div>
                ) : isIncreaseMode ? (
                  /* Increase Mode */
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleDartThrow('S', target as number)}
                      className="h-full text-3xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500"
                    >
                      S{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('D', target as number)}
                      className="h-full text-3xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
                    >
                      D{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('T', target as number)}
                      className="h-full text-3xl font-black bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500"
                    >
                      T{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-full text-2xl font-bold bg-slate-700 hover:bg-slate-600"
                    >
                      Miss
                    </Button>
                  </div>
                ) : (
                  /* Singles/Doubles/Trebles Mode */
                  <div className="flex-1 flex flex-col gap-2">
                    <Button
                      onClick={() => handleDartThrow(
                        mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T', 
                        target as number
                      )}
                      className={`flex-1 text-5xl font-black ${
                        mode === 'singles' ? 'bg-gradient-to-br from-cyan-500 to-cyan-600' :
                        mode === 'doubles' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
                        'bg-gradient-to-br from-amber-500 to-amber-600'
                      }`}
                    >
                      {mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T'}{target}
                    </Button>
                    <Button
                      onClick={() => handleDartThrow('MISS')}
                      className="h-20 text-2xl font-bold bg-slate-700 hover:bg-slate-600"
                    >
                      Miss
                    </Button>
                  </div>
                )}
                
                {/* Progress */}
                <div className="bg-slate-900/50 rounded-lg p-2 text-center shrink-0">
                  <p className="text-slate-400 text-xs">
                    Completed: {currentPlayer?.completed_targets?.length || 0} / 21
                  </p>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ width: `${((currentPlayer?.completed_targets?.length || 0) / 21) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* OPPONENT'S TURN */
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              {/* Status */}
              <div className="flex items-center gap-2 text-white shrink-0">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span className="text-sm">Waiting for {currentPlayer?.username}...</span>
              </div>
              
              {/* Player Status */}
              <div className="space-y-1.5 shrink-0">
                {match.players.map((player) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      player.id === currentPlayer?.id 
                        ? 'bg-emerald-500/10 border border-emerald-500/30' 
                        : 'bg-slate-900/50 border border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        player.id === currentPlayer?.id ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                      }`} />
                      <span className="text-white text-sm">{player.username}</span>
                      {player.id === currentUser && (
                        <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">
                        {getPlayerTarget(player)}
                      </Badge>
                      <span className="text-slate-400 text-xs">
                        {player.completed_targets?.length || 0}/21
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Visit History - Compact */}
              <div className="flex-1 bg-slate-900/50 rounded-lg p-2 overflow-hidden flex flex-col min-h-0">
                <h4 className="text-xs font-semibold text-slate-400 mb-1 shrink-0">Visit History</h4>
                <div className="flex-1 overflow-auto space-y-1">
                  {match.players.map((player) => (
                    <div key={player.id} className="text-xs">
                      <p className="text-slate-500 text-[10px] mb-0.5">{player.username}</p>
                      {player.visit_history && player.visit_history.length > 0 ? (
                        <div className="space-y-0.5">
                          {[...player.visit_history].reverse().slice(0, 3).map((visit, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="text-slate-600">#{player.visit_history!.length - idx}</span>
                              <span className="text-slate-400">
                                {visit.dart1?.label || '-'}
                                {visit.dart2?.label ? `,${visit.dart2.label}` : ''}
                                {visit.dart3?.label ? `,${visit.dart3.label}` : ''}
                              </span>
                              {visit.completed_target && (
                                <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1">
                                  ✓{getTargetLabel(visit.completed_target)}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-600">No visits</p>
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
        <DialogContent className="bg-slate-900 border-purple-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
              <Trophy className="w-6 h-6 text-amber-400" />
              Game Over!
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Winner */}
            {match.players.find(p => p.is_winner) && (
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-1">Winner</p>
                <p className="text-3xl font-black text-emerald-400">
                  {match.players.find(p => p.is_winner)?.username}
                </p>
              </div>
            )}
            
            {/* Stats */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-slate-400 mb-2">Final Stats</h4>
              <div className="space-y-1.5">
                {match.players.map((player) => (
                  <div 
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded ${
                      player.is_winner ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{player.username}</span>
                      {player.is_winner && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                          <Trophy className="w-3 h-3 mr-1" />
                          Winner
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-purple-400">
                        {player.completed_targets?.length || 0} targets
                      </span>
                      <span className="text-slate-500">
                        {player.visit_history?.length || 0} visits
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* End Game Button */}
            <Button
              onClick={handleEndGame}
              className="w-full py-4 text-base font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              End Game
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
