'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CheckCircle2, X, Users, Crown, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface ATCPlayer {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
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
  const [loading, setLoading] = useState(true);
  const [isMatchStarting, setIsMatchStarting] = useState(false);
  const supabase = createClient();

  // Fetch lobby data on mount
  useEffect(() => {
    fetchLobbyData();
  }, [lobbyId]);

  // Subscribe to lobby changes
  useEffect(() => {
    console.log('[POPUP] Setting up realtime subscription for lobby:', lobbyId);
    
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
          const updatedLobby = payload.new;
          console.log('[POPUP] Lobby update received:', updatedLobby);
          
          setPlayers(updatedLobby.players || []);
          const me = updatedLobby.players?.find((p: ATCPlayer) => p.id === userId);
          setIsReady(me?.is_ready || false);
          
          // Check if match is starting
          if (updatedLobby.status === 'in_progress' && updatedLobby.match_id) {
            console.log('[POPUP] Match starting! Redirecting to:', updatedLobby.match_id);
            setIsMatchStarting(true);
            setTimeout(() => {
              onMatchStart(updatedLobby.match_id);
            }, 1500);
          }
        }
      )
      .subscribe((status) => {
        console.log('[POPUP] Realtime subscription status:', status);
      });

    return () => {
      console.log('[POPUP] Cleaning up realtime subscription');
      void channel.unsubscribe();
    };
  }, [lobbyId, userId, onMatchStart]);

  const fetchLobbyData = async () => {
    try {
      const { data, error } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobbyId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setLobbyData(data);
        setPlayers(data.players || []);
        const me = data.players?.find((p: ATCPlayer) => p.id === userId);
        setIsReady(me?.is_ready || false);
      }
    } catch (error: any) {
      console.error('[POPUP] Error fetching lobby:', error);
      toast.error('Failed to load lobby data');
    } finally {
      setLoading(false);
    }
  };

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
  const hostPlayer = players[0];
  const isHost = hostPlayer?.id === userId;

  if (loading) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <Card className="p-8 bg-slate-900 border-slate-700">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
            <p className="text-slate-400 mt-4">Joining lobby...</p>
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-md"
        >
          <Card className="bg-slate-900 border-slate-700 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-white" />
                  <h3 className="text-white font-bold">You&apos;re In!</h3>
                </div>
                <Badge className="bg-white/20 text-white border-0">
                  {players.length} Player{players.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <p className="text-emerald-100 text-sm mt-1">
                Your join request was accepted
              </p>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
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
                  {/* Players List */}
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs uppercase font-semibold tracking-wider">
                      Players in Lobby
                    </p>
                    <div className="space-y-2">
                      {players.map((player, index) => (
                        <div
                          key={player.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            player.id === userId
                              ? 'bg-emerald-500/10 border border-emerald-500/30'
                              : 'bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-slate-700 text-slate-300 text-xs">
                                {player.username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium text-sm">
                                  {player.username}
                                </span>
                                {index === 0 && (
                                  <Crown className="w-3 h-3 text-amber-400" />
                                )}
                                {player.id === userId && (
                                  <span className="text-emerald-400 text-xs">(You)</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {player.is_ready ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Ready
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-700 text-slate-400 border-0 text-xs">
                                Not Ready
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status Message */}
                  {allReady && players.length > 1 ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                      <p className="text-emerald-400 text-sm font-medium">
                        All players ready! Starting soon...
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-800 rounded-lg p-3 text-center">
                      <p className="text-slate-400 text-sm">
                        Waiting for {players.filter((p) => !p.is_ready).length} player
                        {players.filter((p) => !p.is_ready).length !== 1 ? 's' : ''} to ready up...
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-white"
                      onClick={handleLeave}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Leave
                    </Button>
                    <Button
                      className={`flex-1 ${
                        isReady
                          ? 'bg-emerald-500 hover:bg-emerald-600'
                          : 'bg-blue-500 hover:bg-blue-600'
                      } text-white`}
                      onClick={toggleReady}
                    >
                      {isReady ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Ready!
                        </>
                      ) : (
                        <>
                          <Users className="w-4 h-4 mr-2" />
                          Ready Up
                        </>
                      )}
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
