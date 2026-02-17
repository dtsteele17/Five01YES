'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  X, 
  Users, 
  Crown, 
  Loader2, 
  Target,
  Play
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface ATCPlayer {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
}

interface ATCSettings {
  order: 'sequential' | 'random';
  mode: 'singles' | 'doubles' | 'trebles' | 'increase';
  player_count: number;
}

interface JoinAcceptedPopupProps {
  lobbyId: string;
  userId: string;
  onLeave: () => void;
  onMatchStart: (matchId: string) => void;
}

export function JoinAcceptedPopup({ lobbyId, userId, onLeave, onMatchStart }: JoinAcceptedPopupProps) {
  const [players, setPlayers] = useState<ATCPlayer[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [lobbyData, setLobbyData] = useState<any>(null);
  const [atcSettings, setAtcSettings] = useState<ATCSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMatchStarting, setIsMatchStarting] = useState(false);
  const [isInLobby, setIsInLobby] = useState(false);
  const [showLeaveOption, setShowLeaveOption] = useState(false);
  const supabase = createClient();
  const channelRef = useRef<any>(null);

  // Single effect to handle both data fetching and realtime
  useEffect(() => {
    console.log('[POPUP] Initializing for lobby:', lobbyId);
    let isMounted = true;

    async function init() {
      // Initial fetch attempt - don't show error yet, wait for realtime
      console.log(`[POPUP] Initial lobby fetch attempt`);
      const { data: lobbyData, error } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobbyId)
        .maybeSingle();

      if (error) {
        console.error('[POPUP] Error fetching lobby:', error);
      }

      if (lobbyData && isMounted) {
        console.log('[POPUP] Lobby found:', lobbyData.id);
        setLobbyData(lobbyData);
        setPlayers(lobbyData.players || []);
        setAtcSettings(lobbyData.atc_settings || null);
        
        // Check if user is in players list
        const userInPlayers = lobbyData.players?.some((p: ATCPlayer) => p.id === userId);
        if (userInPlayers) {
          console.log('[POPUP] User already in players list');
          const me = lobbyData.players?.find((p: ATCPlayer) => p.id === userId);
          setIsReady(me?.is_ready || false);
          setIsInLobby(true);
          setLoading(false);
        } else {
          console.log('[POPUP] User not in players yet, waiting for realtime update...');
          // Keep loading, wait for realtime
        }
      } else {
        console.log('[POPUP] Lobby not found initially, waiting for realtime...');
        // Keep loading, wait for realtime update
      }
    }

    init();

    // Set up realtime subscription
    console.log('[POPUP] Setting up realtime subscription');
    const channel = supabase
      .channel(`popup-lobby-${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'quick_match_lobbies',
          filter: `id=eq.${lobbyId}`,
        },
        (payload) => {
          if (!isMounted) return;
          
          const updatedLobby = payload.new;
          console.log('[POPUP] Lobby update received:', updatedLobby);
          
          // Update lobby data
          setLobbyData(updatedLobby);
          setPlayers(updatedLobby.players || []);
          setAtcSettings(updatedLobby.atc_settings || null);
          
          // Check if user is in players list
          const userInPlayers = updatedLobby.players?.some((p: ATCPlayer) => p.id === userId);
          const me = updatedLobby.players?.find((p: ATCPlayer) => p.id === userId);
          
          if (userInPlayers) {
            setIsReady(me?.is_ready || false);
            if (!isInLobby) {
              console.log('[POPUP] User added to lobby!');
              setIsInLobby(true);
            }
            setLoading(false);
          }
          
          // Check if match is starting
          if (updatedLobby.status === 'in_progress' && updatedLobby.match_id) {
            console.log('[POPUP] Match starting! Redirecting to:', updatedLobby.match_id);
            setIsMatchStarting(true);
            setTimeout(() => {
              if (isMounted) {
                onMatchStart(updatedLobby.match_id);
              }
            }, 1500);
          }
        }
      )
      .subscribe((status) => {
        console.log('[POPUP] Realtime subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      console.log('[POPUP] Cleaning up');
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [lobbyId, userId, onMatchStart]);

  const toggleReady = async () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);

    const updatedPlayers = players.map((p) =>
      p.id === userId ? { ...p, is_ready: newReadyState } : p
    );

    const { error } = await supabase
      .from('quick_match_lobbies')
      .update({ players: updatedPlayers })
      .eq('id', lobbyId);

    if (error) {
      console.error('[POPUP] Error updating ready status:', error);
      toast.error('Failed to update ready status');
      setIsReady(!newReadyState);
    }
  };

  const handleLeave = async () => {
    // Remove self from players
    const updatedPlayers = players.filter((p) => p.id !== userId);

    await supabase
      .from('quick_match_lobbies')
      .update({ players: updatedPlayers })
      .eq('id', lobbyId);

    onLeave();
  };

  const allReady = players.length > 0 && players.every((p) => p.is_ready);
  const readyCount = players.filter(p => p.is_ready).length;
  const isHost = players[0]?.id === userId;
  const playerSlots = atcSettings?.player_count || 2;
  const availableSlots = playerSlots - players.length;

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setShowLeaveOption(true);
      }, 10000); // Show leave option after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [loading]);

  if (loading) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <Card className="p-8 bg-slate-900 border-slate-700 text-center max-w-md">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">Joining lobby...</p>
            <p className="text-slate-500 text-sm">Waiting for host to add you</p>
            
            {showLeaveOption && (
              <div className="mt-6 pt-4 border-t border-slate-700">
                <p className="text-amber-400 text-sm mb-3">Taking longer than expected</p>
                <Button
                  onClick={onLeave}
                  variant="outline"
                  className="border-red-500/50 text-red-400"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel & Leave
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-md"
        >
          <Card className="bg-slate-900 border-slate-700 overflow-hidden shadow-2xl">
            {/* Header - Purple gradient like host modal */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Around The Clock
                  </h2>
                  <p className="text-white/70 text-sm">
                    You are in the lobby - Ready up!
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                  <Target className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {isMatchStarting ? (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                  </motion.div>
                  <h4 className="text-white font-bold text-lg">Match Starting!</h4>
                  <p className="text-slate-400">Get ready to play...</p>
                </div>
              ) : (
                <>
                  {/* Match Settings - Same as host modal */}
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

                  {/* Player List - Same as host modal */}
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
                            {player.id === lobbyData?.created_by && (
                              <Badge className="bg-amber-500/20 text-amber-400 text-xs">Host</Badge>
                            )}
                            {player.id === userId && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">You</Badge>
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

                  {/* Ready Status */}
                  <div className="text-center space-y-2">
                    <span className="text-slate-400 text-sm">
                      {readyCount} / {players.length} players ready
                    </span>
                    
                    {players.length < 2 && (
                      <p className="text-xs text-amber-400 mt-1">Need at least 2 players to start</p>
                    )}
                    
                    {players.length >= 2 && allReady && (
                      <p className="text-emerald-400 text-sm font-medium">
                        Everyone ready! Host will start soon...
                      </p>
                    )}
                    
                    {players.length >= 2 && !allReady && (
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
                    
                    <Button
                      className="w-full bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30"
                      onClick={handleLeave}
                      variant="outline"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Leave Lobby
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
