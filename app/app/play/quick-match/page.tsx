'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { toast } from 'sonner';
import { validateMatchRoom, hasAttemptedResume, markResumeAttempted } from '@/lib/utils/match-resume';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { SafetyRatingBadge, SafetyRatingMini } from '@/components/safety/SafetyRatingBadge';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ============================================
// TYPES
// ============================================
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
  atc_settings?: ATCSettings;
  players?: ATCPlayer[];
}

interface ATCSettings {
  order: 'sequential' | 'random';
  mode: 'singles' | 'doubles' | 'trebles' | 'increase';
  player_count: number;
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

// ============================================
// ATC LOBBY MODAL COMPONENT
// ============================================
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
  const [atcSettings, setAtcSettings] = useState<ATCSettings | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [processingRequest, setProcessingRequest] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  
  useEffect(() => {
    // Get initial data from prop
    const lobbyPlayers = lobby.players || [];
    setPlayers(lobbyPlayers);
    setAtcSettings(lobby.atc_settings || null);
    
    const currentPlayer = lobbyPlayers.find((p: ATCPlayer) => p.id === userId);
    setIsReady(currentPlayer?.is_ready || false);
    
    // Re-fetch fresh lobby data to ensure we have latest players
    const refreshLobby = async () => {
      console.log('[ATC MODAL] Refreshing lobby data...');
      const { data: freshLobby, error } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobby.id)
        .maybeSingle();
        
      if (error) {
        console.error('[ATC MODAL] Error refreshing lobby:', error.message);
      }
        
      if (freshLobby) {
        console.log('[ATC MODAL] Refreshed lobby data, players:', freshLobby.players?.length);
        setPlayers(freshLobby.players || []);
        const me = freshLobby.players?.find((p: ATCPlayer) => p.id === userId);
        setIsReady(me?.is_ready || false);
      } else {
        console.warn('[ATC MODAL] Could not refresh lobby data');
      }
    };
    
    // Execute but don't return the promise
    void refreshLobby();
    
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

  const fetchJoinRequests = async () => {
    const { data } = await supabase
      .from('quick_match_join_requests')
      .select('*')
      .eq('lobby_id', lobby.id)
      .eq('status', 'pending');
    
    if (data) setJoinRequests(data);
  };

  const handleAcceptRequest = async (request: JoinRequest) => {
    if (processingRequest) return;
    setProcessingRequest(true);

    try {
      const currentPlayers = lobby.players || [];
      const settings = lobby.atc_settings;
      
      if (!settings) throw new Error('ATC settings not found');
      
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
  const isPlayerInLobby = players.some(p => p.id === userId);
  const currentPlayer = players.find(p => p.id === userId);
  
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
                {isHost ? 'You are the Host' : 
                 isPlayerInLobby ? 'You are in the lobby - Ready up!' : 
                 'Waiting for host to start...'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Not in lobby warning */}
          {!isPlayerInLobby && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-400 text-sm text-center">
                ⚠️ You are not in this lobby. Please close and try joining again.
              </p>
            </div>
          )}
          
          {/* Player in lobby success banner */}
          {isPlayerInLobby && !isHost && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-lg">
              <p className="text-emerald-400 text-sm text-center">
                ✓ You have joined! Click "Ready Up!" when ready.
              </p>
            </div>
          )}
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

          {/* Ready Status */}
          <div className="text-center space-y-2">
            <span className="text-slate-400 text-sm">
              {players.filter(p => p.is_ready).length} / {players.length} players ready
            </span>
            
            {players.length < 2 && (
              <p className="text-xs text-amber-400 mt-1">Need at least 2 players to start</p>
            )}
            
            {players.length >= 2 && allPlayersReady && isHost && (
              <p className="text-emerald-400 text-sm font-medium">
                Everyone ready! Click PLAY to start
              </p>
            )}
            
            {players.length >= 2 && !allPlayersReady && (
              <p className="text-amber-400 text-xs">
                Waiting for all players to ready up...
              </p>
            )}
          </div>
          
          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className={`w-full py-3 text-base font-bold ${
                isReady 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
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
            
            {isHost && (
              <Button
                className="w-full py-4 text-base font-bold bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onStartMatch}
                disabled={!allPlayersReady || players.length < 2}
              >
                <Play className="w-4 h-4 mr-2" />
                {!allPlayersReady 
                  ? `Waiting for players (${players.filter(p => p.is_ready).length}/${players.length} ready)` 
                  : players.length < 2 
                    ? 'Need more players'
                    : 'PLAY NOW!'}
              </Button>
            )}
            
            <Button
              className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
              onClick={onLeave}
              variant="outline"
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

// ============================================
// HERO STAT COMPONENT
// ============================================
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

// ============================================
// MAIN PAGE COMPONENT
// ============================================
export default function QuickMatchLobbyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  
  // ATC settings
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
  const [isCancelling, setIsCancelling] = useState(false);

  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [currentJoinRequest, setCurrentJoinRequest] = useState<JoinRequest | null>(null);
  const [processingRequest, setProcessingRequest] = useState(false);
  const [pendingLobbyId, setPendingLobbyId] = useState<string | null>(null);
  
  const [showATCLobbyModal, setShowATCLobbyModal] = useState(false);
  const [cleanupDone, setCleanupDone] = useState(false);
  
  const [inProgressMatches, setInProgressMatches] = useState<number>(0);
  const [last5Record, setLast5Record] = useState<string>('-----');

  const resumeAttemptedRef = useRef(false);
  const cancelledLobbyIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef<string | null>(null);
  
  // Keep userId ref in sync
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // ============================================
  // CLEANUP STALE LOBBIES ON MOUNT
  // ============================================
  useEffect(() => {
    cleanupUserLobbies();
  }, []);

  // ============================================
  // INITIALIZATION & SUBSCRIPTIONS
  // ============================================
  useEffect(() => {
    initializeAndSubscribe();
    
    const refreshInterval = setInterval(() => {
      if (!isCancelling) fetchLobbies();
    }, 5000);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isCancelling) {
        fetchLobbies();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Auto-open ATC lobby modal - but NOT if cancelled
  useEffect(() => {
    if (myLobby && myLobby.game_type === 'atc' && myLobby.status !== 'cancelled') {
      setShowATCLobbyModal(true);
    }
  }, [myLobby?.id, myLobby?.game_type, myLobby?.status]);

  // Subscribe to join request updates for real-time acceptance
  useEffect(() => {
    if (!userId) return;
    
    const channel = supabase
      .channel(`join-requests-user-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'quick_match_join_requests',
        filter: `requester_id=eq.${userId}`
      }, async (payload) => {
        const request = payload.new as any;
        console.log('[REALTIME] Join request update:', request.status, 'for lobby:', request.lobby_id);
        
        if (request.status === 'accepted') {
          console.log('[REALTIME] Request accepted! Opening lobby...');
          
          // Retry logic for fetching lobby
          let lobby = null;
          let retries = 0;
          const maxRetries = 15;
          
          while (!lobby && retries < maxRetries) {
            // Try simple fetch first (without profile join to avoid RLS issues)
            console.log(`[REALTIME] Fetching lobby ${request.lobby_id} (attempt ${retries + 1}/${maxRetries})`);
            const { data: lobbyData, error: lobbyError } = await supabase
              .from('quick_match_lobbies')
              .select('*')
              .eq('id', request.lobby_id)
              .maybeSingle();
              
            if (lobbyError) {
              console.log(`[REALTIME] Error fetching lobby (retry ${retries + 1}/${maxRetries}):`, lobbyError.message, lobbyError.code);
            }
            
            if (lobbyData) {
              console.log('[REALTIME] Lobby fetched successfully:', lobbyData.id, 'type:', lobbyData.game_type, 'players:', lobbyData.players?.length);
              // Verify user is in players list
              const currentUserId = userIdRef.current;
              const isInPlayers = lobbyData.players?.some((p: any) => p.id === currentUserId);
              console.log('[REALTIME] User in players list:', isInPlayers);
              
              // Now fetch player1 profile separately
              const { data: profileData } = await supabase
                .from('profiles')
                .select('username, avatar_url, trust_rating_letter, trust_rating_count, safety_rating_letter, safety_rating_count')
                .eq('user_id', lobbyData.player1_id)
                .maybeSingle();
                
              lobby = {
                ...lobbyData,
                player1: profileData || { username: 'Host' }
              };
            } else {
              retries++;
              if (retries < maxRetries) {
                console.log(`[REALTIME] Lobby not found, retrying in 400ms... (${retries}/${maxRetries})`);
                await new Promise(r => setTimeout(r, 400));
              }
            }
          }
          
          if (!lobby) {
            console.error('[REALTIME] Failed to fetch lobby after all retries');
            toast.error('Failed to join lobby. Please try refreshing the page.');
            return;
          }
            
          if (lobby.game_type === 'atc') {
            console.log('[REALTIME] ATC lobby found, opening modal');
            setPendingLobbyId(null);
            setJoining(null);
            setMyLobby(lobby as QuickMatchLobby);
            setShowATCLobbyModal(true);
            toast.success('Join request accepted! You are in the lobby.');
          } else if (request.match_id) {
            // Regular match
            console.log('[REALTIME] Regular match, redirecting');
            setPendingLobbyId(null);
            setJoining(null);
            router.push(`/app/play/quick-match/match/${request.match_id}`);
          }
        } else if (request.status === 'declined') {
          console.log('[REALTIME] Request declined');
          setPendingLobbyId(null);
          setJoining(null);
          toast.error('Join request was declined');
        }
      })
      .subscribe();
      
