'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Target, Trophy, Check, X, Crown, 
  Loader2, ArrowRight, Shield, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Player {
  id: string;
  username: string;
  avatar_url?: string;
  is_ready: boolean;
}

interface MatchSettings {
  gameMode: 301 | 501;
  legsToWin: number;
  doubleOut: boolean;
}

interface PrivateMatchLobbyProps {
  roomId: string;
  currentUserId: string;
  isHost: boolean;
  onStartGame: () => void;
  onCancel: () => void;
}

export function PrivateMatchLobby({ 
  roomId, 
  currentUserId, 
  isHost, 
  onStartGame,
  onCancel 
}: PrivateMatchLobbyProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState<Player | null>(null);
  const [guest, setGuest] = useState<Player | null>(null);
  const [settings, setSettings] = useState<MatchSettings | null>(null);
  const [iAmReady, setIAmReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Load room data
  useEffect(() => {
    loadRoomData();
    
    // Subscribe to room changes
    const channel = supabase
      .channel(`private_room_${roomId}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'match_rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const newData = payload.new;
          setHost(prev => prev ? { ...prev, is_ready: newData.player1_ready } : null);
          setGuest(prev => prev ? { ...prev, is_ready: newData.player2_ready } : null);
          
          // Check if both ready - start countdown
          if (newData.player1_ready && newData.player2_ready && countdown === null) {
            startCountdown();
          }
          
          // Check if game started
          if (newData.status === 'active') {
            onStartGame();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const loadRoomData = async () => {
    try {
      setLoading(true);
      
      // Get room data
      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();
      
      if (roomError || !room) {
        toast.error('Room not found');
        onCancel();
        return;
      }

      // Set settings
      setSettings({
        gameMode: room.game_mode,
        legsToWin: room.legs_to_win,
        doubleOut: room.double_out,
      });

      // Get player profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .in('user_id', [room.player1_id, room.player2_id]);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      setHost({
        id: room.player1_id,
        username: profileMap.get(room.player1_id)?.username || 'Host',
        avatar_url: profileMap.get(room.player1_id)?.avatar_url,
        is_ready: room.player1_ready || false,
      });

      setGuest({
        id: room.player2_id,
        username: profileMap.get(room.player2_id)?.username || 'Waiting...',
        avatar_url: profileMap.get(room.player2_id)?.avatar_url,
        is_ready: room.player2_ready || false,
      });

      setIAmReady(isHost ? room.player1_ready : room.player2_ready);
      
      // Check if both already ready
      if (room.player1_ready && room.player2_ready) {
        startCountdown();
      }
    } catch (err) {
      console.error('Error loading room:', err);
      toast.error('Failed to load lobby');
    } finally {
      setLoading(false);
    }
  };

  const toggleReady = async () => {
    try {
      const newReady = !iAmReady;
      setIAmReady(newReady);

      const { error } = await supabase.rpc('rpc_set_private_match_ready', {
        p_room_id: roomId,
        p_ready: newReady,
      });

      if (error) throw error;

      // Update local state
      if (isHost) {
        setHost(prev => prev ? { ...prev, is_ready: newReady } : null);
      } else {
        setGuest(prev => prev ? { ...prev, is_ready: newReady } : null);
      }
    } catch (err) {
      console.error('Error toggling ready:', err);
      toast.error('Failed to update ready status');
      setIAmReady(prev => !prev);
    }
  };

  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCancel = async () => {
    try {
      await supabase.rpc('rpc_cancel_private_match', { p_room_id: roomId });
      onCancel();
    } catch (err) {
      console.error('Error cancelling:', err);
      onCancel();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const bothReady = host?.is_ready && guest?.is_ready;
  const canStart = isHost && bothReady;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-black text-white mb-1">Private Match Lobby</h2>
        <p className="text-slate-400">Waiting for players to ready up</p>
      </div>

      {/* Countdown Overlay */}
      {countdown !== null && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        >
          <div className="text-center">
            <p className="text-white text-xl mb-4">Starting in...</p>
            <motion.div 
              key={countdown}
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl font-black text-emerald-400"
            >
              {countdown}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Players */}
      <div className="grid grid-cols-2 gap-4">
        {/* Host */}
        <motion.div 
          className={`p-4 rounded-xl border-2 ${
            host?.is_ready 
              ? 'bg-emerald-500/10 border-emerald-500/50' 
              : 'bg-slate-800/50 border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
              <Crown className="w-3 h-3 mr-1" />
              Host
            </Badge>
            {host?.is_ready && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <Check className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl mb-2">
              {host?.username.charAt(0).toUpperCase()}
            </div>
            <p className="text-white font-bold">{host?.username}</p>
            {isHost && (
              <p className="text-xs text-amber-400 mt-1">You</p>
            )}
          </div>
        </motion.div>

        {/* Guest */}
        <motion.div 
          className={`p-4 rounded-xl border-2 ${
            guest?.is_ready 
              ? 'bg-emerald-500/10 border-emerald-500/50' 
              : 'bg-slate-800/50 border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              <Users className="w-3 h-3 mr-1" />
              Guest
            </Badge>
            {guest?.is_ready && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <Check className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl mb-2 ${
              guest?.id ? 'bg-gradient-to-br from-blue-500 to-cyan-600' : 'bg-slate-700'
            }`}>
              {guest?.username.charAt(0).toUpperCase() || '?'}
            </div>
            <p className="text-white font-bold">{guest?.username || 'Waiting...'}</p>
            {!isHost && (
              <p className="text-xs text-blue-400 mt-1">You</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* Game Settings Display */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Match Settings
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <Target className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-xs text-slate-400">Game</p>
            <p className="text-white font-bold">{settings?.gameMode}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <Trophy className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-xs text-slate-400">Best Of</p>
            <p className="text-white font-bold">{((settings?.legsToWin ?? 0) * 2 - 1)} Legs</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-3 text-center">
            <Clock className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-slate-400">Double Out</p>
            <p className="text-white font-bold">{settings?.doubleOut ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      {/* Ready Status Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Ready Status</span>
          <span className="text-white font-medium">
            {[host, guest].filter(p => p?.is_ready).length}/2
          </span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
            initial={{ width: 0 }}
            animate={{ width: `${([host, guest].filter(p => p?.is_ready).length / 2) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleCancel}
          className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 h-12"
        >
          <X className="w-4 h-4 mr-2" />
          {isHost ? 'Cancel Match' : 'Leave Lobby'}
        </Button>

        <Button
          onClick={toggleReady}
          disabled={!guest?.id || guest?.id === host?.id}
          className={`flex-1 h-12 font-bold ${
            iAmReady
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {iAmReady ? (
            <>
              <X className="w-4 h-4 mr-2" />
              Not Ready
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Ready Up
            </>
          )}
        </Button>
      </div>

      {!guest?.id && (
        <p className="text-center text-amber-400 text-sm">
          Waiting for opponent to join...
        </p>
      )}

      {bothReady && (
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-emerald-400 text-sm font-medium"
        >
          Both players ready! Starting game...
        </motion.p>
      )}
    </div>
  );
}
