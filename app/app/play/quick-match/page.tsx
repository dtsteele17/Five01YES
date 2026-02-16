'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
// import { motion, Variants } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Target,
  Users,
  ArrowLeft,
  Play,
  Trophy,
  Loader2,
  Clock,
  X,
  UserPlus,
  Camera,
  CameraOff,
  Zap,
  Flame,
  BarChart3,
  Crown,
  Gamepad2,
  Activity,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { requireUser } from '@/lib/supabase/auth';
import { toast } from 'sonner';
import { validateMatchRoom, hasAttemptedResume, markResumeAttempted } from '@/lib/utils/match-resume';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { SafetyRatingBadge, SafetyRatingMini } from '@/components/safety/SafetyRatingBadge';

interface QuickMatchLobby {
  id: string;
  created_by: string;
  status: string;
  game_type: string;
  match_format: string;
  starting_score: number;
  double_out: boolean;
  double_in: boolean;
  player1_id: string;
  player2_id: string | null;
  match_id: string | null;
  created_at: string;
  player1_3dart_avg?: number;
  player1?: {
    username: string;
    avatar_url?: string;
    trust_rating_letter?: string;
    trust_rating_count?: number;
    safety_rating_letter?: string;
    safety_rating_count?: number;
    overall_3dart_avg?: number;
  };
  atc_settings?: {
    order: 'sequential' | 'random';
    mode: 'singles' | 'doubles' | 'trebles' | 'increase';
    player_count: number;
  };
  players?: ATCPlayer[];
}