    return () => {
      void channel.unsubscribe();
    };
  }, [userId]);

  // ============================================
  // INITIALIZE
  // ============================================
  async function initializeAndSubscribe() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setUserId(user.id);
      await fetchLobbies();

      // Subscribe to realtime changes
      const channel = supabase
        .channel('quick_match_lobbies_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_match_lobbies' }, (payload) => {
          handleRealtimeUpdate(payload, user.id);
        })
        .subscribe((status) => {
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        });

      return () => channel.unsubscribe();
    } catch (error: any) {
      console.error('[ERROR] Initialization failed:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // REALTIME HANDLER
  // ============================================
  function handleRealtimeUpdate(payload: any, currentUserId: string) {
    const event = payload.eventType;
    const updatedLobby = payload.new as QuickMatchLobby;
    const oldLobby = payload.old as QuickMatchLobby;

    if (event === 'DELETE') {
      setLobbies(prev => prev.filter(l => l.id !== oldLobby.id));
      if (oldLobby.created_by === currentUserId) {
        setMyLobby(null);
      }
      return;
    }

    if (event === 'UPDATE') {
      // Check if user is a player in this lobby (for ATC)
      const isPlayerInLobby = updatedLobby.players?.some((p: ATCPlayer) => p.id === currentUserId);
      const isHost = updatedLobby.created_by === currentUserId;
      
      // Skip if this lobby was recently cancelled by the user
      if (cancelledLobbyIdsRef.current.has(updatedLobby.id)) {
        return;
      }
      
      // Handle user being added to a lobby (join request accepted)
      if (isPlayerInLobby && !isHost && pendingLobbyId === updatedLobby.id) {
        console.log('[REALTIME] User added to lobby via join request');
        setPendingLobbyId(null);
        setJoining(null);
        setMyLobby(updatedLobby);
        if (updatedLobby.game_type === 'atc') {
          setShowATCLobbyModal(true);
          toast.success('Join request accepted! You are in the lobby.');
        }
        return;
      }
      
      // Handle user being removed from lobby (left or kicked)
      if (!isHost && !isPlayerInLobby && myLobby?.id === updatedLobby.id) {
        console.log('[REALTIME] User removed from lobby, clearing myLobby');
        setMyLobby(null);
        setShowATCLobbyModal(false);
        return;
      }
      
      // Handle my lobby updates (host or player)
      if (isHost || isPlayerInLobby) {
        if (updatedLobby.status === 'in_progress' && updatedLobby.match_id && updatedLobby.game_type !== 'atc') {
          router.push(`/app/play/quick-match/match/${updatedLobby.match_id}`);
        } else if (updatedLobby.status === 'in_progress' && updatedLobby.game_type === 'atc') {
          // ATC match starting, redirect to match
          router.push(`/app/play/quick-match/atc-match?matchId=${updatedLobby.match_id}`);
        } else if (updatedLobby.status !== 'cancelled') {
          setMyLobby(updatedLobby);
        } else {
          // Lobby was cancelled
          setMyLobby(null);
          setShowATCLobbyModal(false);
        }
      }

      // Update lobbies list
      setLobbies(prev => {
        if (updatedLobby.status !== 'open' && updatedLobby.created_by !== currentUserId && !isPlayerInLobby) {
          return prev.filter(l => l.id !== updatedLobby.id);
        }
        const exists = prev.some(l => l.id === updatedLobby.id);
        if (exists) {
          return prev.map(l => l.id === updatedLobby.id ? updatedLobby : l);
        }
        return updatedLobby.status === 'open' ? [updatedLobby, ...prev] : prev;
      });
    }

    if (event === 'INSERT') {
      // Skip if this lobby was recently cancelled
      if (cancelledLobbyIdsRef.current.has(updatedLobby.id)) {
        return;
      }
      if (updatedLobby.status === 'open' && updatedLobby.created_by !== currentUserId) {
        setLobbies(prev => [updatedLobby, ...prev]);
      }
    }
  }

  // ============================================
  // CLEANUP USER LOBBIES
  // ============================================
  async function cleanupUserLobbies() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Cancel ANY lobbies created by this user (all statuses)
      const { data: userLobbies } = await supabase
        .from('quick_match_lobbies')
        .select('id, status')
        .eq('created_by', user.id)
        .not('status', 'in', '(cancelled)');

      if (userLobbies && userLobbies.length > 0) {
        for (const lobby of userLobbies) {
          await supabase
            .from('quick_match_lobbies')
            .update({ status: 'cancelled' })
            .eq('id', lobby.id);
          
          await supabase
            .from('quick_match_lobbies')
            .delete()
            .eq('id', lobby.id);
        }
        console.log(`[CLEANUP] Cancelled ${userLobbies.length} stale lobby/lobbies`);
      }

      // Decline any pending join requests from this user
      const { data: pendingRequests } = await supabase
        .from('quick_match_join_requests')
        .select('id')
        .eq('requester_id', user.id)
        .eq('status', 'pending');

      if (pendingRequests && pendingRequests.length > 0) {
        for (const request of pendingRequests) {
          await supabase
            .from('quick_match_join_requests')
            .update({ status: 'declined' })
            .eq('id', request.id);
        }
        console.log(`[CLEANUP] Declined ${pendingRequests.length} pending join requests`);
      }

      setCleanupDone(true);
    } catch (error) {
      console.error('[CLEANUP] Error:', error);
    }
  }

  // ============================================
  // RESET ALL (Manual cleanup)
  // ============================================
  async function handleReset() {
    try {
      setLoading(true);
      
      // Clear ALL UI state immediately
      setMyLobby(null);
      setShowATCLobbyModal(false);
      setPendingLobbyId(null);
      setJoining(null);
      setIsCancelling(false);
      setShowJoinRequestModal(false);
      setCurrentJoinRequest(null);
      
      // Clear cancelled lobby tracking
      cancelledLobbyIdsRef.current.clear();
      
      await cleanupUserLobbies();
      await fetchLobbies();
      
      toast.success('Reset complete - all stale lobbies cleared');
    } catch (error: any) {
      console.error('[RESET] Error:', error);
      toast.error('Reset failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // FETCH LOBBIES
  // ============================================
  async function fetchLobbies() {
    if (isCancelling) return;
    
    try {
      setFetchError(null);

      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      // Fetch open lobbies AND my lobby (regardless of status)
      // Also fetch lobbies where user is a player (for ATC)
      const { data: lobbiesData, error: lobbiesError } = await supabase
        .from('quick_match_lobbies')
        .select(`
          *,
          player1:profiles!quick_match_lobbies_player1_id_fkey (
            username, avatar_url, trust_rating_letter, trust_rating_count,
            safety_rating_letter, safety_rating_count
          )
        `)
        .or(`status.eq.open${currentUserId ? `,created_by.eq.${currentUserId}` : ''}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (lobbiesError) throw lobbiesError;

      // Also check for lobbies where user is a player but not creator (ATC)
      let playerLobbies: any[] = [];
      if (currentUserId) {
        const { data: allLobbies } = await supabase
          .from('quick_match_lobbies')
          .select(`
            *,
            player1:profiles!quick_match_lobbies_player1_id_fkey (
              username, avatar_url, trust_rating_letter, trust_rating_count,
              safety_rating_letter, safety_rating_count
            )
          `)
          .in('status', ['waiting', 'open', 'full']);
        
        if (allLobbies) {
          playerLobbies = allLobbies.filter(l => 
            l.players?.some((p: ATCPlayer) => p.id === currentUserId) &&
            l.created_by !== currentUserId
          );
        }
      }

      if (!lobbiesData) {
        setLobbies([]);
        return;
      }

      // Merge player lobbies with main lobbies
      const allLobbiesData = [...(lobbiesData || []), ...playerLobbies];
      // Remove duplicates
      const uniqueLobbies = allLobbiesData.filter((lobby, index, self) => 
        index === self.findIndex(l => l.id === lobby.id)
      );
      
      // Filter out cancelled lobbies and recently cancelled ones
      const filteredLobbies = uniqueLobbies.filter(lobby => {
        // Skip if in our cancelled list
        if (cancelledLobbyIdsRef.current.has(lobby.id)) return false;
        // Skip if status is cancelled
        if (lobby.status === 'cancelled') return false;
        return true;
      });

      // Fetch host stats
      const hostIds = filteredLobbies.map(l => l.player1_id).filter(Boolean);
      const { data: statsData } = await supabase
        .from('player_stats')
        .select('user_id, overall_3dart_avg')
        .in('user_id', hostIds);
      
      const hostStats = (statsData || []).reduce((acc, stat) => {
        acc[stat.user_id] = stat.overall_3dart_avg || 0;
        return acc;
      }, {} as Record<string, number>);

      // Transform data
      const transformedLobbies = filteredLobbies.map(lobby => {
        const storedAvg = lobby.player1_3dart_avg || 0;
        const liveAvg = hostStats[lobby.player1_id] || 0;
        return {
          ...lobby,
          player1: {
            ...(Array.isArray(lobby.player1) ? lobby.player1[0] : lobby.player1),
            overall_3dart_avg: storedAvg > 0 ? storedAvg : liveAvg
          }
        };
      });

      setLobbies(transformedLobbies.filter(l => l.status === 'open' && l.created_by !== currentUserId) as QuickMatchLobby[]);

      // Update myLobby if not cancelling
      if (!isCancelling && currentUserId) {
        // Check if user is host of a lobby
        const myHostedLobby = transformedLobbies.find(l => l.created_by === currentUserId);
        // Check if user is a player in a lobby
        const myPlayerLobby = transformedLobbies.find(l => 
          l.players?.some((p: ATCPlayer) => p.id === currentUserId)
        );
        
        const myCurrentLobby = myHostedLobby || myPlayerLobby;
        
        if (myCurrentLobby) {
          setMyLobby(myCurrentLobby as QuickMatchLobby);
        } else if (myLobby) {
          setMyLobby(null);
        }
      }
    } catch (error: any) {
      console.error('[FETCH] Exception:', error);
      setFetchError(`Error loading lobbies: ${error.message}`);
      setLobbies([]);
    }
  }

  // ============================================
  // CREATE LOBBY
  // ============================================
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

      // Fetch host stats and profile
      const [{ data: stats }, { data: hostProfile }] = await Promise.all([
        supabase.from('player_stats').select('overall_3dart_avg').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('username, avatar_url').eq('user_id', user.id).maybeSingle()
      ]);

      const isATC = gameMode === 'atc';
      
      const lobbyData: any = {
        game_type: gameMode,
        starting_score: isATC ? 0 : parseInt(gameMode),
        match_format: isATC ? 'atc' : matchFormat,
        double_out: isATC ? false : doubleOut,
        status: 'open',
        player1_3dart_avg: stats?.overall_3dart_avg || 0,
      };
      
      // Add ATC-specific settings
      if (isATC) {
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

      const { data, error } = await supabase
        .from('quick_match_lobbies')
        .insert(lobbyData)
        .select()
        .maybeSingle();

      if (error) throw error;

      const lobbyWithHost = {
        ...data,
        player1: {
          ...(hostProfile || { username: 'You' }),
          overall_3dart_avg: stats?.overall_3dart_avg || 0,
        },
      };

      setMyLobby(lobbyWithHost);
      
      if (isATC) {
        setShowATCLobbyModal(true);
      }
      
      await fetchLobbies();
      
      toast.success(isATC ? 'Lobby created! Open the lobby to manage players.' : 'Lobby created! Waiting for opponent...');
    } catch (error: any) {
      console.error('[CREATE] Failed:', error);
      toast.error(`Failed to create lobby: ${error.message}`);
    } finally {
      setCreating(false);
    }
  }

  // ============================================
  // JOIN LOBBY (SEND REQUEST)
  // ============================================
  async function joinLobby(lobbyId: string) {
    if (!userId || joining) return;

    setJoining(lobbyId);

    try {
      // Get user profile and stats
      const [{ data: userProfile }, { data: userStats }] = await Promise.all([
        supabase.from('profiles').select('username, avatar_url').eq('user_id', userId).maybeSingle(),
        supabase.from('player_stats').select('overall_3dart_avg').eq('user_id', userId).maybeSingle()
      ]);

      // Check for camera
      let hasCamera = false;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        hasCamera = devices.filter(d => d.kind === 'videoinput').length > 0;
      } catch (e) { /* ignore */ }

      // Create join request
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

      if (requestError) throw new Error(`Failed to send join request: ${requestError.message}`);

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

  // ============================================
  // POLL JOIN REQUEST STATUS
  // ============================================
  function pollJoinRequestStatus(requestId: string) {
    console.log('[POLL] Starting to poll for request:', requestId);
    let pollCount = 0;
    const maxPolls = 120; // 2 minutes max
    
    const checkInterval = setInterval(async () => {
      pollCount++;
      console.log(`[POLL] Checking request status (${pollCount}/${maxPolls})...`);
      
      if (pollCount > maxPolls) {
        console.log('[POLL] Max polls reached, stopping');
        clearInterval(checkInterval);
        setJoining(null);
        setPendingLobbyId(null);
        toast.error('Join request timed out');
        return;
      }
      
      try {
        const { data: request, error: requestError } = await supabase
          .from('quick_match_join_requests')
          .select('*')
          .eq('id', requestId)
          .maybeSingle();

        if (requestError) {
          console.error('[POLL] Error fetching request:', requestError);
          return; // Continue polling on error
        }

        if (!request) {
          console.log('[POLL] Request not found (deleted?), stopping poll');
          clearInterval(checkInterval);
          setJoining(null);
          setPendingLobbyId(null);
          return;
        }

        console.log('[POLL] Request status:', request.status);

        if (request.status === 'accepted') {
          console.log('[POLL] Request ACCEPTED! Fetching lobby...');
          clearInterval(checkInterval);
          
          // Retry logic for fetching lobby (handle race condition)
          let fullLobby: QuickMatchLobby | null = null;
          let retries = 0;
          const maxRetries = 10;
          
          while (retries < maxRetries && !fullLobby) {
            // Simple fetch without profile join to avoid RLS issues
            const { data, error } = await supabase
              .from('quick_match_lobbies')
              .select('*')
              .eq('id', request.lobby_id)
              .maybeSingle();
              
            if (error) {
              console.log(`[POLL] Error fetching lobby (retry ${retries + 1}/${maxRetries}):`, error.message);
            }
            
            if (data) {
              // For ATC, verify we're in the players list
              if (data.game_type === 'atc') {
                const currentUserId = userIdRef.current;
                const isInPlayers = data.players?.some((p: any) => p.id === currentUserId);
                if (isInPlayers) {
                  // Fetch player1 profile separately
                  const { data: profileData } = await supabase
                    .from('profiles')
                    .select('username, avatar_url, trust_rating_letter, trust_rating_count, safety_rating_letter, safety_rating_count')
                    .eq('user_id', data.player1_id)
                    .maybeSingle();
                    
                  fullLobby = {
                    ...data,
                    player1: profileData || { username: 'Host' }
                  } as QuickMatchLobby;
                  console.log('[POLL] Lobby fetched with player in it');
                } else {
                  console.log(`[POLL] Player not in lobby yet, retry ${retries + 1}/${maxRetries}...`);
                  await new Promise(r => setTimeout(r, 400));
                  retries++;
                }
              } else {
                // Fetch player1 profile separately
                const { data: profileData } = await supabase
                  .from('profiles')
                  .select('username, avatar_url, trust_rating_letter, trust_rating_count, safety_rating_letter, safety_rating_count')
                  .eq('user_id', data.player1_id)
                  .maybeSingle();
                  
                fullLobby = {
                  ...data,
                  player1: profileData || { username: 'Host' }
                } as QuickMatchLobby;
              }
            } else {
              console.log(`[POLL] Lobby data null, retry ${retries + 1}/${maxRetries}...`);
              await new Promise(r => setTimeout(r, 400));
              retries++;
            }
          }
            
          if (!fullLobby) {
            console.error('[POLL] Failed to fetch lobby after all retries');
            toast.error('Failed to join lobby. Please try refreshing the page.');
            setJoining(null);
            setPendingLobbyId(null);
            return;
          }
            
          if (fullLobby) {
            console.log('[POLL] Lobby fetched:', fullLobby.id, 'game_type:', fullLobby.game_type);
            
            if (fullLobby.game_type === 'atc') {
              // For ATC, show the lobby modal
              console.log('[POLL] ATC lobby - preparing to show modal');
              
              // FORCE CLEAR all pending/joining state first
              setPendingLobbyId(null);
              setJoining(null);
              
              // Create a properly typed lobby object
              const typedLobby: QuickMatchLobby = {
                ...fullLobby,
                players: fullLobby.players || [],
                atc_settings: fullLobby.atc_settings || undefined,
              };
              
              console.log('[POLL] Setting myLobby and opening modal...');
              
              // Set lobby first, then show modal
              setMyLobby(typedLobby);
              
              // Use a longer delay and force the modal open
              setTimeout(() => {
                console.log('[POLL] Opening ATC modal now!');
                setShowATCLobbyModal(true);
                toast.success('Join request accepted! You are in the lobby.');
              }, 200);
            } else if (request.match_id) {
              // For 301/501, go to match
              console.log('[POLL] Regular match - redirecting to:', request.match_id);
              toast.success('Join request accepted! Match starting...');
              router.push(`/app/play/quick-match/match/${request.match_id}`);
            } else {
              console.warn('[POLL] No match_id for non-ATC lobby');
              setJoining(null);
              setPendingLobbyId(null);
            }
          } else {
            console.error('[POLL] Lobby not found or player not added');
            toast.error('Error joining lobby. Please try again.');
            setJoining(null);
            setPendingLobbyId(null);
          }
        } else if (request.status === 'declined') {
          console.log('[POLL] Request DECLINED');
          clearInterval(checkInterval);
          setJoining(null);
          setPendingLobbyId(null);
          toast.error('Join request was declined by the host');
        }
        // else: still pending, continue polling
      } catch (error) {
        console.error('[POLL] Unexpected error:', error);
        // Continue polling on error
      }
    }, 1000);
  }

  // ============================================
  // ACCEPT JOIN REQUEST (HOST)
  // ============================================
  async function handleAcceptJoinRequest(request: JoinRequest) {
    if (!myLobby || processingRequest) return;

    setProcessingRequest(true);

    try {
      // Handle ATC mode
      if (myLobby.game_type === 'atc') {
        const atcSettings = myLobby.atc_settings;
        if (!atcSettings) throw new Error('ATC settings not found');

        const currentPlayers = myLobby.players || [];
        
        if (currentPlayers.length >= atcSettings.player_count) {
          toast.error('Lobby is full');
          setProcessingRequest(false);
          return;
        }

        const newPlayer: ATCPlayer = {
          id: request.requester_id,
          username: request.requester_username,
          is_ready: false,
          current_target: 1,
          completed_targets: [],
          is_winner: false
        };

        const updatedPlayers = [...currentPlayers, newPlayer];

        await supabase
          .from('quick_match_lobbies')
          .update({
            players: updatedPlayers,
            status: updatedPlayers.length >= atcSettings.player_count ? 'full' : 'waiting'
          })
          .eq('id', myLobby.id);

        await supabase
          .from('quick_match_join_requests')
          .update({ status: 'accepted' })
          .eq('id', request.id);

        setShowJoinRequestModal(false);
        toast.success(`${request.requester_username} joined the lobby`);
        
        setProcessingRequest(false);
        return;
      }

      // Regular 301/501 match flow
      const bestOfMatch = myLobby.match_format.match(/best-of-(\d+)/i);
      const bestOf = bestOfMatch ? parseInt(bestOfMatch[1]) : 3;
      const legsToWin = Math.ceil(bestOf / 2);
      const gameMode = myLobby.starting_score;

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

      if (roomError || !room) throw new Error('Failed to create match room');

      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'accepted', match_id: room.id })
        .eq('id', request.id);

      await supabase
        .from('quick_match_lobbies')
        .update({ player2_id: request.requester_id, status: 'in_progress', match_id: room.id })
        .eq('id', myLobby.id);

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

  // ============================================
  // DECLINE JOIN REQUEST
  // ============================================
  async function handleDeclineJoinRequest(request: JoinRequest) {
    if (processingRequest) return;

    setProcessingRequest(true);

    try {
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('id', request.id);

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

  // ============================================
  // START ATC MATCH
  // ============================================
  async function startATCMatch() {
    if (!myLobby || myLobby.game_type !== 'atc') return;
    
    try {
      const atcSettings = myLobby.atc_settings;
      if (!atcSettings) throw new Error('ATC settings not found');
      
      const currentPlayers = myLobby.players || [];
      
      // Generate targets
      const numbers: number[] = [...Array(20)].map((_, i) => i + 1);
      const baseTargets: (number | string)[] = [...numbers, 'bull'];
      
      const shuffleArray = (array: any[]) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
      };
      
      const targets = atcSettings.order === 'random' 
        ? shuffleArray([...baseTargets])
        : baseTargets;
      
      const { data: atcMatch, error: atcError } = await supabase
        .from('atc_matches')
        .insert({
          lobby_id: myLobby.id,
          status: 'in_progress',
          game_mode: 'atc',
          atc_settings: atcSettings,
          players: currentPlayers.map((p: ATCPlayer) => ({
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
      
      if (atcError || !atcMatch) throw new Error('Failed to create ATC match');
      
      await supabase
        .from('quick_match_lobbies')
        .update({ status: 'in_progress', match_id: atcMatch.id })
        .eq('id', myLobby.id);
      
      setShowATCLobbyModal(false);
      toast.success('Match starting!');
      router.push(`/app/play/quick-match/atc-match?matchId=${atcMatch.id}`);
    } catch (error: any) {
      console.error('[START MATCH] Failed:', error);
      toast.error(`Failed to start match: ${error.message}`);
    }
  }

  // ============================================
  // CANCEL LOBBY (HOST) - FORCE CANCEL
  // ============================================
  async function cancelLobby() {
    if (!myLobby || !userId || isCancelling) return;

    const lobbyIdToCancel = myLobby.id;
    
    // IMMEDIATELY block this lobby from reappearing
    cancelledLobbyIdsRef.current.add(lobbyIdToCancel);
    
    // IMMEDIATELY clear all UI state
    setShowATCLobbyModal(false);
    setMyLobby(null);
    setLobbies(prev => prev.filter(l => l.id !== lobbyIdToCancel));
    setPendingLobbyId(null);
    setJoining(null);
    setIsCancelling(true);

    try {
      // Decline all pending join requests first
      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'declined' })
        .eq('lobby_id', lobbyIdToCancel)
        .eq('status', 'pending');

      // Update status to cancelled
      await supabase
        .from('quick_match_lobbies')
        .update({ status: 'cancelled' })
        .eq('id', lobbyIdToCancel)
        .eq('created_by', userId);

      // Then delete it
      await supabase
        .from('quick_match_lobbies')
        .delete()
        .eq('id', lobbyIdToCancel)
        .eq('created_by', userId);

      toast.info('Lobby cancelled successfully');
      
      // Wait a bit then allow fetches again and refresh
      setTimeout(() => {
        setIsCancelling(false);
        cancelledLobbyIdsRef.current.delete(lobbyIdToCancel);
        fetchLobbies();
      }, 3000);
    } catch (error: any) {
      console.error('[CANCEL] Failed:', error);
      toast.error(`Failed to cancel: ${error.message}`);
      // Keep the lobby in cancelled list to prevent it from reappearing
      setTimeout(() => {
        setIsCancelling(false);
        cancelledLobbyIdsRef.current.delete(lobbyIdToCancel);
        fetchLobbies();
      }, 3000);
    }
  }

  // ============================================
  // LEAVE LOBBY (NON-HOST)
  // ============================================
  async function leaveLobby() {
    if (!myLobby || !userId || myLobby.created_by === userId) return;

    const lobbyIdToLeave = myLobby.id;
    
    // IMMEDIATELY clear UI state
    setShowATCLobbyModal(false);
    setMyLobby(null);

    try {
      // Remove user from lobby players
      const currentPlayers = myLobby.players || [];
      const updatedPlayers = currentPlayers.filter((p: ATCPlayer) => p.id !== userId);
      
      await supabase
        .from('quick_match_lobbies')
        .update({ 
          players: updatedPlayers,
          status: 'open'
        })
        .eq('id', lobbyIdToLeave);

      toast.info('Left lobby');
      fetchLobbies();
    } catch (error: any) {
      console.error('[LEAVE] Failed:', error);
      toast.error(`Failed to leave: ${error.message}`);
    }
  }

  // ============================================
  // RENDER HELPERS
  // ============================================
  const filteredLobbies = lobbies.filter((lobby) => {
    if (lobby.created_by === userId) return false;
    if (filterMode !== 'all' && lobby.game_type.toString() !== filterMode) return false;
    if (filterFormat !== 'all' && lobby.match_format !== filterFormat) return false;
    return true;
  });

  const totalOpenLobbies = lobbies.filter(l => l.created_by !== userId).length;
  const isFilterActive = filterMode !== 'all' || filterFormat !== 'all';
  const hiddenByFilter = totalOpenLobbies - filteredLobbies.length;

  const formatMatchFormat = (format: string): string => {
    const match = format.match(/best-of-(\d+)/i);
    return match ? `Best of ${match[1]}` : format;
  };

  const getGameModeClass = (mode: string): string => {
    if (mode === '301') return 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-red-400 shadow-lg shadow-red-500/30';
    if (mode === '501') return 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-blue-400 shadow-lg shadow-blue-500/30';
    if (mode === 'atc') return 'bg-gradient-to-r from-purple-500 to-pink-600 text-white border-purple-400 shadow-lg shadow-purple-500/30';
    return 'bg-slate-600 text-slate-200 border-slate-500';
  };

  const isATCMode = gameMode === 'atc';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/play">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Online Play</p>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">Quick Match</h1>
          <p className="text-slate-400 mt-2 text-lg">Create or join an online match with players worldwide</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={loading}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Reset
          </Button>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 px-4 py-2 text-sm">
            <Users className="w-4 h-4 mr-2" />
            {filteredLobbies.length} Games Available
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroStat value={totalOpenLobbies} label="Available Matches" icon={Gamepad2} color="bg-blue-500" />
        <HeroStat value={inProgressMatches} label="Matches In Play" icon={Zap} color="bg-emerald-500" />
        <HeroStat value={last5Record} label="Last 5 Matches" icon={Target} color="bg-purple-500" />
        <HeroStat value={realtimeStatus === 'connected' ? 'Live' : 'Connecting'} label="Status" icon={Activity} color="bg-orange-500" />
      </div>

      {/* Stale Lobby Warning */}
      {myLobby && myLobby.status !== 'open' && myLobby.status !== 'waiting' && myLobby.created_by !== userId && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-amber-400 font-medium">You may be stuck in an old lobby</p>
              <p className="text-slate-400 text-sm">Click Reset to clear and start fresh</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Create Lobby */}
        <div>
          <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6 h-full">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                  <Play className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">Host</p>
                  <h2 className="text-xl font-bold text-white">{myLobby ? 'Your Lobby' : 'Create Match'}</h2>
                </div>
              </div>

              {myLobby ? (
                myLobby.created_by === userId ? (
                  // HOST VIEW
                  myLobby.game_type === 'atc' ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <p className="text-sm text-emerald-400 font-medium">Lobby Created!</p>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Game: <span className="text-white">Around The Clock</span></p>
                          <p>Players: <span className="text-white">{(myLobby.players?.length || 1)} / {myLobby.atc_settings?.player_count || 2}</span></p>
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
                        {isCancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                        Cancel Lobby
                      </Button>
                    </div>
                  ) : (
                    // Regular 301/501 Host
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                          <p className="text-sm text-emerald-400 font-medium">Waiting for opponent...</p>
                        </div>
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Game: <span className="text-white">{myLobby.game_type}</span></p>
                          <p>Format: <span className="text-white">{formatMatchFormat(myLobby.match_format)}</span></p>
                        </div>
                      </div>
                      
                      <Button
                        className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                        onClick={cancelLobby}
                        disabled={isCancelling}
                      >
                        {isCancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                        Stop Searching
                      </Button>
                    </div>
                  )
                ) : (
                  // JOINED PLAYER VIEW
                  myLobby.game_type === 'atc' ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                        <p className="text-sm text-blue-400 font-medium">You are in the lobby</p>
                      </div>
                      <Button
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                        onClick={() => setShowATCLobbyModal(true)}
                      >
                        <Users className="w-5 h-5 mr-2" />
                        Open Lobby
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                      <p className="text-sm text-blue-400 font-medium">Waiting for host to start...</p>
                    </div>
                  )
                )
              ) : (
                // CREATE LOBBY FORM
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
                        <Label className="text-slate-300 text-sm">Target Type (Singles/Doubles/Trebles)</Label>
                        <Select value={atcMode} onValueChange={(v) => setAtcMode(v as any)}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-700">
                            <SelectItem value="singles">Singles Only</SelectItem>
                            <SelectItem value="doubles">Doubles Only</SelectItem>
                            <SelectItem value="trebles">Trebles Only</SelectItem>
                            <SelectItem value="increase">Increase by Segment (1,2,3...)</SelectItem>
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
                    {creating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UserPlus className="w-5 h-5 mr-2" />}
                    Create Lobby
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Open Lobbies */}
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

            <ScrollArea className="h-[500px] pr-4">
              {filteredLobbies.length === 0 ? (
                <div className="py-12 text-center">
                  <Target className="w-10 h-10 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-400 mb-2 text-lg">No open lobbies available</p>
                  <p className="text-slate-500 text-sm">Create a lobby to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLobbies.map((lobby) => (
                    <div key={lobby.id} className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl hover:bg-slate-800/50 transition-all">
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            {lobby.player1?.username?.charAt(0).toUpperCase() || 'P'}
                          </div>
                          <div>
                            <h3 className="text-white font-bold">{lobby.player1?.username ?? 'Player'}</h3>
                          </div>
                        </div>
                        <Badge className={(lobby.player1?.overall_3dart_avg || 0) > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}>
                          <Target className="w-3 h-3 mr-1" />
                          {(lobby.player1?.overall_3dart_avg || 0) > 0 ? (lobby.player1?.overall_3dart_avg || 0).toFixed(1) : 'New'}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Badge className={`text-sm font-bold px-3 py-1 rounded-lg border ${getGameModeClass(lobby.game_type)}`}>
                          {lobby.game_type === 'atc' ? 'Around The Clock' : lobby.game_type}
                        </Badge>
                        {lobby.game_type === 'atc' && (
                          <Badge className="text-sm font-bold px-3 py-1 rounded-lg border bg-purple-500/20 text-purple-400 border-purple-500/40">
                            {lobby.atc_settings?.player_count || 2} Players
                          </Badge>
                        )}
                      </div>

                      <Button
                        onClick={() => joinLobby(lobby.id)}
                        disabled={joining === lobby.id}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold"
                      >
                        {joining === lobby.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                        Join Match
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>

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
              leaveLobby();
            }
          }}
        />
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
              onClick={async () => {
                // Manual check - look for accepted requests for this lobby
                const { data: requests } = await supabase
                  .from('quick_match_join_requests')
                  .select('*')
                  .eq('lobby_id', pendingLobbyId)
                  .eq('requester_id', userId)
                  .eq('status', 'accepted')
                  .order('updated_at', { ascending: false })
                  .limit(1);
                  
                if (requests && requests.length > 0) {
                  console.log('[CHECK] Found accepted request, fetching lobby...');
                  
                  // Retry logic for fetching lobby
                  let lobby = null;
                  let retries = 0;
                  const maxRetries = 5;
                  
                  while (!lobby && retries < maxRetries) {
                    const { data: lobbyData } = await supabase
                      .from('quick_match_lobbies')
                      .select('*')
                      .eq('id', pendingLobbyId)
                      .maybeSingle();
                      
                    if (lobbyData) {
                      lobby = lobbyData;
                      console.log('[CHECK] Lobby fetched');
                    } else {
                      retries++;
                      console.log(`[CHECK] Lobby not found, retry ${retries}/${maxRetries}...`);
                      await new Promise(r => setTimeout(r, 300));
                    }
                  }
                    
                  if (lobby && lobby.game_type === 'atc') {
                    setPendingLobbyId(null);
                    setJoining(null);
                    setMyLobby(lobby as QuickMatchLobby);
                    setShowATCLobbyModal(true);
                    toast.success('Join request accepted! You are in the lobby.');
                  } else if (lobby) {
                    // Regular match
                    setPendingLobbyId(null);
                    setJoining(null);
                    router.push(`/app/play/quick-match/match/${requests[0].match_id}`);
                  } else {
                    toast.error('Could not fetch lobby. Please refresh the page.');
                  }
                } else {
                  toast.info('Still waiting for host approval...');
                }
              }} 
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 ml-2"
            >
              Check
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={async () => {
                // FORCE JOIN - try to fetch lobby and open modal regardless
                console.log('[FORCE] Attempting force join...');
                const { data: lobbyData } = await supabase
                  .from('quick_match_lobbies')
                  .select('*')
                  .eq('id', pendingLobbyId)
                  .maybeSingle();
                  
                if (lobbyData) {
                  console.log('[FORCE] Lobby found, opening modal');
                  setPendingLobbyId(null);
                  setJoining(null);
                  setMyLobby(lobbyData as QuickMatchLobby);
                  setShowATCLobbyModal(true);
                  toast.success('Joined lobby!');
                } else {
                  toast.error('Could not find lobby');
                }
              }}
              className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
            >
              Force
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setPendingLobbyId(null); setJoining(null); }} className="text-slate-400 hover:text-white">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
