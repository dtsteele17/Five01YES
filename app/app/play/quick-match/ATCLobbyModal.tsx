'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Target, CheckCircle2, X, Play, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface ATCLobby {
  id: string;
  created_by: string;
  status: string;
  game_type: string;
  atc_settings: ATCSettings;
  players: ATCPlayer[];
  match_id?: string;
}

interface JoinRequest {
  id: string;
  requester_id: string;
  requester_username: string;
  requester_avatar_url?: string;
  status: 'pending' | 'accepted' | 'declined';
}

interface ATCLobbyModalProps {
  lobby: ATCLobby;
  userId: string;
  isHost: boolean;
  onClose: () => void;
  onStart: () => void;
  onLeave: () => void;
}

export function ATCLobbyModal({ lobby, userId, isHost, onClose, onStart, onLeave }: ATCLobbyModalProps) {
  const [players, setPlayers] = useState<ATCPlayer[]>(lobby.players || []);
  const [isReady, setIsReady] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const settings = lobby.atc_settings;
  const maxPlayers = settings?.player_count || 2;
  const currentPlayer = players.find(p => p.id === userId);
  const allPlayersReady = players.length >= 2 && players.every(p => p.is_ready);

  useEffect(() => {
    setIsReady(currentPlayer?.is_ready || false);

    const lobbyChannel = supabase
      .channel(`lobby-${lobby.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'quick_match_lobbies',
        filter: `id=eq.${lobby.id}`
      }, (payload) => {
        const updated = payload.new as ATCLobby;
        setPlayers(updated.players || []);
        
        const me = updated.players?.find((p: ATCPlayer) => p.id === userId);
        setIsReady(me?.is_ready || false);

        if (updated.match_id && updated.status === 'in_progress') {
          router.push(`/app/play/quick-match/atc-match?matchId=${updated.match_id}`);
        }
      })
      .subscribe();

    let requestsChannel: any;
    if (isHost) {
      fetchJoinRequests();

      requestsChannel = supabase
        .channel(`requests-${lobby.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'quick_match_join_requests',
          filter: `lobby_id=eq.${lobby.id}`
        }, () => {
          fetchJoinRequests();
        })
        .subscribe();
    }

    return () => {
      void lobbyChannel.unsubscribe();
      if (requestsChannel) void requestsChannel.unsubscribe();
    };
  }, [lobby.id, userId, isHost, router]);

  const fetchJoinRequests = async () => {
    const { data } = await supabase
      .from('quick_match_join_requests')
      .select('*')
      .eq('lobby_id', lobby.id)
      .eq('status', 'pending');
    
    if (data) setJoinRequests(data);
  };

  const handleAccept = async (request: JoinRequest) => {
    setLoading(true);
    try {
      const newPlayer: ATCPlayer = {
        id: request.requester_id,
        username: request.requester_username,
        avatar_url: request.requester_avatar_url,
        is_ready: false,
      };

      const updatedPlayers = [...players, newPlayer];

      await supabase
        .from('quick_match_lobbies')
        .update({
          players: updatedPlayers,
          status: updatedPlayers.length >= maxPlayers ? 'full' : 'waiting'
        })
        .eq('id', lobby.id);

      await supabase
        .from('quick_match_join_requests')
        .update({ status: 'accepted' })
        .eq('id', request.id);

      setPlayers(updatedPlayers);
      setJoinRequests(prev => prev.filter(r => r.id !== request.id));
      toast.success(`${request.requester_username} joined!`);
    } catch (err: any) {
      toast.error('Failed to accept: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async (request: JoinRequest) => {
    await supabase
      .from('quick_match_join_requests')
      .update({ status: 'declined' })
      .eq('id', request.id);
    
    setJoinRequests(prev => prev.filter(r => r.id !== request.id));
  };

  const toggleReady = async () => {
    const newReady = !isReady;
    setIsReady(newReady);

    const updated = players.map(p =>
      p.id === userId ? { ...p, is_ready: newReady } : p
    );

    await supabase
      .from('quick_match_lobbies')
      .update({ players: updated })
      .eq('id', lobby.id);
  };

  const getModeLabel = (mode?: string) => {
    switch (mode) {
      case 'singles': return 'Singles Only';
      case 'doubles': return 'Doubles Only';
      case 'trebles': return 'Trebles Only';
      case 'increase': return 'Increase by Segment';
      default: return 'Singles Only';
    }
  };

  const emptySlots = maxPlayers - players.length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <Target className="w-6 h-6" />
              Around The Clock
            </DialogTitle>
            <p className="text-white/70">
              {isHost ? 'You are the Host' : `Playing with ${players[0]?.username || 'Host'}`}
            </p>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-800/50 p-3 rounded-lg">
              <p className="text-slate-400">Order</p>
              <p className="font-medium">{settings?.order === 'random' ? 'Random' : '1-20 + Bull'}</p>
            </div>
            <div className="bg-slate-800/50 p-3 rounded-lg">
              <p className="text-slate-400">Mode</p>
              <p className="font-medium">{getModeLabel(settings?.mode)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">Players ({players.length}/{maxPlayers})</p>
              {allPlayersReady && players.length >= 2 && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                  All Ready!
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {players.map((player, idx) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
                      {player.username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{player.username}</p>
                      {idx === 0 && <span className="text-xs text-amber-400">Host</span>}
                    </div>
                  </div>
                  {player.is_ready ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700 text-slate-400">Not Ready</Badge>
                  )}
                </div>
              ))}

              {Array.from({ length: emptySlots }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700"
                >
                  <span className="text-slate-500 text-sm">Empty Slot</span>
                  {isHost && joinRequests.length > 0 ? (
                    <Badge className="bg-amber-500/20 text-amber-400">
                      <UserPlus className="w-3 h-3 mr-1" />
                      Request Pending
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700 text-slate-500">Waiting...</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isHost && joinRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-amber-400 flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Join Requests ({joinRequests.length})
              </p>
              {joinRequests.map(req => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold">
                      {req.requester_username[0]?.toUpperCase()}
                    </div>
                    <span className="font-medium">{req.requester_username}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => handleAccept(req)}
                      disabled={loading || players.length >= maxPlayers}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Accept'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                      onClick={() => handleDecline(req)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-slate-700">
            {!isHost && (
              <Button
                className={`w-full py-3 font-bold ${
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
            )}

            {isHost && (
              <Button
                className="w-full py-3 font-bold bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
                onClick={onStart}
                disabled={!allPlayersReady || players.length < 2}
              >
                <Play className="w-4 h-4 mr-2" />
                {!allPlayersReady
                  ? `Waiting for players (${players.filter(p => p.is_ready).length}/${players.length} ready)`
                  : players.length < 2
                    ? 'Need more players'
                    : 'START GAME!'}
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
      </DialogContent>
    </Dialog>
  );
}