interface JoinRequest {
  id: string;
  lobby_id: string;
  requester_id: string;
  requester_username: string;
  requester_avatar_url?: string;
  requester_3dart_avg?: number;
  requester_safety_rating_letter?: string;
  requester_safety_rating_count?: number;
  requester_has_camera?: boolean;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

interface ATCPlayer {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
  current_target?: number | 'bull';
  completed_targets?: (number | 'bull')[];
  is_winner?: boolean;
}

// Joined Player View for ATC Lobbies
function JoinedATCLobbyView({ lobby, userId, onLeave, onOpenModal }: { lobby: QuickMatchLobby; userId: string | null; onLeave: () => void; onOpenModal?: () => void }) {
  const supabase = createClient();
  const [players, setPlayers] = useState<ATCPlayer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [atcSettings, setAtcSettings] = useState<any>(null);
  const router = useRouter();
  
  useEffect(() => {
    console.log('[JoinedATCLobbyView] Mounted, onOpenModal available:', !!onOpenModal);
    
    // Auto-open modal when component mounts
    if (onOpenModal) {
      const timer = setTimeout(() => {
        console.log('[JoinedATCLobbyView] Auto-opening modal');
        onOpenModal();
      }, 500); // Small delay to ensure render is complete
      
      return () => clearTimeout(timer);
    }
  }, [onOpenModal]);
  
  useEffect(() => {
    // Get initial players from lobby
    const lobbyPlayers = (lobby as any).players || [];
    setPlayers(lobbyPlayers);
    
    const settings = (lobby as any).atc_settings;
    setAtcSettings(settings);
    
    // Check if current user is ready
    const currentPlayer = lobbyPlayers.find((p: ATCPlayer) => p.id === userId);
    setIsReady(currentPlayer?.is_ready || false);
    
    // Subscribe to lobby changes
    const channel = supabase
      .channel(`lobby_${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_match_lobbies',
          filter: `id=eq.${lobby.id}`,
        },
        (payload) => {
          const updatedLobby = payload.new as any;
          setPlayers(updatedLobby.players || []);
          
          const currentPlayer = updatedLobby.players?.find((p: ATCPlayer) => p.id === userId);
          setIsReady(currentPlayer?.is_ready || false);
          
          // If match_id is set, redirect to match
          if (updatedLobby.match_id && updatedLobby.status === 'in_progress') {
            router.push(`/app/play/quick-match/atc-match?matchId=${updatedLobby.match_id}`);
          }
        }
      )
      .subscribe();
      
    return () => {
      channel.unsubscribe();
    };
  }, [lobby.id, userId]);
  
  const toggleReady = async () => {
    if (!userId) return;
    
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    
    const updatedPlayers = players.map(p => 
      p.id === userId ? { ...p, is_ready: newReadyState } : p
    );
    
    await supabase
      .from('quick_match_lobbies')
      .update({ players: updatedPlayers })
      .eq('id', lobby.id);
  };
  
  const playerSlots = atcSettings?.player_count || 2;
  const emptySlots = playerSlots - players.length;
  
  return (
    <div className="space-y-4">
      {/* Match Settings */}
      <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-purple-400" />
          <p className="text-sm text-purple-400 font-medium">Around The Clock</p>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p>Order: <span className="text-white">{atcSettings?.order === 'sequential' ? '1-20 + Bull' : 'Random'}</span></p>
          <p>Mode: <span className="text-white capitalize">{atcSettings?.mode?.replace('_', ' ') || 'Singles'}</span></p>
          <p>Players: <span className="text-white">{players.length} / {playerSlots}</span></p>
        </div>
      </div>
      
      {/* Player List */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider">Players</p>
        {players.map((player) => (
          <div 
            key={player.id}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {player.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-white text-sm">{player.username}</span>
              {player.id === lobby.created_by && (
                <Badge className="bg-amber-500/20 text-amber-400 text-xs">Host</Badge>
              )}
            </div>
            {player.is_ready ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            ) : (
              <Badge className="bg-slate-700 text-slate-400 text-xs">Not Ready</Badge>
            )}
          </div>
        ))}
        
        {/* Empty slots */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div 
            key={`empty-${i}`}
            className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700"
          >
            <span className="text-slate-500 text-sm">Waiting for player...</span>
            <Badge className="bg-slate-700 text-slate-500 text-xs">Empty</Badge>
          </div>
        ))}
      </div>
      
      {/* Open Lobby Button */}
      {onOpenModal && (
        <Button
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 text-lg font-bold"
          onClick={onOpenModal}
        >
          <Users className="w-5 h-5 mr-2" />
          Open Lobby
        </Button>
      )}
      
      {/* Ready Button */}
      <Button
        className={`w-full py-4 text-base font-bold ${
          isReady 
            ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
        }`}
        onClick={toggleReady}
      >
        {isReady ? (
          <>
            <X className="w-4 h-4 mr-2" />
            Cancel Ready
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Ready Up!
          </>
        )}
      </Button>
      
      <Button
        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
        onClick={onLeave}
        variant="outline"
      >
        <X className="w-4 h-4 mr-2" />
        Leave Lobby
      </Button>
    </div>
  );
}

// ATC Lobby Modal - Popup for both host and joined players
function ATCLobbyModal({ 
  lobby, 
  userId, 
  isHost, 
  onClose, 
  onStartMatch, 
  onLeave 
}: { 
  lobby: QuickMatchLobby; 
  userId: string | null; 
  isHost: boolean; 
  onClose: () => void;
  onStartMatch: () => void;
  onLeave: () => void;
}) {
  const [players, setPlayers] = useState<ATCPlayer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [atcSettings, setAtcSettings] = useState<any>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [lobbyFullAt, setLobbyFullAt] = useState<number | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  
  useEffect(() => {
    console.log('[ATCLobbyModal] Mounted with lobby:', lobby.id, 'isHost:', isHost);
    
    // Get initial data
    const lobbyPlayers = (lobby as any).players || [];
    setPlayers(lobbyPlayers);
    setAtcSettings((lobby as any).atc_settings);
    
    const currentPlayer = lobbyPlayers.find((p: ATCPlayer) => p.id === userId);
    setIsReady(currentPlayer?.is_ready || false);
    
    // Fetch pending join requests if host
    if (isHost) {
      fetchJoinRequests();
    }
    
    // Subscribe to lobby changes
    const channel = supabase
      .channel(`atc-lobby-modal-${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_match_lobbies',
          filter: `id=eq.${lobby.id}`,
        },
        (payload) => {
          const updatedLobby = payload.new as any;
          setPlayers(updatedLobby.players || []);
          
          const currentPlayer = updatedLobby.players?.find((p: ATCPlayer) => p.id === userId);
          setIsReady(currentPlayer?.is_ready || false);
          
          // If match_id is set, close modal and redirect
          if (updatedLobby.match_id && updatedLobby.status === 'in_progress') {
            router.push(`/app/play/quick-match/atc-match?matchId=${updatedLobby.match_id}`);
          }
        }
      )
      .subscribe();
    
    // Subscribe to join requests if host
    let joinRequestChannel: any;
    if (isHost) {
      joinRequestChannel = supabase
        .channel(`join-requests-${lobby.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'quick_match_join_requests',
            filter: `lobby_id=eq.${lobby.id}`,
          },
          () => {
            fetchJoinRequests();
          }
        )
        .subscribe();
    }
      
    return () => {
      channel.unsubscribe();
      if (joinRequestChannel) joinRequestChannel.unsubscribe();
    };
  }, [lobby.id, userId, router, isHost]);

  // Timer effect for ready-up phase
  useEffect(() => {
    const playerSlots = atcSettings?.player_count || 2;
    const isFull = players.length >= playerSlots;
    const minPlayers = 2; // Minimum to start a match
    const readyCount = players.filter(p => p.is_ready).length;
    const allReady = players.length > 0 && players.every(p => p.is_ready);

    // Check if we should start the match
    // Case 1: All players are ready (regardless of max)
    if (allReady && players.length >= minPlayers && !timerActive) {
      console.log('[ATC] All players ready, starting match...');
      createMatchAndStart();
      return;
    }

    // Case 2: Lobby is full AND timer hasn't started yet
    if (isFull && !lobbyFullAt && !timerActive && players.length >= minPlayers) {
      console.log('[ATC] Lobby full, starting 60s timer...');
      setLobbyFullAt(Date.now());
      setTimeRemaining(60);
      setTimerActive(true);
      toast.info('Lobby full! 60 seconds to ready up');
    }

    // Countdown timer
    let interval: NodeJS.Timeout;
    if (lobbyFullAt && timerActive && timeRemaining !== null && timeRemaining > 0) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - lobbyFullAt) / 1000);
        const remaining = Math.max(0, 60 - elapsed);
        setTimeRemaining(remaining);

        if (remaining === 0) {
          // Time's up - handle timer expiration
          clearInterval(interval);
          handleTimerExpired();
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [players, atcSettings, lobbyFullAt, timeRemaining, timerActive]);
  
  const fetchJoinRequests = async () => {
    const { data } = await supabase
      .from('quick_match_join_requests')
      .select('*')
      .eq('lobby_id', lobby.id)
      .eq('status', 'pending');
    
    if (data) setJoinRequests(data);
  };

  const createMatchAndStart = async () => {
    try {
      const settings = atcSettings;
      
      const shuffleArray = (array: any[]) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
      };

      const targets = settings.order === 'random'
        ? shuffleArray([...[...Array(20)].map((_, i) => i + 1), 'bull'])
        : [...[...Array(20)].map((_, i) => i + 1), 'bull'];

      const { data: atcMatch, error: atcError } = await supabase
        .from('atc_matches')
        .insert({
          lobby_id: lobby.id,
          status: 'in_progress',
          game_mode: 'atc',
          atc_settings: settings,
          players: players.map((p: ATCPlayer) => ({
            ...p,
            current_target: targets[0]
          })),
          current_player_index: 0,
          created_by: lobby.created_by,
          targets: targets
        })
        .select()
        .maybeSingle();

      if (atcError || !atcMatch) {
        throw new Error('Failed to create ATC match');
      }

      // Update lobby
      await supabase
        .from('quick_match_lobbies')
        .update({
          status: 'in_progress',
          match_id: atcMatch.id
        })
        .eq('id', lobby.id);

      toast.success('Match starting!');
      router.push(`/app/play/quick-match/atc-match?matchId=${atcMatch.id}`);
    } catch (error: any) {
      console.error('[ATC START] Failed:', error);
      toast.error(`Failed to start match: ${error.message}`);
    }
  };

  const handleTimerExpired = async () => {
    const readyPlayers = players.filter(p => p.is_ready);
    
    if (readyPlayers.length >= 2) {
      // Start with ready players only
      toast.info('Timer expired - starting match with ready players...');
      
      // Update lobby to only include ready players
      await supabase
        .from('quick_match_lobbies')
        .update({ 
          players: readyPlayers,
          status: 'starting'
        })
        .eq('id', lobby.id);
      
      // Small delay to ensure state is updated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await createMatchAndStart();
    } else {
      // Not enough ready players - reset lobby
      toast.info('Not enough ready players. Resetting lobby...');
      
      // Keep only ready players (which could be 0 or 1)
      const updatedPlayers = players.filter(p => p.is_ready);
      
      // Reset all players' ready status for a fresh start
      const resetPlayers = updatedPlayers.map(p => ({ ...p, is_ready: false }));
      
      await supabase
        .from('quick_match_lobbies')
        .update({ 
          players: resetPlayers,
          status: 'waiting'
        })
        .eq('id', lobby.id);
      
      setLobbyFullAt(null);
      setTimeRemaining(null);
      setTimerActive(false);
    }
  };

  const handleAcceptRequest = async (request: JoinRequest) => {
    if (processingRequest) return;
    setProcessingRequest(true);

    try {
      // Get current lobby state
      const { data: currentLobby } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobby.id)
        .maybeSingle();

      if (!currentLobby) {
        throw new Error('Lobby not found');
      }

      const currentPlayers = (currentLobby as any).players || [];
      const settings = (currentLobby as any).atc_settings;
      
      // Check if lobby is full
      if (currentPlayers.length >= settings.player_count) {
        toast.error('Lobby is full');
        setProcessingRequest(false);
        return;
      }

      // Add player to lobby
      const newPlayer: ATCPlayer = {
        id: request.requester_id,
        username: request.requester_username,
        is_ready: false,
        current_target: settings.order === 'random' ? undefined : 1,
        completed_targets: [],
      };

      const updatedPlayers = [...currentPlayers, newPlayer];

      // Just add player to lobby - don't create match yet
      await supabase
        .from('quick_match_lobbies')
        .update({
          players: updatedPlayers,
          status: updatedPlayers.length >= settings.player_count ? 'full' : 'waiting'
        })
        .eq('id', lobby.id);

      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'accepted' })
        .eq('id', request.id);

      // Update local state
      setPlayers(updatedPlayers);
      setJoinRequests(prev => prev.filter(r => r.id !== request.id));
      toast.success(`${request.requester_username} joined the lobby`);
      
    } catch (error: any) {
      console.error('[ATC ACCEPT] Failed:', error);
      toast.error(`Failed to accept: ${error.message}`);
    } finally {
      setProcessingRequest(false);
    }
  };

  const handleDeclineRequest = async (request: JoinRequest) => {
    if (processingRequest) return;
    setProcessingRequest(true);

    try {
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);

      // Remove from local state
      setJoinRequests(prev => prev.filter(r => r.id !== request.id));
      toast.info('Join request declined');
    } catch (error: any) {
      console.error('[ATC DECLINE] Failed:', error);
      toast.error(`Failed to decline: ${error.message}`);
    } finally {
      setProcessingRequest(false);
    }
  };
  
  const toggleReady = async () => {
    if (!userId) return;
    
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    
    const updatedPlayers = players.map(p => 
      p.id === userId ? { ...p, is_ready: newReadyState } : p
    );
    
    await supabase
      .from('quick_match_lobbies')
      .update({ players: updatedPlayers })
      .eq('id', lobby.id);
  };
  
  const playerSlots = atcSettings?.player_count || 2;
  const availableSlots = playerSlots - players.length;
  const allPlayersReady = players.length > 0 && players.every(p => p.is_ready);
  const isLobbyFull = players.length >= playerSlots;
  const showTimer = isLobbyFull && timeRemaining !== null && timeRemaining > 0;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                Around The Clock
              </h2>
              <p className="text-white/70 text-sm">
                {isHost ? 'You are the Host' : 'Waiting for host to start...'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Match Settings */}
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-purple-400" />
              <p className="text-sm text-purple-400 font-medium">Match Settings</p>
            </div>
            <div className="text-xs text-slate-400 space-y-2">
              <div className="flex justify-between">
                <span>Target Order:</span>
                <span className="text-white">{atcSettings?.order === 'random' ? 'Random' : '1-20 + Bull'}</span>
              </div>
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="text-white capitalize">
                  {atcSettings?.mode === 'singles' ? 'Singles Only' :
                   atcSettings?.mode === 'doubles' ? 'Doubles Only' :
                   atcSettings?.mode === 'trebles' ? 'Trebles Only' : 'Increase by Segment'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Players:</span>
                <span className="text-white">{players.length} / {playerSlots}</span>
              </div>
            </div>
          </div>
          
          {/* Player List */}
          <div className="space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Players</p>
            <div className="space-y-2">
              {/* Current Players */}
              {players.map((player) => (
                <div 
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                      {player.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-white text-sm">{player.username}</span>
                    {player.id === lobby.created_by && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-xs">Host</Badge>
                    )}
                  </div>
                  {player.is_ready ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700 text-slate-400 text-xs">Not Ready</Badge>
                  )}
                </div>
              ))}
              
              {/* Empty slots */}
              {Array.from({ length: availableSlots }).map((_, i) => (
                <div 
                  key={`empty-${i}`}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700"
                >
                  <span className="text-slate-500 text-sm">Waiting for player...</span>
                  <Badge className="bg-slate-700 text-slate-500 text-xs">Empty</Badge>
                </div>
              ))}
            </div>
          </div>
          
          {/* Join Requests - Host Only */}
          {isHost && joinRequests.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-amber-500 uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Join Requests ({joinRequests.length})
              </p>
              <div className="space-y-2">
                {joinRequests.map((request) => (
                  <div 
                    key={request.id}
                    className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                        {request.requester_username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-medium">{request.requester_username}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          {request.requester_3dart_avg && (
                            <span className="flex items-center gap-1">
                              <BarChart3 className="w-3 h-3" />
                              {request.requester_3dart_avg.toFixed(1)} avg
                            </span>
                          )}
                          {request.requester_has_camera && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Camera className="w-3 h-3" />
                              Camera
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={() => handleAcceptRequest(request)}
                        disabled={processingRequest || players.length >= (atcSettings?.player_count || 2)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/20"
                        onClick={() => handleDeclineRequest(request)}
                        disabled={processingRequest}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ready Count & Timer */}
          <div className="text-center space-y-2">
            {/* Countdown Timer - Show when lobby is full */}
            {showTimer && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-amber-400 font-bold text-lg">
                  {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                </p>
                <p className="text-amber-400/80 text-xs">
                  {allPlayersReady 
                    ? 'All players ready! Starting...' 
                    : 'Time remaining to ready up'}
                </p>
              </div>
            )}
            
            {/* Lobby Full Message */}
            {isLobbyFull && !showTimer && (
              <p className="text-emerald-400 text-sm font-medium">
                All players ready! Starting match...
              </p>
            )}
            
            {/* Ready Status */}
            {!isLobbyFull && (
              <span className="text-slate-400 text-sm">
                {players.filter(p => p.is_ready).length} / {players.length} players ready
              </span>
            )}
            
            {players.length < 2 && (
              <p className="text-xs text-amber-400 mt-1">Need at least 2 players to start</p>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-3">
            {/* Ready Button - For EVERYONE including host */}
            <Button
              className={`w-full py-3 text-base font-bold ${
                isReady 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              onClick={toggleReady}
              disabled={showTimer && allPlayersReady} // Disable once auto-starting
            >
              {isReady ? (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Cancel Ready
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Ready Up!
                </>
              )}
            </Button>
            
            {/* Status Message - Shows when waiting */}
            {isLobbyFull && !allPlayersReady && (
              <div className="text-center py-2">
                <p className="text-amber-400 text-sm">
                  Waiting for all players to ready up...
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  ({players.filter(p => p.is_ready).length}/{players.length} ready)
                </p>
              </div>
            )}
            
            {/* Auto-start Indicator */}
            {allPlayersReady && players.length >= 2 && (
              <div className="text-center py-2">
                <p className="text-emerald-400 text-sm font-medium flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting match...
                </p>
              </div>
            )}
            
            <Button
              className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
              onClick={onLeave}
              variant="outline"
              disabled={allPlayersReady && players.length >= 2} // Prevent leaving once starting
            >
              <X className="w-4 h-4 mr-2" />
              {isHost ? 'Cancel Lobby' : 'Leave Lobby'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Animation variants
// const containerVariants: Variants = {
//   hidden: { opacity: 0 },
//   visible: {
//     opacity: 1,
//     transition: {
//       staggerChildren: 0.1,
//       delayChildren: 0.2,
//     },
//   },
// };

// const itemVariants: Variants = {
//   hidden: { opacity: 0, y: 20 },
//   visible: {
//     opacity: 1,
//     y: 0,
//     transition: {
//       type: 'spring' as const,
//       stiffness: 100,
//       damping: 15,
//     },
//   },
// };

// F1/FIFA Style Stat Card
function HeroStat({ value, label, icon: Icon, color }: { 
  value: string | number; 
  label: string; 
  icon: any; 
  color: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 group hover:border-slate-600/50 transition-all`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-black text-white tracking-tight">{value}</p>
          <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-medium">{label}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function QuickMatchLobbyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  
  // Around The Clock settings
  const [atcOrder, setAtcOrder] = useState<'sequential' | 'random'>('sequential');
  const [atcMode, setAtcMode] = useState<'singles' | 'doubles' | 'trebles' | 'increase'>('singles');
  const [atcPlayerCount, setAtcPlayerCount] = useState(2);
  
  const [filterMode, setFilterMode] = useState('all');
  const [filterFormat, setFilterFormat] = useState('all');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [lobbies, setLobbies] = useState<QuickMatchLobby[]>([]);
  const [myLobby, setMyLobby] = useState<QuickMatchLobby | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const [realtimeStatus, setRealtimeStatus] = useState<string>('disconnected');
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<{ type: string; lobbyId: string } | null>(null);
  
  // Track if we're currently cancelling to prevent race conditions with polling
  const [isCancelling, setIsCancelling] = useState(false);

  // Join request state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [currentJoinRequest, setCurrentJoinRequest] = useState<JoinRequest | null>(null);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [pendingLobbyId, setPendingLobbyId] = useState<string | null>(null);
  
  // ATC Lobby Modal state
  const [showATCLobbyModal, setShowATCLobbyModal] = useState(false);
  
  // User stats for displaying in own lobby
  const [userStats, setUserStats] = useState<{ overall_3dart_avg?: number } | null>(null);
  
  // Stats for dashboard
  const [inProgressMatches, setInProgressMatches] = useState<number>(0);
  const [last5Record, setLast5Record] = useState<string>('-----');

  const resumeAttemptedRef = useRef(false);
  const joinRequestSubscriptionRef = useRef<any>(null);

  useEffect(() => {
    initializeAndSubscribe();
    
    // Setup periodic refresh every 5 seconds to catch any missed updates
    const refreshInterval = setInterval(() => {
      fetchLobbies();
    }, 5000);
    
    // Refresh when page becomes visible again (but not if cancelling)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isCancelling) {
        console.log('[PAGE] Became visible, refreshing lobbies');
        fetchLobbies();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup function when user leaves the page
    const handleBeforeUnload = () => {
      if (myLobby) {
        // Delete the lobby when user closes browser/leaves page
        supabase.rpc('rpc_delete_user_lobbies');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Cleanup: Delete user's lobby when component unmounts (if they have one)
      if (myLobby) {
        supabase.rpc('rpc_delete_user_lobbies');
      }
    };
  }, [myLobby]);

  // Fetch pending join requests for the current lobby
  const fetchPendingRequestsForLobby = useCallback(async (lobbyId: string) => {
    console.log('[JOIN REQUEST] Fetching pending requests for lobby:', lobbyId);
    const { data: requests, error } = await supabase
      .from('quick_match_join_requests')
      .select('*')
      .eq('lobby_id', lobbyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('[JOIN REQUEST] Error fetching pending requests:', error);
      return;
    }
    
    console.log('[JOIN REQUEST] Fetch result:', { count: requests?.length || 0, requests });
    
    if (requests && requests.length > 0) {
      console.log('[JOIN REQUEST] Found pending request:', requests[0]);
      setCurrentJoinRequest(requests[0] as JoinRequest);
      // Skip popup for ATC lobbies - show in lobby modal instead
      if (myLobby?.game_type !== 'atc') {
        setShowJoinRequestModal(true);
      }
    }
  }, [myLobby?.game_type]);

  // Setup join request subscription when myLobby changes
  useEffect(() => {
    if (!myLobby || !userId) {
      console.log('[JOIN REQUEST] Skipping subscription - no lobby or userId', { myLobby, userId });
      return;
    }
    
    // Only subscribe if I'm the creator
    if (myLobby.created_by !== userId) {
      console.log('[JOIN REQUEST] Skipping subscription - not creator', { 
        created_by: myLobby.created_by, 
        userId 
      });
      return;
    }

    console.log('[JOIN REQUEST] Setting up subscription for lobby:', myLobby.id);

    // Fetch any existing pending join requests
    fetchPendingRequestsForLobby(myLobby.id);

    console.log('[JOIN REQUEST] Creating realtime subscription...');
    const joinRequestChannel = supabase
      .channel(`join_requests_${myLobby.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quick_match_join_requests',
          filter: `lobby_id=eq.${myLobby.id}`,
        },
        (payload) => {
          console.log('[REALTIME] Join request received:', payload.new);
          const newRequest = payload.new as JoinRequest;
          
          if (newRequest.status === 'pending') {
            console.log('[REALTIME] Showing join request modal for:', newRequest.requester_username);
            setCurrentJoinRequest(newRequest);
            // Skip popup for ATC lobbies - show in lobby modal instead
            if (myLobby?.game_type !== 'atc') {
              setShowJoinRequestModal(true);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[JOIN REQUEST] Subscription status:', status);
      });

    joinRequestSubscriptionRef.current = joinRequestChannel;

    // Fallback: Poll every 3 seconds for new requests (in case realtime fails)
    const pollInterval = setInterval(() => {
      // Only poll if modal is not already showing
      if (!showJoinRequestModal && !currentJoinRequest) {
        fetchPendingRequestsForLobby(myLobby.id);
      }
    }, 3000);

    return () => {
      console.log('[JOIN REQUEST] Cleaning up subscription');
      joinRequestChannel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [myLobby?.id, userId, showJoinRequestModal, currentJoinRequest, fetchPendingRequestsForLobby]);

  useEffect(() => {
    async function handleResume() {
      // Only attempt resume once - use useRef guard + session storage check
      if (resumeAttemptedRef.current || hasAttemptedResume()) {
        return;
      }

      if (myLobby?.match_id && myLobby.status === 'in_progress' && userId) {
        console.log('[QUICK_MATCH_RESUME] Checking match room:', myLobby.match_id);
        resumeAttemptedRef.current = true;
        markResumeAttempted();

        // Validate the room before redirecting
        const validation = await validateMatchRoom(myLobby.match_id, userId);

        if (validation.shouldRedirect && validation.path) {
          console.log('[QUICK_MATCH_RESUME] Redirecting to validated room:', validation.path);
          router.push(validation.path);
        } else {
          console.log('[QUICK_MATCH_RESUME] Room validation failed, staying on lobby page');
        }
      }
    }

    handleResume();
  }, [myLobby, userId, router]);

  async function initializeAndSubscribe() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);

      // Load lobbies
      await fetchLobbies();

      // Subscribe to realtime changes
      const channel = supabase
        .channel('quick_match_lobbies_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby inserted:', payload.new);
            const newLobby = payload.new as QuickMatchLobby;
            setLastRealtimeEvent({ type: 'INSERT', lobbyId: newLobby.id });
            if (newLobby.status === 'open') {
              setLobbies((prev) => {
                if (prev.some(l => l.id === newLobby.id)) return prev;
                return [newLobby, ...prev];
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby updated:', payload.new);
            const updatedLobby = payload.new as QuickMatchLobby;
            setLastRealtimeEvent({ type: 'UPDATE', lobbyId: updatedLobby.id });

            setLobbies((prev) => {
              if (updatedLobby.status !== 'open') {
                // Remove if no longer open (includes cancelled, in_progress, etc.)
                return prev.filter(l => l.id !== updatedLobby.id);
              }
              // Update existing
              return prev.map(l => l.id === updatedLobby.id ? updatedLobby : l);
            });

            // Check if this is MY lobby (I created it)
            if (updatedLobby.created_by === user.id) {
              console.log('[REALTIME] Creator realtime lobby update received', updatedLobby);

              if (updatedLobby.status === 'in_progress' && updatedLobby.match_id) {
                console.log('[REALTIME] Redirecting creator to match', updatedLobby.match_id);
                toast.success('Match starting!');
                router.push(`/app/play/quick-match/match/${updatedLobby.match_id}`);
              } else if (updatedLobby.status === 'cancelled') {
                setMyLobby(null);
                toast.info('Lobby was cancelled');
              } else {
                setMyLobby(updatedLobby);
              }
            }
            
            // Check if I joined as player 2 and match was cancelled
            if (updatedLobby.player2_id === user.id && updatedLobby.status === 'cancelled') {
              console.log('[REALTIME] Match was cancelled, player 2 notified');
              setPendingLobbyId(null);
              setJoining(null);
              toast.error('Match was cancelled by host');
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'quick_match_lobbies',
          },
          (payload) => {
            console.log('[REALTIME] Lobby deleted:', payload.old);
            const deletedId = (payload.old as any).id;
            const deletedLobby = payload.old as any;
            setLastRealtimeEvent({ type: 'DELETE', lobbyId: deletedId });
            setLobbies((prev) => prev.filter(l => l.id !== deletedId));
            
            // If this was my lobby being deleted, clear myLobby state
            if (deletedLobby.created_by === user.id) {
              console.log('[REALTIME] My lobby was deleted, clearing state');
              setMyLobby(null);
            }
          }
        )
        .subscribe((status) => {
          console.log('[REALTIME] Subscription status:', status);
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        });

      return () => {
        channel.unsubscribe();
      };
    } catch (error: any) {
      console.error('[ERROR] Initialization failed:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLobbies() {
    // Skip fetching if we're currently cancelling a lobby to prevent race conditions
    if (isCancelling) {
      console.log('[FETCH] Skipping fetch - lobby cancellation in progress');
      return;
    }
    
    try {
      console.log('[FETCH] Loading lobbies...');
      setFetchError(null);

      // Fetch open lobbies with host profile and stored stats
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('quick_match_lobbies')
        .select(`
          id,
          created_by,
          created_at,
          status,
          game_type,
          match_format,
          starting_score,
          double_out,
          double_in,
          player1_id,
          player2_id,
          match_id,
          player1_3dart_avg,
          atc_settings,
          players,
          player1:profiles!quick_match_lobbies_player1_id_fkey (
            username,
            avatar_url,
            trust_rating_letter,
            trust_rating_count,
            safety_rating_letter,
            safety_rating_count
          )
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(50);

      if (lobbiesError) {
        console.error('[FETCH] Error:', lobbiesError);
        const errorMsg = `Failed to load lobbies: ${lobbiesError.message}`;
        setFetchError(errorMsg);
        toast.error(errorMsg);
        setLobbies([]);
        return;
      }

      if (!lobbiesData || lobbiesData.length === 0) {
        console.log('[FETCH] No lobbies found');
        setLobbies([]);
        return;
      }

      console.log('[FETCH] Loaded lobbies with hosts:', lobbiesData.length);

      // Get all host IDs to fetch their stats (for lobbies created before migration)
      const hostIds = lobbiesData.map(l => l.player1_id).filter(Boolean);
      let hostStats: Record<string, number> = {};
      
      // Fetch player stats for all hosts
      const { data: statsData } = await supabase
        .from('player_stats')
        .select('user_id, overall_3dart_avg')
        .in('user_id', hostIds);
      
      if (statsData) {
        hostStats = statsData.reduce((acc, stat) => {
          acc[stat.user_id] = stat.overall_3dart_avg || 0;
          return acc;
        }, {} as Record<string, number>);
      }

      // Transform the data to ensure player1 is a single object, not an array
      // and include the 3-dart average (prefer stored value, fallback to live stats)
      const transformedLobbies = lobbiesData.map(lobby => {
        // Use stored avg from lobby, or fallback to live stats query
        const storedAvg = lobby.player1_3dart_avg || 0;
        const liveAvg = hostStats[lobby.player1_id] || 0;
        const avg = storedAvg > 0 ? storedAvg : liveAvg;
        
        console.log(`[FETCH] Lobby ${lobby.id}: host ${lobby.player1_id}, storedAvg: ${storedAvg}, liveAvg: ${liveAvg}, final: ${avg}`);
        return {
          ...lobby,
          player1: {
            ...(Array.isArray(lobby.player1) ? lobby.player1[0] : lobby.player1),
            overall_3dart_avg: avg
          }
        };
      });

      setLobbies(transformedLobbies as QuickMatchLobby[]);

      // Only update myLobby if not currently cancelling (to prevent race conditions)
      if (!isCancelling) {
        const myOpenLobby = transformedLobbies.find(l => l.created_by === userId && l.status === 'open');
        if (myOpenLobby) {
          setMyLobby(myOpenLobby as QuickMatchLobby);
        } else if (myLobby) {
          // My lobby no longer exists in the database, clear it
          console.log('[FETCH] My lobby no longer in database, clearing state');
          setMyLobby(null);
        }
      } else {
        console.log('[FETCH] Skipping myLobby update - cancellation in progress');
      }
    } catch (error: any) {
      console.error('[FETCH] Exception:', error);
      const errorMsg = `Error loading lobbies: ${error.message}`;
      setFetchError(errorMsg);
      toast.error(errorMsg);
      setLobbies([]);
    }
  }

  async function createLobby() {
    if (creating) return;

    setCreating(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error('You must be signed in to create a lobby');
        router.push('/login');
        return;
      }

      // Fetch host stats (3-dart average) BEFORE creating lobby
      const { data: stats } = await supabase
        .from('player_stats')
        .select('overall_3dart_avg')
        .eq('user_id', user.id)
        .maybeSingle();

      // Get user profile for the host
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      const lobbyData: any = {
        game_type: gameMode,
        starting_score: gameMode === 'atc' ? 0 : parseInt(gameMode),
        match_format: isATCMode ? 'atc' : matchFormat,
        double_out: isATCMode ? false : doubleOut,
        status: 'open',
        player1_3dart_avg: stats?.overall_3dart_avg || 0,
      };
      
      // Add ATC-specific settings and initialize players array with host
      if (isATCMode) {
        lobbyData.atc_settings = {
          order: atcOrder,
          mode: atcMode,
          player_count: atcPlayerCount,
        };
        lobbyData.players = [{
          id: user.id,
          username: hostProfile?.username || 'You',
          avatar_url: hostProfile?.avatar_url,
          is_ready: false,
          current_target: 1,
          completed_targets: [],
          is_winner: false
        }];
      }

      console.log('[CREATE] INSERTING_TO_SUPABASE', { table: 'quick_match_lobbies', payload: lobbyData });

      const { data, error } = await supabase
        .from('quick_match_lobbies')
        .insert(lobbyData)
        .select()
        .maybeSingle();

      if (error) {
        console.error('SUPABASE_INSERT_ERROR', {
          table: 'quick_match_lobbies',
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.log('[CREATE] Lobby created:', data.id);

      // Fetch host profile for the new lobby
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url, trust_rating_letter, trust_rating_count, safety_rating_letter, safety_rating_count')
        .eq('user_id', user.id)
        .maybeSingle();

      const lobbyWithHost = {
        ...data,
        player1: {
          ...(profile || { username: 'You' }),
          overall_3dart_avg: stats?.overall_3dart_avg || 0,
        },
      };

      setUserStats(stats || { overall_3dart_avg: 0 });
      setMyLobby(lobbyWithHost);
      
      // For ATC lobbies, open the lobby modal immediately
      if (isATCMode) {
        setShowATCLobbyModal(true);
      }
      
      // Immediately refresh lobbies to show the new one
      await fetchLobbies();
      
      toast.success(isATCMode ? 'Lobby created! Open the lobby to manage players.' : 'Lobby created! Waiting for opponent...');
    } catch (error: any) {
      console.error('[CREATE] Failed:', error);
      toast.error(`Failed to create lobby: ${error.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function joinLobby(lobbyId: string) {
    if (!userId || joining) return;

    setJoining(lobbyId);

    try {
      console.log('[JOIN] Sending join request for lobby:', lobbyId, 'as user:', userId);

      // Get current user profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('user_id', userId)
        .maybeSingle();

      // Get user's 3-dart average
      const { data: userStats } = await supabase
        .from('player_stats')
        .select('overall_3dart_avg')
        .eq('user_id', userId)
        .maybeSingle();

      // Check if user has camera available
      let hasCamera = false;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        hasCamera = videoDevices.length > 0;
        console.log('[JOIN] Camera detection:', { hasCamera, deviceCount: videoDevices.length });
      } catch (e) {
        console.log('[JOIN] Camera detection failed:', e);
      }

      // Create a join request (works for both ATC and regular lobbies)
      const { data: request, error: requestError } = await supabase
        .from('quick_match_join_requests')
        .insert({
          lobby_id: lobbyId,
          requester_id: userId,
          requester_username: userProfile?.username || 'Unknown',
          requester_avatar_url: userProfile?.avatar_url,
          requester_3dart_avg: userStats?.overall_3dart_avg || 0,
          requester_has_camera: hasCamera,
          status: 'pending'
        })
        .select()
        .maybeSingle();

      if (requestError) {
        console.error('[JOIN] Request error:', requestError);
        throw new Error(`Failed to send join request: ${requestError.message}`);
      }

      setPendingLobbyId(lobbyId);
      toast.success('Join request sent! Waiting for host approval...');

      // Poll for request status
      pollJoinRequestStatus(request.id);
    } catch (error: any) {
      console.error('[JOIN] Failed:', error);
      toast.error(`Failed to join: ${error.message}`);
      setJoining(null);
    }
  }

  async function pollJoinRequestStatus(requestId: string) {
    const checkInterval = setInterval(async () => {
      const { data: request } = await supabase
        .from('quick_match_join_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (!request) {
        clearInterval(checkInterval);
        setJoining(null);
        setPendingLobbyId(null);
        return;
      }

      if (request.status === 'accepted') {
        clearInterval(checkInterval);
        
        // Check if this is an ATC lobby
        const { data: lobby } = await supabase
          .from('quick_match_lobbies')
          .select('game_type, match_id, atc_settings, players')
          .eq('id', request.lobby_id)
          .maybeSingle();
        
        if (lobby?.game_type === 'atc') {
          // For ATC, show the lobby popup/overlay instead of redirecting immediately
          setPendingLobbyId(null);
          setJoining(null);
          
          // Fetch the full lobby data to show in the joined lobby view
          const { data: fullLobby, error: lobbyError } = await supabase
            .from('quick_match_lobbies')
            .select(`
              id,
              created_by,
              created_at,
              status,
              game_type,
              match_format,
              starting_score,
              double_out,
              double_in,
              player1_id,
              player2_id,
              match_id,
              player1_3dart_avg,
              atc_settings,
              players,
              player1:profiles!quick_match_lobbies_player1_id_fkey (
                username,
                avatar_url,
                trust_rating_letter,
                trust_rating_count,
                safety_rating_letter,
                safety_rating_count
              )
            `)
            .eq('id', request.lobby_id)
            .single();
            
          if (lobbyError) {
            console.error('[POLL] Error fetching lobby:', lobbyError);
            return;
          }
            
          // Also fetch host stats for display
          if (fullLobby) {
            const { data: hostStats } = await supabase
              .from('player_stats')
              .select('overall_3dart_avg')
              .eq('user_id', fullLobby.player1_id)
              .maybeSingle();

            // Handle player1 as object or array (Supabase can return either)
            const player1Data = Array.isArray(fullLobby.player1) 
              ? fullLobby.player1[0] 
              : fullLobby.player1;

            if (hostStats && player1Data) {
              (player1Data as any).overall_3dart_avg = hostStats.overall_3dart_avg;
            }
            
            // Construct properly typed lobby object
            const typedLobby: QuickMatchLobby = {
              ...fullLobby,
              player1: player1Data as any,
              game_type: fullLobby.game_type || 'atc',
            };
            
            console.log('[POLL] Join accepted, opening lobby modal:', typedLobby);
            setMyLobby(typedLobby);
            setShowATCLobbyModal(true);
            toast.success('Join request accepted! You are in the lobby.');
          }
        } else {
          // Regular 301/501 - proceed to match
          if (request.match_id) {
            toast.success('Join request accepted! Match starting...');
            router.push(`/app/play/quick-match/match/${request.match_id}`);
          }
        }
      } else if (request.status === 'declined') {
        clearInterval(checkInterval);
        setJoining(null);
        setPendingLobbyId(null);
        toast.error('Join request was declined by the host');
      }
    }, 1000);

    // Timeout after 60 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (pendingLobbyId) {
        setJoining(null);
        setPendingLobbyId(null);
        toast.error('Join request timed out');
      }
    }, 60000);
  }

  async function handleAcceptJoinRequest(request: JoinRequest) {
    if (!myLobby || processingRequest) return;

    setProcessingRequest(true);

    try {
      console.log('[ACCEPT] Accepting join request:', request.id);

      // Handle ATC mode differently
      if (myLobby.game_type === 'atc') {
        const atcSettings = (myLobby as any).atc_settings || {
          order: 'sequential',
          mode: 'singles',
          player_count: 2
        };

        // Get all current players
        const currentPlayers = myLobby.players || [];
        const updatedPlayers = [...currentPlayers, {
          id: request.requester_id,
          username: request.requester_username,
          is_ready: false,
          current_target: 1,
          completed_targets: [],
          is_winner: false
        }];

        // Check if we have enough players
        if (updatedPlayers.length >= atcSettings.player_count) {
          // Create ATC match
          const targets = atcSettings.order === 'random'
            ? shuffleArray([...[...Array(20)].map((_, i) => i + 1), 'bull'])
            : [...[...Array(20)].map((_, i) => i + 1), 'bull'];

          const { data: atcMatch, error: atcError } = await supabase
            .from('atc_matches')
            .insert({
              lobby_id: myLobby.id,
              status: 'waiting',
              game_mode: 'atc',
              atc_settings: atcSettings,
              players: updatedPlayers.map((p: any) => ({
                ...p,
                current_target: targets[0]
              })),
              current_player_index: 0,
              created_by: myLobby.player1_id,
              targets: targets
            })
            .select()
            .maybeSingle();

          if (atcError || !atcMatch) {
            throw new Error('Failed to create ATC match');
          }

          // Update the join request
          await supabase
            .from('quick_match_join_requests')
            .update({ 
              status: 'accepted',
              match_id: atcMatch.id
            })
            .eq('id', request.id);

          // Update lobby
          await supabase
            .from('quick_match_lobbies')
            .update({
              players: updatedPlayers,
              status: 'in_progress',
              match_id: atcMatch.id
            })
            .eq('id', myLobby.id);

          setShowJoinRequestModal(false);
          setCurrentJoinRequest(null);
          toast.success('Match starting!');
          router.push(`/app/play/quick-match/atc-match?matchId=${atcMatch.id}`);
        } else {
          // Just add player to lobby, not enough players yet
          await supabase
            .from('quick_match_lobbies')
            .update({
              players: updatedPlayers
            })
            .eq('id', myLobby.id);

          await supabase
            .from('quick_match_join_requests')
            .update({ status: 'accepted' })
            .eq('id', request.id);

          setShowJoinRequestModal(false);
          setCurrentJoinRequest(null);
          toast.success(`${request.requester_username} joined the lobby`);
        }
        
        setProcessingRequest(false);
        return;
      }

      // Regular 301/501 match flow
      // Parse match_format to calculate legs_to_win
      const bestOfMatch = myLobby.match_format.match(/best-of-(\d+)/i);
      const bestOf = bestOfMatch ? parseInt(bestOfMatch[1]) : 3;
      const legsToWin = Math.ceil(bestOf / 2);
      const gameMode = myLobby.starting_score;

      // Create the match room first
      const roomPayload = {
        lobby_id: myLobby.id,
        player1_id: myLobby.player1_id,
        player2_id: request.requester_id,
        game_mode: gameMode,
        status: 'active',
        current_leg: 1,
        legs_to_win: legsToWin,
        match_format: myLobby.match_format,
        player1_remaining: gameMode,
        player2_remaining: gameMode,
        current_turn: myLobby.player1_id,
      };

      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .insert(roomPayload)
        .select()
        .maybeSingle();

      if (roomError || !room) {
        throw new Error('Failed to create match room');
      }

      // Update the join request with match_id and accepted status
      await supabase
        .from('quick_match_join_requests')
        .update({ 
          status: 'accepted',
          match_id: room.id
        })
        .eq('id', request.id);

      // Update the lobby
      await supabase
        .from('quick_match_lobbies')
        .update({
          player2_id: request.requester_id,
          status: 'in_progress',
          match_id: room.id
        })
        .eq('id', myLobby.id);

      // Decline all other pending requests for this lobby
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('lobby_id', myLobby.id)
        .eq('status', 'pending')
        .neq('id', request.id);

      setShowJoinRequestModal(false);
      setCurrentJoinRequest(null);
      toast.success('Match starting!');
      router.push(`/app/play/quick-match/match/${room.id}`);
    } catch (error: any) {
      console.error('[ACCEPT] Failed:', error);
      toast.error(`Failed to accept: ${error.message}`);
      setProcessingRequest(false);
    }
  }

  // Helper to shuffle array for random order
  function shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  async function handleDeclineJoinRequest(request: JoinRequest) {
    if (processingRequest) return;

    setProcessingRequest(true);

    try {
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);

      // Remove from local state
      setJoinRequests(prev => prev.filter(r => r.id !== request.id));
      setShowJoinRequestModal(false);
      setCurrentJoinRequest(null);
      toast.info('Join request declined');
    } catch (error: any) {
      console.error('[DECLINE] Failed:', error);
      toast.error(`Failed to decline: ${error.message}`);
    } finally {
      setProcessingRequest(false);
    }
  }

  async function startATCMatch() {
    if (!myLobby || myLobby.game_type !== 'atc') return;
    
    try {
      const atcSettings = (myLobby as any).atc_settings || {
        order: 'sequential',
        mode: 'singles',
        player_count: 2
      };
      
      const currentPlayers = (myLobby as any).players || [];
      
      // Generate targets based on order
      const numbers: number[] = [...Array(20)].map((_, i) => i + 1);
      const baseTargets: (number | string)[] = [...numbers, 'bull'];
      const targets = atcSettings.order === 'random' 
        ? shuffleArray([...baseTargets])
        : baseTargets;
      
      // Create ATC match with current players
      const { data: atcMatch, error: atcError } = await supabase
        .from('atc_matches')
        .insert({
          lobby_id: myLobby.id,
          status: 'waiting',
          game_mode: 'atc',
          atc_settings: atcSettings,
          players: currentPlayers.map((p: any) => ({
            ...p,
            current_target: targets[0],
            completed_targets: [],
            is_winner: false
          })),
          current_player_index: 0,
          created_by: myLobby.created_by,
          targets: targets
        })
        .select()
        .maybeSingle();
      
      if (atcError || !atcMatch) {
        throw new Error('Failed to create ATC match');
      }
      
      // Update lobby
      await supabase
        .from('quick_match_lobbies')
        .update({
          status: 'in_progress',
          match_id: atcMatch.id
        })
        .eq('id', myLobby.id);
      
      setShowATCLobbyModal(false);
      toast.success('Match starting!');
      router.push(`/app/play/quick-match/atc-match?matchId=${atcMatch.id}`);
    } catch (error: any) {
      console.error('[START MATCH] Failed:', error);
      toast.error(`Failed to start match: ${error.message}`);
    }
  }

  async function cancelLobby() {
    if (!myLobby || !userId || isCancelling) return;

    const lobbyIdToCancel = myLobby.id;
    
    // Set cancelling flag to prevent polling from interfering
    setIsCancelling(true);
    
    // Immediately remove from lobbies list for all users via realtime
    // Optimistically update UI first for immediate feedback
    setMyLobby(null);
    setLobbies((prev) => prev.filter(l => l.id !== lobbyIdToCancel));

    try {
      console.log('[CANCEL] Cancelling lobby:', lobbyIdToCancel);

      // First, update status to 'cancelled' to trigger realtime removal
      // This ensures other users see it disappear immediately
      await supabase
        .from('quick_match_lobbies')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', lobbyIdToCancel)
        .eq('created_by', userId);

      // Then delete the lobby
      const { error } = await supabase
        .from('quick_match_lobbies')
        .delete()
        .eq('id', lobbyIdToCancel)
        .eq('created_by', userId);

      if (error) {
        console.error('[CANCEL] Delete error:', error);
        throw error;
      }
      
      toast.info('Lobby cancelled');
      console.log('[CANCEL] Lobby deleted successfully');
      
      // Keep isCancelling true for a bit longer to ensure any pending fetches don't interfere
      // This prevents the race condition where fetchLobbies runs before DB deletion propagates
      setTimeout(() => {
        console.log('[CANCEL] Clearing cancellation flag');
        setIsCancelling(false);
        // Do a final fetch to ensure consistency
        fetchLobbies();
      }, 2000);
      
    } catch (error: any) {
      console.error('[CANCEL] Failed:', error);
      toast.error(`Failed to cancel: ${error.message}`);
      setIsCancelling(false);
      
      // On error, refresh to get current state
      await fetchLobbies();
    }
  }

  const filteredLobbies = lobbies.filter((lobby) => {
    if (lobby.created_by === userId) return false;
    if (filterMode !== 'all' && lobby.game_type.toString() !== filterMode)
      return false;
    if (filterFormat !== 'all' && lobby.match_format !== filterFormat)
      return false;
    return true;
  });

  const totalOpenLobbies = lobbies.filter(l => l.created_by !== userId).length;
  const isFilterActive = filterMode !== 'all' || filterFormat !== 'all';
  const hiddenByFilter = totalOpenLobbies - filteredLobbies.length;

  const formatMatchFormat = (format: string): string => {
    const match = format.match(/best-of-(\d+)/i);
    if (match) {
      return `Best of ${match[1]}`;
    }
    return format;
  };

  const getGameModeClass = (mode: string): string => {
    if (mode === '301') return 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-red-400 shadow-lg shadow-red-500/30';
    if (mode === '501') return 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-blue-400 shadow-lg shadow-blue-500/30';
    if (mode === 'atc') return 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-purple-400 shadow-lg shadow-purple-500/30';
    return 'bg-slate-600 text-slate-200 border-slate-500';
  };
  
  const isATCMode = gameMode === 'atc';

  const getMatchFormatClass = (format: string): string => {
    const match = format.match(/best-of-(\d+)/i);
    const num = match ? parseInt(match[1]) : 1;
    switch (num) {
      case 1: return 'bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white border-pink-400 shadow-lg shadow-pink-500/30';
      case 3: return 'bg-gradient-to-r from-purple-500 to-violet-600 text-white border-purple-400 shadow-lg shadow-purple-500/30';
      case 5: return 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-indigo-400 shadow-lg shadow-indigo-500/30';
      case 7: return 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white border-cyan-400 shadow-lg shadow-cyan-500/30';
      default: return 'bg-gradient-to-r from-purple-500 to-violet-600 text-white border-purple-400 shadow-lg shadow-purple-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/play">
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">
              Online Play
            </p>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Quick Match
          </h1>
          <p className="text-slate-400 mt-2 text-lg">
            Create or join an online match with players worldwide
          </p>
        </div>

        <div>
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-emerald-400 px-4 py-2 text-sm"
          >
            <Users className="w-4 h-4 mr-2" />
            {filteredLobbies.length} Games Available
            {isFilterActive && totalOpenLobbies > filteredLobbies.length && (
              <span className="ml-1 text-slate-400 text-xs">(Filters active)</span>
            )}
          </Badge>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroStat 
          value={totalOpenLobbies} 
          label="Available Matches" 
          icon={Gamepad2} 
          color="bg-blue-500"
        />
        <HeroStat 
          value={inProgressMatches} 
          label="Matches In Play" 
          icon={Zap} 
          color="bg-emerald-500"
        />
        <HeroStat 
          value={last5Record} 
          label="Last 5 Matches" 
          icon={Target} 
          color="bg-purple-500"
        />
        <HeroStat 
          value={realtimeStatus === 'connected' ? 'Live' : 'Connecting'} 
          label="Status" 
          icon={Activity} 
          color="bg-orange-500"
        />
      </div>

      {process.env.NODE_ENV === 'development' && (
        <div>
          <Card className="bg-slate-900/50 backdrop-blur-sm border-yellow-500/30 p-4">
            <h3 className="text-sm font-bold text-yellow-400 mb-3">Online Debug</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-gray-500 mb-1">Origin</p>
                <p className="text-white font-mono">{typeof window !== 'undefined' ? window.location.origin : 'N/A'}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Supabase Host</p>
                <p className="text-white font-mono">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL
                    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
                    : 'NOT SET'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Open Lobbies Count</p>
                <p className="text-white font-mono">{totalOpenLobbies}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Realtime Status</p>
                <p className={`font-mono ${realtimeStatus === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {realtimeStatus}
                </p>
              </div>
              {lastRealtimeEvent && (
                <div className="col-span-2">
                  <p className="text-gray-500 mb-1">Last Realtime Event</p>
                  <p className="text-white font-mono">
                    {lastRealtimeEvent.type} - {lastRealtimeEvent.lobbyId.slice(0, 8)}...
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Create Lobby Card */}
        <div>
          <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6 h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">Host</p>
                  <h2 className="text-xl font-bold text-white">
                    {myLobby ? 'Your Lobby' : 'Create Match'}
                  </h2>
                </div>
              </div>

              {myLobby ? (
                // Check if user is host or joined player
                myLobby.created_by === userId ? (
                  // HOST VIEW
                  myLobby.game_type === 'atc' ? (
                    // ATC Host - Simplified view with Open Lobby button
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <p className="text-sm text-emerald-400 font-medium">
                            Lobby Created!
                          </p>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Game: <span className="text-white">Around The Clock</span></p>
                          <p>Mode: <span className="text-white">
                            {(myLobby as any).atc_settings?.mode === 'singles' ? 'Singles Only' :
                             (myLobby as any).atc_settings?.mode === 'doubles' ? 'Doubles Only' :
                             (myLobby as any).atc_settings?.mode === 'trebles' ? 'Trebles Only' : 'Increase by Segment'}
                          </span></p>
                          <p>Players: <span className="text-white">{((myLobby as any).players?.length || 1)} / {(myLobby as any).atc_settings?.player_count || 2}</span></p>
                        </div>
                      </div>
                      
                      <Button
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white py-6 text-lg font-bold"
                        onClick={() => setShowATCLobbyModal(true)}
                      >
                        <Users className="w-5 h-5 mr-2" />
                        Open Lobby
                      </Button>
                      
                      <Button
                        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        onClick={cancelLobby}
                        disabled={isCancelling}
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 mr-2" />
                            Cancel Lobby
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    // Regular 301/501 Host View
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <p className="text-sm text-emerald-400 font-medium">
                            Waiting for opponent...
                          </p>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Game: <span className="text-white">{myLobby.game_type}</span></p>
                          <p>Format: <span className="text-white">{formatMatchFormat(myLobby.match_format)}</span></p>
                        </div>
                      </div>
                      
                      {/* Join Request Status */}
                      {currentJoinRequest ? (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                            <span className="text-sm text-amber-400">
                              {currentJoinRequest.requester_username} wants to join
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-800/50 rounded-lg">
                          <p className="text-xs text-slate-500 text-center">
                            No join requests yet. Waiting for players...
                          </p>
                        </div>
                      )}
                      
                      <Button
                        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        onClick={cancelLobby}
                        disabled={isCancelling}
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          <>
                            <X className="w-4 h-4 mr-2" />
                            Stop Searching
                          </>
                        )}
                      </Button>
                    </div>
                  )
                ) : (
                  // JOINED PLAYER VIEW (for ATC mode)
                  myLobby.game_type === 'atc' ? (
                    <JoinedATCLobbyView 
                      lobby={myLobby} 
                      userId={userId}
                      onLeave={() => setMyLobby(null)}
                      onOpenModal={() => setShowATCLobbyModal(true)}
                    />
                  ) : (
                    // Regular joined view for 301/501
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
                          <p className="text-sm text-blue-400 font-medium">
                            Waiting for host to start...
                          </p>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Game: <span className="text-white">{myLobby.game_type}</span></p>
                          <p>Format: <span className="text-white">{formatMatchFormat(myLobby.match_format)}</span></p>
                        </div>
                      </div>
                      <Button
                        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        onClick={() => setMyLobby(null)}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Leave Lobby
                      </Button>
                    </div>
                  )
                )
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Game Mode</Label>
                    <Select value={gameMode} onValueChange={setGameMode}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="301">301</SelectItem>
                        <SelectItem value="501">501</SelectItem>
                        <SelectItem value="atc">Around The Clock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Around The Clock Settings */}
                  {isATCMode && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-sm">Target Order</Label>
                        <Select value={atcOrder} onValueChange={(v) => setAtcOrder(v as 'sequential' | 'random')}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="sequential">1-20 + Bull (In Order)</SelectItem>
                            <SelectItem value="random">Random Order</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-300 text-sm">Game Mode</Label>
                        <Select value={atcMode} onValueChange={(v) => setAtcMode(v as 'singles' | 'doubles' | 'trebles' | 'increase')}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="singles">Singles Only</SelectItem>
                            <SelectItem value="doubles">Doubles Only</SelectItem>
                            <SelectItem value="trebles">Trebles Only</SelectItem>
                            <SelectItem value="increase">Increase by Segment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-slate-300 text-sm">Number of Players</Label>
                        <Select value={atcPlayerCount.toString()} onValueChange={(v) => setAtcPlayerCount(parseInt(v))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="2">2 Players</SelectItem>
                            <SelectItem value="3">3 Players</SelectItem>
                            <SelectItem value="4">4 Players</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {!isATCMode && (
                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">Match Format</Label>
                      <Select value={matchFormat} onValueChange={setMatchFormat}>
                        <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="best-of-1">Best of 1</SelectItem>
                          <SelectItem value="best-of-3">Best of 3</SelectItem>
                          <SelectItem value="best-of-5">Best of 5</SelectItem>
                          <SelectItem value="best-of-7">Best of 7</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-6"
                    onClick={createLobby}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="w-5 h-5 mr-2" />
                    )}
                    Create Lobby
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Open Lobbies Card */}
        <div className="lg:col-span-2">
          <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6 h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-amber-400 uppercase tracking-wider font-semibold">Join</p>
                  <h2 className="text-xl font-bold text-white">Open Lobbies</h2>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Select value={filterMode} onValueChange={setFilterMode}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                  <SelectValue placeholder="Game Mode" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all">All Modes</SelectItem>
                  <SelectItem value="301">301</SelectItem>
                  <SelectItem value="501">501</SelectItem>
                  <SelectItem value="atc">Around The Clock</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterFormat} onValueChange={setFilterFormat}>
                <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="all">All Formats</SelectItem>
                  <SelectItem value="best-of-1">Best of 1</SelectItem>
                  <SelectItem value="best-of-3">Best of 3</SelectItem>
                  <SelectItem value="best-of-5">Best of 5</SelectItem>
                  <SelectItem value="best-of-7">Best of 7</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fetchError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{fetchError}</p>
              </div>
            )}

            {hiddenByFilter > 0 && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-sm">
                  {hiddenByFilter} {hiddenByFilter === 1 ? 'lobby is' : 'lobbies are'} hidden by your filters
                  {filterMode !== 'all' && ` (${filterMode})`}
                  {filterFormat !== 'all' && ` (${formatMatchFormat(filterFormat)})`}
                </p>
              </div>
            )}

            <ScrollArea className="h-[500px] pr-4">
              {filteredLobbies.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Target className="w-10 h-10 text-slate-500" />
                  </div>
                  <p className="text-slate-400 mb-2 text-lg">
                    {totalOpenLobbies > 0 && isFilterActive
                      ? 'No lobbies match your filters'
                      : 'No open lobbies available'}
                  </p>
                  <p className="text-slate-500 text-sm">
                    {totalOpenLobbies > 0 && isFilterActive
                      ? 'Try adjusting your filters'
                      : 'Create a lobby to get started'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLobbies.map((lobby) => (
                    <div
                      key={lobby.id}
                      className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/50 hover:border-slate-600/50 transition-all group"
                    >
                      <div className="flex flex-col h-full">
                        {/* Player Header */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                              {lobby.player1?.username?.charAt(0).toUpperCase() || 'P'}
                            </div>
                            <div>
                              <h3 className="text-white font-bold truncate">
                                {lobby.player1?.username ?? 'Player'}
                              </h3>
                              {lobby.player1?.safety_rating_letter ? (
                                <SafetyRatingBadge
                                  grade={lobby.player1.safety_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E'}
                                  size="sm"
                                  totalRatings={lobby.player1.safety_rating_count || 0}
                                />
                              ) : (
                                <span className="text-slate-500 text-xs">No rating</span>
                              )}
                            </div>
                          </div>
                          {/* Average Badge */}
                          <Badge 
                            className={`px-3 py-1 rounded-full border font-semibold ${
                              (lobby.player1?.overall_3dart_avg || 0) > 0
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                : 'bg-slate-700 text-slate-400 border-slate-600'
                            }`}
                            title="3-Dart Average"
                          >
                            <Target className="w-3 h-3 mr-1" />
                            {(lobby.player1?.overall_3dart_avg || 0) > 0
                              ? `${(lobby.player1?.overall_3dart_avg || 0).toFixed(1)}`
                              : 'New'
                            }
                          </Badge>
                        </div>

                        {/* Settings Row */}
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <Badge className={`text-sm font-bold px-3 py-1 rounded-lg border ${getGameModeClass(lobby.game_type)}`}>
                            {lobby.game_type === 'atc' ? 'Around The Clock' : lobby.game_type}
                          </Badge>
                          {lobby.game_type === 'atc' ? (
                            <>
                              <Badge className="text-sm font-bold px-3 py-1 rounded-lg border bg-purple-500/20 text-purple-400 border-purple-500/40">
                                {(lobby as any).atc_settings?.mode === 'singles' ? 'Singles' :
                                  (lobby as any).atc_settings?.mode === 'doubles' ? 'Doubles' :
                                  (lobby as any).atc_settings?.mode === 'trebles' ? 'Trebles' : 'Increase'}
                              </Badge>
                              <Badge className="text-sm font-bold px-3 py-1 rounded-lg border bg-pink-500/20 text-pink-400 border-pink-500/40">
                                {(lobby as any).atc_settings?.player_count || 2} Players
                              </Badge>
                            </>
                          ) : (
                            <>
                              <Badge className={`text-sm font-bold px-3 py-1 rounded-lg border ${getMatchFormatClass(lobby.match_format)}`}>
                                {formatMatchFormat(lobby.match_format)}
                              </Badge>
                              <Badge
                                className={`text-xs px-2 py-0.5 rounded-lg border ${
                                  lobby.double_out
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                    : 'bg-slate-700 text-slate-400 border-slate-600'
                                }`}
                              >
                                {lobby.double_out ? 'Double Out' : 'Straight Out'}
                              </Badge>
                              {!lobby.double_in && (
                                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-xs px-2 py-0.5 rounded-lg border">
                                  Straight In
                                </Badge>
                              )}
                            </>
                          )}
                        </div>

                        {/* Join Button */}
                        <div className="mt-auto">
                          <Button
                            onClick={() => joinLobby(lobby.id)}
                            disabled={joining === lobby.id}
                            className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold"
                          >
                            {joining === lobby.id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <UserPlus className="w-4 h-4 mr-2" />
                            )}
                            Join Match
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {/* Join Request Modal */}
      {showJoinRequestModal && currentJoinRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">

            <div className="flex justify-end mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowJoinRequestModal(false);
                  setTimeout(() => {
                    if (myLobby) {
                      fetchPendingRequestsForLobby(myLobby.id);
                    }
                  }, 500);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-10 h-10 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Join Request
              </h2>
              <p className="text-slate-400">
                {currentJoinRequest.requester_username} wants to join your match
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Player</span>
                <span className="text-white font-semibold">{currentJoinRequest.requester_username}</span>
              </div>
              {currentJoinRequest.requester_3dart_avg !== undefined && currentJoinRequest.requester_3dart_avg > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">3-Dart Average</span>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    <Target className="w-3 h-3 mr-1" />
                    {currentJoinRequest.requester_3dart_avg.toFixed(1)}
                  </Badge>
                </div>
              )}
              {currentJoinRequest.requester_safety_rating_letter && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Safety Rating</span>
                  <SafetyRatingBadge 
                    grade={currentJoinRequest.requester_safety_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E'}
                    size="sm"
                    totalRatings={currentJoinRequest.requester_safety_rating_count || 0}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Camera</span>
                {currentJoinRequest.requester_has_camera ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <Camera className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-slate-700 text-slate-400 border-slate-600">
                    <CameraOff className="w-3 h-3 mr-1" />
                    No Camera
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 h-12"
                onClick={() => handleDeclineJoinRequest(currentJoinRequest)}
                disabled={processingRequest}
              >
                {processingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Decline'}
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold h-12"
                onClick={() => handleAcceptJoinRequest(currentJoinRequest)}
                disabled={processingRequest}
              >
                {processingRequest ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Join Request Indicator */}
      {pendingLobbyId && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900 border border-emerald-500/30 rounded-xl px-6 py-4 shadow-2xl z-40">

          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="text-white font-medium">Waiting for host approval...</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingLobbyId(null);
                setJoining(null);
              }}
              className="text-slate-400 hover:text-white ml-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ATC Lobby Modal */}
      {showATCLobbyModal && myLobby && (
        <ATCLobbyModal
          lobby={myLobby}
          userId={userId}
          isHost={myLobby.created_by === userId}
          onClose={() => setShowATCLobbyModal(false)}
          onStartMatch={startATCMatch}
          onLeave={() => {
            setShowATCLobbyModal(false);
            if (myLobby.created_by === userId) {
              cancelLobby();
            } else {
              setMyLobby(null);
            }
          }}
        />
      )}
    </div>
  );
}
