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
  Camera, CameraOff, Loader2, Trophy 
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// Types
interface Player {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
  current_target: number | 'bull';
  completed_targets: (number | 'bull')[];
  is_winner: boolean;
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

interface Visit {
  dart1?: { segment: string; number?: number; label: string };
  dart2?: { segment: string; number?: number; label: string };
  dart3?: { segment: string; number?: number; label: string };
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
    // Shuffle array
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
  }
  
  return targets;
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
  const [currentVisit, setCurrentVisit] = useState<Visit>({});
  const [dartCount, setDartCount] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
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
      
      // Fetch match data
      const { data: matchData } = await supabase
        .from('atc_matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
        
      if (matchData) {
        setMatch(matchData as ATCMatch);
        const currentPlayer = matchData.players?.find((p: Player) => p.id === user.id);
        setIsReady(currentPlayer?.is_ready || false);
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
          
          // Check if all players are ready
          if (updatedMatch.status === 'starting' && !showWheel) {
            setShowWheel(true);
            spinWheel(updatedMatch.players);
          }
          
          // Update current player ready status
          const currentPlayer = updatedMatch.players?.find((p: Player) => p.id === currentUser);
          setIsReady(currentPlayer?.is_ready || false);
        }
      )
      .subscribe();
      
    return () => {
      channel.unsubscribe();
    };
  }, [matchId, currentUser]);
  
  // Camera setup
  const toggleCamera = async () => {
    if (cameraEnabled) {
      cameraStream?.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setCameraEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStream(stream);
        setCameraEnabled(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        toast.error('Could not access camera');
      }
    }
  };
  
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
      
    // Check if all players ready
    const allReady = updatedPlayers.every(p => p.is_ready);
    if (allReady && updatedPlayers.length >= 2) {
      await supabase
        .from('atc_matches')
        .update({ status: 'starting' })
        .eq('id', matchId);
    }
  };
  
  // Spinning wheel animation
  const spinWheel = (players: Player[]) => {
    setWheelSpinning(true);
    
    // Simulate spinning
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * players.length);
      setSelectedPlayer(players[randomIndex]);
      setWheelSpinning(false);
      
      // Start game after showing result
      setTimeout(() => {
        setShowWheel(false);
        startGame(players[randomIndex].id);
      }, 2000);
    }, 3000);
  };
  
  const startGame = async (startingPlayerId: string) => {
    const startingIndex = match?.players.findIndex(p => p.id === startingPlayerId) || 0;
    
    await supabase
      .from('atc_matches')
      .update({ 
        status: 'in_progress',
        current_player_index: startingIndex 
      })
      .eq('id', matchId);
  };
  
  // Handle dart throw
  const handleDartThrow = (segment: string, number?: number) => {
    if (!match || !isMyTurn()) return;
    
    const label = segment === 'MISS' ? 'Miss' : 
                  segment === 'SB' ? 'SB' :
                  segment === 'DB' ? 'DB' :
                  `${segment}${number}`;
    
    const dart = { segment, number, label };
    
    setCurrentVisit(prev => {
      const newVisit = { ...prev };
      if (!prev.dart1) newVisit.dart1 = dart;
      else if (!prev.dart2) newVisit.dart2 = dart;
      else newVisit.dart3 = dart;
      return newVisit;
    });
    
    setDartCount(prev => prev + 1);
    
    // If 3 darts thrown, end turn
    if (dartCount >= 2) {
      setTimeout(() => endTurn(), 500);
    }
  };
  
  // Check if it's current user's turn
  const isMyTurn = () => {
    if (!match || !currentUser) return false;
    const currentPlayer = match.players[match.current_player_index];
    return currentPlayer?.id === currentUser && match.status === 'in_progress';
  };
  
  // End turn and move to next player
  const endTurn = async () => {
    if (!match) return;
    
    // Check if current player hit their target
    const currentPlayer = match.players[match.current_player_index];
    const target = currentPlayer.current_target;
    
    let hit = false;
    // Check if any dart hit the target
    [currentVisit.dart1, currentVisit.dart2, currentVisit.dart3].forEach(dart => {
      if (!dart) return;
      
      if (target === 'bull') {
        if (match.atc_settings.mode === 'singles' && dart.segment === 'SB') hit = true;
        else if (match.atc_settings.mode === 'doubles' && dart.segment === 'DB') hit = true;
        else if (match.atc_settings.mode === 'increase' && (dart.segment === 'SB' || dart.segment === 'DB')) hit = true;
      } else {
        if (match.atc_settings.mode === 'singles' && dart.segment === 'S' && dart.number === target) hit = true;
        else if (match.atc_settings.mode === 'doubles' && dart.segment === 'D' && dart.number === target) hit = true;
        else if (match.atc_settings.mode === 'trebles' && dart.segment === 'T' && dart.number === target) hit = true;
        else if (match.atc_settings.mode === 'increase' && dart.number === target) hit = true;
      }
    });
    
    // Update player progress
    const updatedPlayers = [...match.players];
    if (hit) {
      updatedPlayers[match.current_player_index].completed_targets.push(target);
      const allTargets = generateTargets(match.atc_settings.order);
      const nextTargetIndex = updatedPlayers[match.current_player_index].completed_targets.length;
      
      if (nextTargetIndex >= allTargets.length) {
        // Player won!
        updatedPlayers[match.current_player_index].is_winner = true;
        await supabase
          .from('atc_matches')
          .update({ 
            status: 'completed',
            winner_id: currentPlayer.id,
            players: updatedPlayers
          })
          .eq('id', matchId);
        toast.success(`${currentPlayer.username} wins!`);
        return;
      } else {
        updatedPlayers[match.current_player_index].current_target = allTargets[nextTargetIndex];
      }
    }
    
    // Move to next player
    const nextIndex = (match.current_player_index + 1) % updatedPlayers.length;
    
    await supabase
      .from('atc_matches')
      .update({ 
        players: updatedPlayers,
        current_player_index: nextIndex 
      })
      .eq('id', matchId);
      
    setCurrentVisit({});
    setDartCount(0);
  };
  
  // Get current target for display
  const getCurrentTarget = (): string => {
    if (!match) return '';
    const currentPlayer = match.players[match.current_player_index];
    return getTargetLabel(currentPlayer?.current_target || 1);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }
  
  if (!match) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
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
      <div className="min-h-screen bg-slate-950 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
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
          
          {/* Match Settings */}
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold text-white">Match Settings</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Order</p>
                <p className="text-white font-bold">{match.atc_settings.order === 'sequential' ? '1-20 + Bull' : 'Random'}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Mode</p>
                <p className="text-white font-bold capitalize">{match.atc_settings.mode.replace('_', ' ')}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Players</p>
                <p className="text-white font-bold">{match.atc_settings.player_count}</p>
              </div>
            </div>
          </Card>
          
          {/* Player List */}
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Players</h2>
            </div>
            <div className="space-y-3">
              {match.players?.map((player, index) => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{player.username}</span>
                    {player.id === match.created_by && (
                      <Badge className="bg-amber-500/20 text-amber-400">Host</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.is_ready ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ready
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-700 text-slate-400">Not Ready</Badge>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Empty slots */}
              {Array.from({ length: (match.atc_settings.player_count - (match.players?.length || 0)) }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700"
                >
                  <span className="text-slate-500">Waiting for player...</span>
                  <Badge className="bg-slate-700 text-slate-500">Empty</Badge>
                </div>
              ))}
            </div>
          </Card>
          
          {/* Ready Button */}
          <Button
            className={`w-full py-6 text-lg font-bold ${
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-8">Choosing Starting Player...</h2>
          
          <div className="relative w-80 h-80 mx-auto">
            {/* Wheel */}
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
            
            {/* Center pointer */}
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
  
  // In Progress - Game UI
  const currentPlayer = match.players[match.current_player_index];
  
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col w-full">
      {/* Top Bar - Player Progress */}
      <div className="bg-slate-900/80 border-b border-slate-800 p-4">
        <div className="flex items-center justify-between max-w-full mx-auto">
          <Link href="/app/play/quick-match">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Exit
            </Button>
          </Link>
          
          <div className="flex items-center gap-4">
            {match.players?.map((player) => (
              <div 
                key={player.id}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
                  player.id === currentPlayer?.id 
                    ? 'bg-emerald-500/20 border border-emerald-500/40' 
                    : 'bg-slate-800/50'
                }`}
              >
                <span className="text-white text-sm font-medium">{player.username}</span>
                <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                  {getTargetLabel(player.current_target || 1)}
                </Badge>
                <span className="text-slate-400 text-xs">({player.completed_targets?.length || 0}/21)</span>
              </div>
            ))}
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleCamera}
            className={cameraEnabled ? 'text-emerald-400' : 'text-slate-400'}
          >
            {cameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      {/* Main Game Area - Full Width */}
      <div className="flex-1 flex">
        {/* Camera Feed */}
        {cameraEnabled && (
          <div className="w-1/3 bg-slate-900 p-4">
            <Card className="h-full bg-slate-800 border-slate-700 overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </Card>
          </div>
        )}
        
        {/* Scoring Area */}
        <div className={`${cameraEnabled ? 'w-2/3' : 'w-full'} p-4 flex flex-col`}>
          {/* Current Turn Info */}
          <div className="text-center mb-6">
            <p className="text-slate-400 mb-2">
              {isMyTurn() ? "Your Turn" : `${currentPlayer?.username}'s Turn`}
            </p>
            <div className="inline-flex items-center gap-4 bg-slate-800/50 rounded-2xl px-8 py-4">
              <span className="text-slate-400">Target:</span>
              <span className="text-6xl font-black text-white">{getCurrentTarget()}</span>
            </div>
          </div>
          
          {/* Current Visit Display */}
          <div className="flex justify-center gap-4 mb-6">
            {[currentVisit.dart1, currentVisit.dart2, currentVisit.dart3].map((dart, i) => (
              <div 
                key={i}
                className={`w-24 h-24 rounded-xl flex items-center justify-center text-2xl font-bold ${
                  dart ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40' : 'bg-slate-800/50 text-slate-600 border-2 border-slate-700'
                }`}
              >
                {dart?.label || '-'}
              </div>
            ))}
          </div>
          
          {/* Scoring Buttons */}
          {isMyTurn() && (
            <div className="flex-1">
              {renderScoringButtons()}
            </div>
          )}
          
          {!isMyTurn() && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-slate-500 text-xl">Waiting for opponent...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
  
  function renderScoringButtons() {
    const target = currentPlayer?.current_target;
    const mode = match?.atc_settings.mode;
    
    if (target === 'bull') {
      // Bull buttons
      return (
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          {(mode === 'singles' || mode === 'increase') && (
            <Button
              onClick={() => handleDartThrow('SB')}
              className="h-24 text-2xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500"
            >
              Single Bull
            </Button>
          )}
          {(mode === 'doubles' || mode === 'increase') && (
            <Button
              onClick={() => handleDartThrow('DB')}
              className="h-24 text-2xl font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500"
            >
              Double Bull
            </Button>
          )}
          <Button
            onClick={() => handleDartThrow('MISS')}
            className="h-24 text-2xl font-bold bg-slate-700 hover:bg-slate-600 col-span-2"
          >
            Miss
          </Button>
        </div>
      );
    }
    
    // Number buttons
    const targetNum = target as number;
    
    if (mode === 'singles') {
      return (
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <Button
            onClick={() => handleDartThrow('S', targetNum)}
            className="h-32 text-4xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500"
          >
            S{targetNum}
          </Button>
          <Button
            onClick={() => handleDartThrow('MISS')}
            className="h-32 text-2xl font-bold bg-slate-700 hover:bg-slate-600"
          >
            Miss
          </Button>
        </div>
      );
    }
    
    if (mode === 'doubles') {
      return (
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <Button
            onClick={() => handleDartThrow('D', targetNum)}
            className="h-32 text-4xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500"
          >
            D{targetNum}
          </Button>
          <Button
            onClick={() => handleDartThrow('MISS')}
            className="h-32 text-2xl font-bold bg-slate-700 hover:bg-slate-600"
          >
            Miss
          </Button>
        </div>
      );
    }
    
    if (mode === 'trebles') {
      return (
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <Button
            onClick={() => handleDartThrow('T', targetNum)}
            className="h-32 text-4xl font-black bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500"
          >
            T{targetNum}
          </Button>
          <Button
            onClick={() => handleDartThrow('MISS')}
            className="h-32 text-2xl font-bold bg-slate-700 hover:bg-slate-600"
          >
            Miss
          </Button>
        </div>
      );
    }
    
    // Increase mode - show all options
    return (
      <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
        <Button
          onClick={() => handleDartThrow('S', targetNum)}
          className="h-24 text-2xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600"
        >
          S{targetNum}
        </Button>
        <Button
          onClick={() => handleDartThrow('D', targetNum)}
          className="h-24 text-2xl font-bold bg-gradient-to-br from-emerald-500 to-emerald-600"
        >
          D{targetNum}
        </Button>
        <Button
          onClick={() => handleDartThrow('T', targetNum)}
          className="h-24 text-2xl font-bold bg-gradient-to-br from-teal-500 to-teal-600"
        >
          T{targetNum}
        </Button>
        <Button
          onClick={() => handleDartThrow('MISS')}
          className="h-24 text-2xl font-bold bg-slate-700 hover:bg-slate-600"
        >
          Miss
        </Button>
      </div>
    );
  }
}
