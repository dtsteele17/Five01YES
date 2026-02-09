'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Trophy, RotateCcw, Home, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface WinnerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  winnerName: string;
  loserName: string;
  winnerStats: {
    threeDartAverage: number;
    first9Average: number;
    highestCheckout: number;
    checkoutPercentage: number;
    bestLegDarts: number;
    legsWon: number;
  };
  loserStats?: {
    threeDartAverage: number;
    first9Average: number;
    highestCheckout: number;
    checkoutPercentage: number;
    bestLegDarts: number;
    legsWon: number;
  };
  matchId: string;
  roomId: string;
  opponentId: string;
  currentUserId: string;
  isWinner: boolean;
}

export function WinnerPopup({
  isOpen,
  onClose,
  winnerName,
  loserName,
  winnerStats,
  loserStats,
  matchId,
  roomId,
  opponentId,
  currentUserId,
  isWinner,
}: WinnerPopupProps) {
  const router = useRouter();
  const supabase = createClient();
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'requested' | 'accepted' | 'waiting'>('idle');

  useEffect(() => {
    if (!isOpen || !roomId) return;

    const channel = supabase
      .channel(`rematch_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_signals',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const signal = payload.new as any;
          
          if (signal.type === 'rematch_request' && signal.from_user_id !== currentUserId) {
            setRematchStatus('requested');
            toast.info(`${signal.payload?.playerName || 'Opponent'} wants a rematch!`);
          }
          
          if (signal.type === 'rematch_accepted' && signal.payload?.rematchRoomId) {
            router.push(`/app/play/quick-match/match/${signal.payload.rematchRoomId}`);
            toast.success('Rematch starting!');
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isOpen, roomId, currentUserId, router, supabase]);

  const handleReturn = () => {
    onClose();
    router.push('/app');
  };

  const handleRematch = async () => {
    if (rematchStatus === 'waiting') return;
    setRematchStatus('waiting');

    try {
      const { error: signalError } = await supabase.from('match_signals').insert({
        room_id: roomId,
        from_user_id: currentUserId,
        to_user_id: opponentId,
        type: 'rematch_request',
        payload: { playerName: winnerName },
      });

      if (signalError) throw signalError;

      toast.info('Rematch request sent. Waiting for opponent...');

      const { data: existingRequest } = await supabase
        .from('match_signals')
        .select('*')
        .eq('room_id', roomId)
        .eq('type', 'rematch_request')
        .eq('from_user_id', opponentId)
        .maybeSingle();

      if (existingRequest) {
        await createRematch();
      }
    } catch (error: any) {
      console.error('Rematch error:', error);
      toast.error('Failed to request rematch');
      setRematchStatus('idle');
    }
  };

  const createRematch = async () => {
    try {
      const { data: currentRoom } = await supabase
        .from('match_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!currentRoom) throw new Error('Current room not found');

      const { data: newRoom, error: roomError } = await supabase
        .from('match_rooms')
        .insert({
          player1_id: currentRoom.player1_id,
          player2_id: currentRoom.player2_id,
          game_mode: currentRoom.game_mode,
          match_format: currentRoom.match_format,
          status: 'active',
          current_leg: 1,
          legs_to_win: currentRoom.legs_to_win,
          player1_remaining: currentRoom.game_mode,
          player2_remaining: currentRoom.game_mode,
          current_turn: currentRoom.player1_id,
          double_out: currentRoom.double_out,
          double_in: currentRoom.double_in,
        })
        .select()
        .single();

      if (roomError || !newRoom) throw roomError;

      await supabase.from('match_signals').insert({
        room_id: roomId,
        from_user_id: currentUserId,
        to_user_id: opponentId,
        type: 'rematch_accepted',
        payload: { rematchRoomId: newRoom.id },
      });

      router.push(`/app/play/quick-match/match/${newRoom.id}`);
      toast.success('Rematch starting!');
    } catch (error: any) {
      console.error('Create rematch error:', error);
      toast.error('Failed to create rematch');
      setRematchStatus('idle');
    }
  };

  const handleAcceptRematch = async () => {
    await createRematch();
  };

  const fmt = (n: number, suffix = '') => (n ? n.toFixed(1) + suffix : '-');
  const fmtInt = (n: number) => (n ? n.toString() : '-');

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl flex items-center justify-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-400" />
            Match Complete
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-yellow-400">
              {winnerName} Wins!
            </div>
            <div className="text-slate-400">
              {loserName} - Better luck next time!
            </div>
          </div>

          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-4 p-3 bg-slate-700 font-semibold text-sm">
              <div className="text-left">Stat</div>
              <div className="text-center text-emerald-400">{winnerName}</div>
              <div className="text-center text-red-400">{loserName}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-3 border-t border-slate-700">
              <div className="text-slate-400 text-sm">3-Dart Avg</div>
              <div className="text-center font-mono">{fmt(winnerStats.threeDartAverage)}</div>
              <div className="text-center font-mono">{fmt(loserStats?.threeDartAverage)}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-3 border-t border-slate-700">
              <div className="text-slate-400 text-sm">First 9</div>
              <div className="text-center font-mono">{fmt(winnerStats.first9Average)}</div>
              <div className="text-center font-mono">{fmt(loserStats?.first9Average)}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-3 border-t border-slate-700">
              <div className="text-slate-400 text-sm">Checkout</div>
              <div className="text-center font-mono">{fmtInt(winnerStats.highestCheckout)}</div>
              <div className="text-center font-mono">{fmtInt(loserStats?.highestCheckout)}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-3 border-t border-slate-700">
              <div className="text-slate-400 text-sm">Checkout %</div>
              <div className="text-center font-mono">{fmt(winnerStats.checkoutPercentage, '%')}</div>
              <div className="text-center font-mono">{fmt(loserStats?.checkoutPercentage, '%')}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-3 border-t border-slate-700">
              <div className="text-slate-400 text-sm">Best Leg</div>
              <div className="text-center font-mono">
                {winnerStats.bestLegDarts > 0 ? winnerStats.bestLegDarts : '-'}
              </div>
              <div className="text-center font-mono">
                {loserStats?.bestLegDarts > 0 ? loserStats.bestLegDarts : '-'}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 bg-slate-800 border-slate-600 hover:bg-slate-700"
              onClick={handleReturn}
            >
              <Home className="w-4 h-4 mr-2" />
              Return
            </Button>

            {rematchStatus === 'requested' ? (
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleAcceptRematch}
              >
                <Users className="w-4 h-4 mr-2" />
                Accept Rematch
              </Button>
            ) : (
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleRematch}
                disabled={rematchStatus === 'waiting'}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {rematchStatus === 'waiting' ? 'Waiting...' : 'Rematch'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
