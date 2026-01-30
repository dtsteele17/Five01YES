'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Clock, Trophy, Swords, CheckCircle2 } from 'lucide-react';

interface TournamentReadyModalProps {
  isOpen: boolean;
  opponentName: string;
  opponentAvatar: string | null;
  tournamentName: string;
  round: number;
  timeRemaining: number;
  readyCount: number;
  isReady: boolean;
  isReadyingUp: boolean;
  onReadyUp: () => Promise<void>;
  onClose: () => void;
}

export function TournamentReadyModal({
  isOpen,
  opponentName,
  opponentAvatar,
  tournamentName,
  round,
  timeRemaining,
  readyCount,
  isReady,
  isReadyingUp,
  onReadyUp,
  onClose,
}: TournamentReadyModalProps) {
  const safeOpponentName = opponentName ?? 'Opponent';
  const safeTournamentName = tournamentName ?? 'Tournament';
  const safeRound = round ?? 1;
  const safeReadyCount = readyCount ?? 0;
  const safeTimeRemaining = timeRemaining ?? 0;

  const formatTime = (seconds: number | undefined | null) => {
    if (seconds === undefined || seconds === null || isNaN(seconds)) {
      return '--:--';
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoundName = (roundNum: number | undefined | null) => {
    if (!roundNum) return 'Round';
    if (roundNum === 1) return 'Finals';
    if (roundNum === 2) return 'Semi-Finals';
    if (roundNum === 3) return 'Quarter-Finals';
    return `Round ${roundNum}`;
  };

  const opponentInitials = ((safeOpponentName ?? 'O').trim() || 'O')
    .slice(0, 2)
    .toUpperCase();

  const isTimeoutState = safeTimeRemaining === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            Tournament Match Ready
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-400 text-sm">{safeTournamentName}</p>
            <Badge variant="outline" className="border-teal-500/30 text-teal-400">
              {getRoundName(safeRound)}
            </Badge>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-2xl font-bold">YOU</span>
                </div>
                <p className="text-sm text-gray-400">Ready to play</p>
              </div>

              <div className="flex-shrink-0">
                <Swords className="w-8 h-8 text-gray-500" />
              </div>

              <div className="text-center">
                <Avatar className="w-16 h-16 mx-auto mb-2 border-2 border-white/10">
                  <AvatarImage src={opponentAvatar || undefined} />
                  <AvatarFallback className="bg-slate-700 text-white">
                    {opponentInitials}
                  </AvatarFallback>
                </Avatar>
                <p className="text-sm font-medium">{safeOpponentName}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase">Time Left</span>
              </div>
              <p className={`text-2xl font-bold ${safeTimeRemaining < 30 ? 'text-red-500' : 'text-white'}`}>
                {formatTime(safeTimeRemaining)}
              </p>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-400 uppercase">Ready</span>
              </div>
              <p className="text-2xl font-bold">
                <span className={safeReadyCount > 0 ? 'text-teal-400' : 'text-white'}>{safeReadyCount}</span>
                <span className="text-gray-500">/2</span>
              </p>
            </div>
          </div>

          {isTimeoutState && !isReady ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
              <Clock className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-400 font-semibold">Time Expired</p>
              <p className="text-gray-400 text-sm mt-1">Ready check period has ended</p>
            </div>
          ) : isReady ? (
            <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-teal-400 mx-auto mb-2" />
              <p className="text-teal-400 font-semibold">Ready ({safeReadyCount}/2)</p>
              <p className="text-gray-400 text-sm mt-1">
                {safeReadyCount === 2 ? 'Starting match...' : 'Waiting for opponent...'}
              </p>
            </div>
          ) : (
            <Button
              onClick={onReadyUp}
              disabled={isReady || isReadyingUp || isTimeoutState}
              className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white py-6 text-lg font-bold disabled:opacity-50"
            >
              {isReadyingUp ? 'Readying up...' : `Ready Up (${safeReadyCount}/2)`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
