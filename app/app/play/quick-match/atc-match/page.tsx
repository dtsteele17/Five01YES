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
  Zap, Crosshair, Wifi, WifiOff, RotateCcw, UserPlus,
  Crown, Undo2
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
import { useATCWebRTC } from '@/lib/hooks/useATCWebRTC';

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
  progress,
  compact = false
}: { 
  player: Player; 
  isCurrentPlayer: boolean;
  isCurrentUser: boolean;
  progress: number;
  compact?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl ${compact ? 'p-2' : 'p-4'} ${
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
        <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
          <div className={`${compact ? 'w-8 h-8 text-sm' : 'w-12 h-12 text-lg'} rounded-full flex items-center justify-center font-bold ${
            isCurrentPlayer 
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-gradient-to-br from-slate-600 to-slate-700 text-slate-300'
          }`}>
            {player.username.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className={`font-bold truncate ${compact ? 'text-sm' : 'text-lg'} ${isCurrentPlayer ? 'text-white' : 'text-slate-300'}`}>
                {player.username}
              </h3>
              {isCurrentUser && !compact && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                  You
                </Badge>
              )}
            </div>
            {!compact && (
              <p className="text-xs text-slate-400">
                {isCurrentPlayer ? 'Currently Throwing' : 'Waiting'}
              </p>
            )}
          </div>
          {isCurrentPlayer && (
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
          )}
        </div>
        
        {/* Current Target - Big Display */}
        <div className={`text-center rounded-xl mb-2 ${compact ? 'py-1' : 'py-3'} ${
          isCurrentPlayer 
            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30' 
            : 'bg-slate-900/50 border border-slate-700/30'
        }`}>
          <p className={`text-slate-400 uppercase tracking-wider mb-0.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Target</p>
          <p className={`font-black ${compact ? 'text-2xl' : 'text-4xl'} ${isCurrentPlayer ? 'text-white' : 'text-slate-400'}`}>
            {getTargetLabel(player.current_target || 1)}
          </p>
        </div>
        
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{compact ? 'Prog' : 'Progress'}</span>
            <span className={`font-bold ${isCurrentPlayer ? 'text-emerald-400' : 'text-slate-400'}`}>
              {player.completed_targets?.length || 0}/21
            </span>
          </div>
          <div className="h-2 bg-slate-900/50 rounded-full overflow-hidden">
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
        
        {/* Stats Row - Hidden in compact mode */}
        {!compact && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className={`text-center p-2 rounded-lg ${isCurrentPlayer ? 'bg-emerald-500/10' : 'bg-slate-900/30'}`}>
              <p className="text-xs text-slate-400">Darts</p>
              <p className={`text-lg font-bold ${isCurrentPlayer ? 'text-emerald-400' : 'text-slate-300'}`}>
                {player.total_darts_thrown || 0}
              </p>
            </div>
            <div className={`text-center p-2 rounded-lg ${isCurrentPlayer ? 'bg-purple-500/10' : 'bg-slate-900/30'}`}>
              <p className="text-xs text-slate-400">Done</p>
              <p className={`text-lg font-bold ${isCurrentPlayer ? 'text-purple-400' : 'text-slate-300'}`}>
                {player.completed_targets?.length || 0}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Calculate preview target based on pending darts
function calculatePreviewTarget(
  startTarget: number | 'bull',
  darts: Array<{segment: string, number?: number}>,
  mode: string,
  order: 'sequential' | 'random'
): { target: number | 'bull', hits: number } {
  const allTargets = generateTargets(order);
  let currentTarget = startTarget;
  let hits = 0;
  
  for (const dart of darts) {
    const { segment, number } = dart;
    let hit = false;
    
    if (currentTarget === 'bull') {
      if (mode === 'singles' && segment === 'SB') hit = true;
      else if (mode === 'doubles' && segment === 'DB') hit = true;
      else if (mode === 'increase' && (segment === 'SB' || segment === 'DB')) hit = true;
    } else {
      if (mode === 'singles' && segment === 'S' && number === currentTarget) hit = true;
      else if (mode === 'doubles' && segment === 'D' && number === currentTarget) hit = true;
      else if (mode === 'trebles' && segment === 'T' && number === currentTarget) hit = true;
      else if (mode === 'increase' && number === currentTarget) hit = true;
    }
    
    if (hit) {
      hits++;
      const currentIndex = allTargets.indexOf(currentTarget);
      if (currentIndex < allTargets.length - 1) {
        if (mode === 'increase' && order === 'sequential') {
          let advance = 1;
          if (segment === 'D') advance = 2;
          else if (segment === 'T') advance = 3;
          const nextIndex = Math.min(currentIndex + advance, allTargets.length - 1);
          currentTarget = allTargets[nextIndex];
        } else {
          currentTarget = allTargets[currentIndex + 1];
        }
      }
    }
  }
  
  return { target: currentTarget, hits };
}

// Current Visit Display Component
function CurrentVisitDisplay({ 
  visit, 
  dartCount,
  previewTarget,
  startTarget
}: { 
  visit: Partial<Visit>; 
  dartCount: number;
  previewTarget: number | 'bull';
  startTarget: number | 'bull';
}) {
  const darts = [visit.dart1, visit.dart2, visit.dart3];
  const targetChanged = previewTarget !== startTarget;
  
  return (
    <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Current Visit</h4>
        <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
          {dartCount}/3
        </Badge>
      </div>
      
      {/* Darts - Smaller display */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {darts.map((dart, i) => (
          <motion.div 
            key={i}
            initial={dart ? { scale: 0.8, opacity: 0 } : {}}
            animate={dart ? { scale: 1, opacity: 1 } : {}}
            className={`aspect-[4/3] rounded-lg flex flex-col items-center justify-center ${
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
                <span className="text-lg font-black leading-none">{dart.label}</span>
                {dart.segment !== 'MISS' && (
                  <span className="text-[10px] opacity-80 leading-tight mt-0.5">
                    {dart.segment === 'D' ? 'Dbl' : dart.segment === 'T' ? 'Trp' : 'Sgl'}
                  </span>
                )}
              </>
            ) : (
              <span className="text-lg font-bold text-slate-600">{i + 1}</span>
            )}
          </motion.div>
        ))}
      </div>
      
      {/* Preview Target */}
      <div className={`text-center p-2 rounded-lg border ${
        targetChanged 
          ? 'bg-emerald-500/10 border-emerald-500/30' 
          : 'bg-slate-800/50 border-slate-700/30'
      }`}>
        <span className="text-xs text-slate-400">Target: </span>
        <span className={`text-lg font-black ${targetChanged ? 'text-emerald-400' : 'text-white'}`}>
          {previewTarget === 'bull' ? 'BULL' : previewTarget}
        </span>
        {targetChanged && (
          <span className="text-xs text-emerald-400 ml-2">(hit!)</span>
        )}
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
  
  // Get all player IDs for multi-player WebRTC
  const allPlayerIds = match?.players?.map((p: Player) => p.id) || [];
  const currentTurnPlayer = match?.players?.[match?.current_player_index || 0];
  const isCurrentUserTurn = currentTurnPlayer?.id === currentUser;
  
  // WebRTC Camera Hook - Multi-player support
  const webrtc = useATCWebRTC({
    matchId: matchId,
    myUserId: currentUser,
    isMatchActive: match?.status === 'in_progress',
    currentPlayerId: currentTurnPlayer?.id || null,
    isMyTurn: isCurrentUserTurn,
    allPlayerIds: allPlayerIds,
  });
  
  const {
    localStream,
    remoteStreams,
    activeStream,
    activePlayerId,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
    refreshConnection,
  } = webrtc;
  
  // Debug logging for camera connection
  useEffect(() => {
    console.log('[ATC CAMERA DEBUG] ==========');
    console.log('[ATC CAMERA DEBUG] localStream:', localStream ? 'yes' : 'no');
    console.log('[ATC CAMERA DEBUG] remoteStreams count:', remoteStreams.size);
    console.log('[ATC CAMERA DEBUG] remoteStreams keys:', Array.from(remoteStreams.keys()));
    console.log('[ATC CAMERA DEBUG] activeStream:', activeStream ? 'yes' : 'no');
    console.log('[ATC CAMERA DEBUG] activePlayerId:', activePlayerId);
    console.log('[ATC CAMERA DEBUG] currentPlayerId (from match):', currentTurnPlayer?.id);
    console.log('[ATC CAMERA DEBUG] isCameraOn:', isCameraOn);
    console.log('[ATC CAMERA DEBUG] callStatus:', callStatus);
    console.log('[ATC CAMERA DEBUG] currentTurnPlayer:', currentTurnPlayer?.username);
    console.log('[ATC CAMERA DEBUG] isMyTurn:', isCurrentUserTurn);
    console.log('[ATC CAMERA DEBUG] ==========');
  }, [localStream, remoteStreams, activeStream, activePlayerId, isCameraOn, callStatus, currentTurnPlayer, isCurrentUserTurn]);
  
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
  
  // Callback refs for video elements - FIXED to handle AbortError when element removed
  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && localStream) {
      console.log('[CAMERA] Attaching local stream to video element');
      el.srcObject = localStream;
      // Only play if element is still in document and ready
      if (el.isConnected) {
        el.play().catch(err => {
          // Ignore AbortError - happens when element is removed during play
          if (err.name !== 'AbortError') {
            console.error('[CAMERA] Error playing local:', err);
          }
        });
      }
    }
    localVideoRef.current = el;
  }, [localStream]);

  const setRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el) {
      if (activeStream) {
        console.log('[CAMERA] Attaching active stream to video element');
        el.srcObject = activeStream;
        el.play().catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[CAMERA] Error playing video:', err);
          }
        });
      } else {
        el.srcObject = null;
      }
    }
    remoteVideoRef.current = el;
  }, [activeStream]);
  
  // Note: Camera auto-start is now handled by the useATCWebRTC hook based on isMyTurn
  
  // Cleanup camera on unmount - FIXED to not trigger during re-renders
  useEffect(() => {
    return () => {
      // Only stop camera if we're actually unmounting (navigating away)
      // This is handled by the component unmount, not by effect cleanup
      console.log('[CAMERA] Component unmounting, stopping camera');
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount/unmount
  
  // Re-attach streams when refs are available (handles remounting)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      const el = localVideoRef.current;
      if (el.srcObject !== localStream) {
        console.log('[CAMERA] Re-attaching local stream');
        el.srcObject = localStream;
        if (el.isConnected) {
          el.play().catch((err: Error) => {
            if (err.name !== 'AbortError') {
              console.error('[CAMERA] Error re-playing local:', err);
            }
          });
        }
      }
    }
  }, [localStream]);
  
  // Handle active stream changes - re-attach when it changes
  useEffect(() => {
    console.log('[CAMERA] Active stream changed:', activeStream ? 'has stream' : 'no stream');
    if (remoteVideoRef.current) {
      const el = remoteVideoRef.current;
      if (activeStream && el.srcObject !== activeStream) {
        console.log('[CAMERA] Re-attaching stream');
        el.srcObject = activeStream;
        el.play().catch((err: Error) => {
          if (err.name !== 'AbortError') {
            console.error('[CAMERA] Error re-playing:', err);
          }
        });
      } else if (!activeStream) {
        el.srcObject = null;
      }
    }
  }, [activeStream]);
  
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
  
  // Store pending darts locally before submitting
  const [pendingDarts, setPendingDarts] = useState<Array<{segment: string, number?: number, label: string}>>([]);
  const [previewTarget, setPreviewTarget] = useState<number | 'bull'>(1);

  // Update preview target whenever pending darts change
  // IMPORTANT: Only depend on pendingDarts, NOT match, to avoid re-renders on every realtime update
  // The match target only changes on turn change (when pendingDarts is cleared) or submit
  useEffect(() => {
    if (!match) return;
    const currentPlayer = match.players[match.current_player_index];
    const startTarget = currentPlayer?.current_target || 1;
    const mode = match.atc_settings.mode;
    const order = match.atc_settings.order;
    
    const { target } = calculatePreviewTarget(startTarget, pendingDarts, mode, order);
    setPreviewTarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDarts]);

  // Handle dart throw - Add dart to pending list (does NOT submit)
  const handleDartThrow = (segment: string, number?: number) => {
    if (!match || !isMyTurn()) return;
    if (pendingDarts.length >= 3) return; // Max 3 darts
    
    const label = segment === 'MISS' ? 'Miss' : 
                  segment === 'SB' ? 'SB' :
                  segment === 'DB' ? 'DB' :
                  `${segment}${number}`;
    
    const dart = { segment, number, label };
    
    // Add to pending darts
    setPendingDarts(prev => [...prev, dart]);
    
    // Update current visit display
    setCurrentVisit(prev => {
      const newVisit: Partial<Visit> = { ...prev, timestamp: new Date().toISOString() };
      if (!prev.dart1) newVisit.dart1 = dart;
      else if (!prev.dart2) newVisit.dart2 = dart;
      else newVisit.dart3 = dart;
      return newVisit;
    });
    
    setDartCount(prev => prev + 1);
  };

  // Undo last dart
  const handleUndoLastDart = () => {
    if (pendingDarts.length === 0) return;
    
    // Remove last pending dart
    setPendingDarts(prev => prev.slice(0, -1));
    
    // Update current visit display
    setCurrentVisit(prev => {
      const newVisit: Partial<Visit> = { ...prev };
      if (prev.dart3) {
        delete newVisit.dart3;
      } else if (prev.dart2) {
        delete newVisit.dart2;
      } else if (prev.dart1) {
        delete newVisit.dart1;
      }
      return newVisit;
    });
    
    setDartCount(prev => Math.max(0, prev - 1));
  };

  // Submit the visit - Process all pending darts and end turn
  const handleSubmitVisit = async () => {
    if (!match || !isMyTurn() || pendingDarts.length === 0) return;
    
    const currentPlayer = match.players[match.current_player_index];
    const allTargets = generateTargets(match.atc_settings.order);
    const updatedPlayers = [...match.players];
    const playerIndex = match.current_player_index;
    const mode = match.atc_settings.mode;
    
    let currentTarget = currentPlayer.current_target;
    let hitOccurred = false;
    let wonGame = false;
    
    // Process each pending dart
    for (const dart of pendingDarts) {
      const { segment, number } = dart;
      
      updatedPlayers[playerIndex].total_darts_thrown = (updatedPlayers[playerIndex].total_darts_thrown || 0) + 1;
      
      let hit = false;
      if (currentTarget === 'bull') {
        if (mode === 'singles' && segment === 'SB') hit = true;
        else if (mode === 'doubles' && segment === 'DB') hit = true;
        else if (mode === 'increase' && (segment === 'SB' || segment === 'DB')) hit = true;
      } else {
        if (mode === 'singles' && segment === 'S' && number === currentTarget) hit = true;
        else if (mode === 'doubles' && segment === 'D' && number === currentTarget) hit = true;
        else if (mode === 'trebles' && segment === 'T' && number === currentTarget) hit = true;
        else if (mode === 'increase' && number === currentTarget) hit = true;
      }
      
      if (hit) {
        hitOccurred = true;
        updatedPlayers[playerIndex].completed_targets.push(currentTarget);
        
        let nextTarget: number | 'bull' | null;
        
        if (mode === 'increase' && match.atc_settings.order === 'sequential') {
          nextTarget = calculateNextTarget(currentTarget, segment, allTargets);
        } else {
          const currentIndex = allTargets.indexOf(currentTarget);
          nextTarget = currentIndex < allTargets.length - 1 ? allTargets[currentIndex + 1] : null;
        }
        
        if (nextTarget === null) {
          updatedPlayers[playerIndex].is_winner = true;
          wonGame = true;
          break; // Game won, stop processing darts
        } else {
          currentTarget = nextTarget;
          updatedPlayers[playerIndex].current_target = nextTarget;
        }
      }
    }
    
    // Build the completed visit
    const completedVisit: Visit = {
      dart1: pendingDarts[0] || undefined,
      dart2: pendingDarts[1] || undefined,
      dart3: pendingDarts[2] || undefined,
      completed_target: hitOccurred ? currentPlayer.current_target : undefined,
      timestamp: new Date().toISOString()
    };
    
    if (!updatedPlayers[playerIndex].visit_history) {
      updatedPlayers[playerIndex].visit_history = [];
    }
    updatedPlayers[playerIndex].visit_history!.push(completedVisit);
    
    if (wonGame) {
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
    } else {
      await endTurn(updatedPlayers);
    }
    
    // Clear pending darts
    setPendingDarts([]);
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
    setPendingDarts([]);
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
  const dbTarget = currentPlayer?.current_target;
  const mode = match.atc_settings.mode;
  const isIncreaseMode = mode === 'increase' && match.atc_settings.order === 'sequential';
  const opponent = match.players.find(p => p.id !== currentUser);
  
  // Use previewTarget for buttons (updates after each dart), dbTarget for initial display
  const target = pendingDarts.length > 0 ? previewTarget : dbTarget;
  
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
            {match?.atc_settings && (
              <div className="flex items-center justify-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300 px-1.5 py-0">
                  {match.atc_settings.order === 'random' ? 'Random' : 'In Order'}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300 px-1.5 py-0">
                  {match.atc_settings.mode === 'singles' && 'Singles'}
                  {match.atc_settings.mode === 'doubles' && 'Doubles'}
                  {match.atc_settings.mode === 'trebles' && 'Trebles'}
                  {match.atc_settings.mode === 'increase' && 'Increase'}
                </Badge>
              </div>
            )}
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
              {/* SINGLE CAMERA - Shows only the current player's camera */}
              <div className="w-full h-full">
                {isMyTurn() ? (
                  /* MY TURN: Show MY local camera */
                  <div className="relative w-full h-full bg-slate-800">
                    <div className="absolute top-4 left-4 z-10 bg-emerald-500/80 px-3 py-1 rounded text-sm font-bold text-white">
                      YOUR TURN 🎯
                    </div>
                    {/* Your Camera Status */}
                    <div className="absolute top-4 right-4 z-10">
                      {isCameraOn ? (
                        <span className="bg-emerald-500/80 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Live
                        </span>
                      ) : (
                        <span className="bg-red-500/80 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <CameraOff className="w-3 h-3" /> Camera Off
                        </span>
                      )}
                    </div>
                    {localStream ? (
                      <video 
                        ref={setLocalVideoRef}
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-6">
                        <CameraOff className="w-16 h-16 mb-4 opacity-50" />
                        <span className="text-lg font-medium mb-2">Your camera is off</span>
                        <span className="text-sm text-slate-500 mb-4 text-center">
                          It's your turn! Enable your camera so other players can see you.
                        </span>
                        <Button 
                          onClick={toggleCamera}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                          <Camera className="w-4 h-4 mr-2" />
                          Enable Camera
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* OTHER PLAYER'S TURN: Show only their remote camera */
                  <div className="relative w-full h-full bg-slate-800">
                    <div className="absolute top-4 left-4 z-10 bg-blue-500/80 px-3 py-1 rounded text-sm font-bold text-white">
                      {currentTurnPlayer?.username}'s TURN
                    </div>
                    {/* Connection Status Badge */}
                    <div className="absolute top-4 right-4 z-10">
                      {callStatus === 'connected' ? (
                        <span className="bg-emerald-500/80 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <Wifi className="w-3 h-3" /> Connected
                        </span>
                      ) : callStatus === 'connecting' ? (
                        <span className="bg-amber-500/80 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                        </span>
                      ) : callStatus === 'failed' ? (
                        <span className="bg-red-500/80 px-2 py-1 rounded text-xs text-white flex items-center gap-1">
                          <WifiOff className="w-3 h-3" /> Failed
                        </span>
                      ) : null}
                    </div>
                    {activeStream ? (
                      <video 
                        key={`remote-${activePlayerId}`} // Force remount when player changes
                        ref={setRemoteVideoRef}
                        autoPlay 
                        playsInline 
                        muted={isCurrentUserTurn}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-6">
                        <UserPlus className="w-16 h-16 mb-4 opacity-50" />
                        <span className="text-lg font-medium mb-2">
                          {isCurrentUserTurn 
                            ? 'Starting your camera...'
                            : `Waiting for ${currentTurnPlayer?.username}...`
                          }
                        </span>
                        <span className="text-sm text-slate-500 text-center mb-4">
                          {isCurrentUserTurn
                            ? 'Please allow camera access when prompted'
                            : callStatus === 'connecting' 
                              ? 'Connecting to their camera...'
                              : "It's their turn. Their camera will appear when they enable it."
                          }
                        </span>
                        <div className="flex items-center gap-2">
                          {match?.players?.map((p, i) => (
                            <div 
                              key={p.id}
                              className={`w-3 h-3 rounded-full ${
                                p.id === currentTurnPlayer?.id 
                                  ? 'bg-emerald-400 animate-pulse' 
                                  : 'bg-slate-700'
                              }`}
                              title={p.username}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Camera Controls Overlay */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="sm"
                        variant="secondary"
                        className="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                        onClick={handleRefreshConnection}
                        disabled={isRefreshingConnection}
                      >
                        {isRefreshingConnection ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wifi className="w-4 h-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Reconnect camera</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
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
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Refresh camera</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                <Button 
                  size="sm"
                  variant={isCameraOn ? "default" : "secondary"}
                  className={isCameraOn ? "bg-emerald-500 hover:bg-emerald-600" : "bg-black/50 hover:bg-black/70"}
                  onClick={toggleCamera}
                >
                  {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
        
        {/* RIGHT: Player Tiles + Scoring */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Player Tiles - NEW ENGAGING DESIGN - Dynamic grid based on player count */}
          <div className={`grid gap-3 ${
            match.players.length <= 2 ? 'grid-cols-2' : 
            match.players.length === 3 ? 'grid-cols-3' : 
            'grid-cols-2'
          }`}>
            {match.players.map((player, idx) => (
              <PlayerTile
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === currentPlayer?.id}
                isCurrentUser={player.id === currentUser}
                progress={getPlayerProgress(player)}
                compact={match.players.length > 2}
              />
            ))}
          </div>
          
          {/* Current Visit Display - Shows darts as entered with preview target */}
          {isMyTurn() && (
            <CurrentVisitDisplay 
              visit={currentVisit} 
              dartCount={dartCount} 
              previewTarget={previewTarget}
              startTarget={currentPlayer?.current_target || 1}
            />
          )}
          
          {/* Scoring Panel - Compact Layout */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 p-3 overflow-hidden">
            {isMyTurn() ? (
              <div className="h-full flex flex-col">
                {/* Dart Input Buttons - Compact */}
                <div className={`flex-1 min-h-0 ${pendingDarts.length >= 3 ? 'opacity-50 pointer-events-none' : ''}`}>
                  {target === 'bull' ? (
                    /* Bull Mode - Compact */
                    <div className="h-full flex flex-col gap-2">
                      <div className="flex-1 flex gap-2">
                        {(mode === 'singles' || mode === 'increase') && (
                          <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                            <Button
                              onClick={() => handleDartThrow('SB')}
                              className="h-full w-full text-base font-bold bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                            >
                              Single Bull
                            </Button>
                          </motion.div>
                        )}
                        {(mode === 'doubles' || mode === 'increase') && (
                          <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                            <Button
                              onClick={() => handleDartThrow('DB')}
                              className="h-full w-full text-base font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25"
                            >
                              Double Bull
                            </Button>
                          </motion.div>
                        )}
                      </div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                        <Button
                          onClick={() => handleDartThrow('MISS')}
                          className="h-10 w-full text-base font-bold bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          Miss
                        </Button>
                      </motion.div>
                    </div>
                  ) : isIncreaseMode ? (
                    /* Increase Mode - 2x2 Grid Compact */
                    <div className="h-full grid grid-cols-2 gap-2">
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap">
                        <Button
                          onClick={() => handleDartThrow('S', target as number)}
                          className="h-full w-full text-xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25"
                        >
                          S{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.05 }}>
                        <Button
                          onClick={() => handleDartThrow('D', target as number)}
                          className="h-full w-full text-xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                        >
                          D{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
                        <Button
                          onClick={() => handleDartThrow('T', target as number)}
                          className="h-full w-full text-xl font-black bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-lg shadow-amber-500/25"
                        >
                          T{target}
                        </Button>
                      </motion.div>
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.15 }}>
                        <Button
                          onClick={() => handleDartThrow('MISS')}
                          className="h-full w-full text-lg font-bold bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          Miss
                        </Button>
                      </motion.div>
                    </div>
                  ) : (
                    /* Singles/Doubles/Trebles - Compact */
                    <div className="h-full flex flex-col gap-2">
                      <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
                        <Button
                          onClick={() => handleDartThrow(
                            mode === 'singles' ? 'S' : mode === 'doubles' ? 'D' : 'T', 
                            target as number
                          )}
                          className={`h-full w-full text-3xl font-black shadow-lg ${
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
                          className="h-10 w-full text-base font-bold bg-slate-700 hover:bg-slate-600 text-white"
                        >
                          Miss
                        </Button>
                      </motion.div>
                    </div>
                  )}
                </div>
                
                {/* Submit and Undo Buttons - Always visible underneath */}
                <div className="mt-2 grid grid-cols-2 gap-2 flex-none">
                  <Button
                    onClick={handleUndoLastDart}
                    variant="outline"
                    disabled={pendingDarts.length === 0}
                    className="h-10 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    Undo
                  </Button>
                  <Button
                    onClick={handleSubmitVisit}
                    disabled={pendingDarts.length === 0}
                    className="h-10 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {pendingDarts.length === 3 ? 'Submit' : `Submit (${pendingDarts.length})`}
                  </Button>
                </div>
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
      
      {/* Game End Popup - Premium Design */}
      <Dialog open={showGameEndPopup} onOpenChange={setShowGameEndPopup}>
        <DialogContent className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700 max-w-lg p-0 overflow-hidden">
          {/* Header with animated gradient */}
          <div className="relative bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-emerald-500/20 p-6 border-b border-slate-700/50">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-emerald-500/10 animate-pulse" />
            <DialogHeader className="relative z-10">
              <DialogTitle className="text-3xl font-black text-center flex flex-col items-center gap-3">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/30"
                >
                  <Trophy className="w-10 h-10 text-white" />
                </motion.div>
                <span className="bg-gradient-to-r from-amber-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                  Game Over!
                </span>
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Winner Section */}
            {match.players.find(p => p.is_winner) && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center"
              >
                <p className="text-slate-400 mb-2 uppercase tracking-wider text-sm font-medium">Champion</p>
                <div className="inline-flex items-center gap-3 bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-2xl px-6 py-3">
                  <Crown className="w-6 h-6 text-amber-400" />
                  <p className="text-3xl font-black text-white">
                    {match.players.find(p => p.is_winner)?.username}
                  </p>
                </div>
              </motion.div>
            )}
            
            {/* Player Stats Cards */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Final Standings</h4>
              {match.players
                .sort((a, b) => (b.completed_targets?.length || 0) - (a.completed_targets?.length || 0))
                .map((player, index) => {
                  const accuracy = player.total_darts_thrown > 0 
                    ? Math.round(((player.completed_targets?.length || 0) / player.total_darts_thrown) * 100)
                    : 0;
                  const position = index + 1;
                  
                  return (
                    <motion.div 
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.1 }}
                      className={`relative overflow-hidden rounded-xl p-4 ${
                        player.is_winner 
                          ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-600/10 to-transparent border border-emerald-500/40' 
                          : 'bg-slate-800/50 border border-slate-700/50'
                      }`}
                    >
                      {/* Position Badge */}
                      <div className={`absolute -right-2 -top-2 w-10 h-10 rounded-full flex items-center justify-center text-lg font-black ${
                        position === 1 ? 'bg-amber-500 text-white' :
                        position === 2 ? 'bg-slate-400 text-slate-900' :
                        position === 3 ? 'bg-amber-700 text-white' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        #{position}
                      </div>
                      
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                          player.is_winner 
                            ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30' 
                            : 'bg-gradient-to-br from-slate-600 to-slate-700 text-slate-300'
                        }`}>
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-lg">{player.username}</span>
                            {player.is_winner && (
                              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                <Trophy className="w-3 h-3 mr-1" />
                                Winner
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Stats Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        <div className={`text-center p-2 rounded-lg ${player.is_winner ? 'bg-emerald-500/10' : 'bg-slate-900/50'}`}>
                          <p className="text-xs text-slate-400 mb-1">Targets</p>
                          <p className={`text-xl font-black ${player.is_winner ? 'text-emerald-400' : 'text-white'}`}>
                            {player.completed_targets?.length || 0}
                          </p>
                        </div>
                        <div className={`text-center p-2 rounded-lg ${player.is_winner ? 'bg-blue-500/10' : 'bg-slate-900/50'}`}>
                          <p className="text-xs text-slate-400 mb-1">Darts</p>
                          <p className={`text-xl font-black ${player.is_winner ? 'text-blue-400' : 'text-white'}`}>
                            {player.total_darts_thrown || 0}
                          </p>
                        </div>
                        <div className={`text-center p-2 rounded-lg ${player.is_winner ? 'bg-purple-500/10' : 'bg-slate-900/50'}`}>
                          <p className="text-xs text-slate-400 mb-1">Accuracy</p>
                          <p className={`text-xl font-black ${player.is_winner ? 'text-purple-400' : 'text-white'}`}>
                            {accuracy}%
                          </p>
                        </div>
                        <div className={`text-center p-2 rounded-lg ${player.is_winner ? 'bg-amber-500/10' : 'bg-slate-900/50'}`}>
                          <p className="text-xs text-slate-400 mb-1">Progress</p>
                          <p className={`text-xl font-black ${player.is_winner ? 'text-amber-400' : 'text-white'}`}>
                            {Math.round(((player.completed_targets?.length || 0) / 21) * 100)}%
                          </p>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="mt-3">
                        <div className="h-2 bg-slate-900/50 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${
                              player.is_winner 
                                ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' 
                                : 'bg-gradient-to-r from-slate-600 to-slate-500'
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${((player.completed_targets?.length || 0) / 21) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.5 + index * 0.1 }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
            
            {/* Action Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                onClick={handleEndGame}
                className="w-full py-6 text-lg font-bold bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 hover:from-purple-600 hover:via-pink-600 hover:to-amber-600 shadow-lg shadow-purple-500/25"
              >
                <Trophy className="w-5 h-5 mr-2" />
                Back to Lobby
              </Button>
            </motion.div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}