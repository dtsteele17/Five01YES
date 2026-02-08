'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlayerStats {
  id: string;
  name: string;
  legsWon: number;
  threeDartAverage: number;
  highestCheckout: number;
  checkoutPercentage: number;
  totalDartsThrown: number;
  totalScore: number;
  checkouts: number;
  checkoutAttempts: number;
}

interface Profile {
  user_id?: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

interface WinnerPopupProps {
  isOpen: boolean;
  winner: Profile | null;
  loser: Profile | null;
  winnerStats: PlayerStats | null;
  loserStats: PlayerStats | null;
  gameMode: string;
  bestOf: number;
  onClose: () => void;
  onRematch: () => void;
  onHome: () => void;
  // Rematch functionality
  rematchStatus?: 'none' | 'waiting' | 'ready' | 'starting';
  opponentRematchReady?: boolean;
  youReady?: boolean;
}

export function WinnerPopup({
  isOpen,
  winner,
  loser,
  winnerStats,
  loserStats,
  gameMode,
  bestOf,
  onClose,
  onRematch,
  onHome,
  rematchStatus = 'none',
  opponentRematchReady = false,
  youReady = false,
}: WinnerPopupProps) {
  if (!winner || !winnerStats) return null;

  const winnerName = winner.display_name || winner.username;
  const loserName = loser?.display_name || loser?.username || 'Opponent';

  // Calculate rematch button text
  const getRematchButtonContent = () => {
    if (rematchStatus === 'starting') {
      return (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Starting...
        </>
      );
    }
    if (youReady && opponentRematchReady) {
      return (
        <>
          <Check className="w-5 h-5 mr-2" />
          Starting Rematch (2/2)
        </>
      );
    }
    if (youReady) {
      return (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Waiting for opponent (1/2)
        </>
      );
    }
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-5 h-5 mr-2" />
          Rematch (1/2)
        </>
      );
    }
    return (
      <>
        <RotateCcw className="w-5 h-5 mr-2" />
        Rematch
      </>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Winner Banner */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30 p-6 text-center">
          <div className="w-20 h-20 bg-yellow-500 rounded-full mx-auto mb-4 flex items-center justify-center animate-bounce">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-white">
              {winnerName} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 mt-2">
            {gameMode} • Best of {bestOf} Legs
          </p>
        </div>

        {/* Stats Comparison */}
        <div className="p-6">
          {/* Score Bar */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {/* Winner */}
            <div className="text-center flex-1">
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full mx-auto mb-2 flex items-center justify-center border-2 border-yellow-500">
                <span className="text-2xl font-bold text-yellow-400">
                  {winnerName[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-yellow-400">{winnerName}</p>
              <p className="text-3xl font-bold text-white mt-1">{winnerStats.legsWon}</p>
              <span className="inline-block mt-1 px-3 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-bold">
                WINNER
              </span>
            </div>

            {/* VS */}
            <div className="text-slate-500 font-bold text-xl">VS</div>

            {/* Loser */}
            <div className="text-center flex-1">
              <div className="w-16 h-16 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center border-2 border-slate-600">
                <span className="text-2xl font-bold text-slate-400">
                  {loserName[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-slate-400">{loserName}</p>
              <p className="text-3xl font-bold text-white mt-1">{loserStats?.legsWon || 0}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="space-y-3">
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">3-Dart Average</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.threeDartAverage.toFixed(1)}
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ 
                      width: `${Math.min((winnerStats.threeDartAverage / Math.max(winnerStats.threeDartAverage, loserStats?.threeDartAverage || 0)) * 100, 100)}%` 
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats?.threeDartAverage.toFixed(1) || '0.0'}
                </span>
              </div>
            </div>

            {/* Highest Checkout */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <Target className="w-4 h-4" />
                  <span className="text-sm">Highest Checkout</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.highestCheckout > 0 ? winnerStats.highestCheckout : '-'}
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ 
                      width: winnerStats.highestCheckout > 0 || (loserStats?.highestCheckout || 0) > 0
                        ? `${Math.min((winnerStats.highestCheckout / Math.max(winnerStats.highestCheckout, loserStats?.highestCheckout || 1)) * 100, 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats && loserStats.highestCheckout > 0 ? loserStats.highestCheckout : '-'}
                </span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-slate-400">
                  <Award className="w-4 h-4" />
                  <span className="text-sm">Checkout %</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.checkoutPercentage.toFixed(1)}%
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 rounded-full"
                    style={{ 
                      width: winnerStats.checkoutPercentage > 0 || (loserStats?.checkoutPercentage || 0) > 0
                        ? `${Math.min((winnerStats.checkoutPercentage / Math.max(winnerStats.checkoutPercentage, loserStats?.checkoutPercentage || 1)) * 100, 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats?.checkoutPercentage.toFixed(1) || '0.0'}%
                </span>
              </div>
            </div>

            {/* Total Darts */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Darts Thrown</span>
                <div className="flex gap-8">
                  <span className="font-bold text-yellow-400">{winnerStats.totalDartsThrown}</span>
                  <span className="font-bold text-slate-400">{loserStats?.totalDartsThrown || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-6">
            <Button
              onClick={onRematch}
              disabled={youReady || rematchStatus === 'starting'}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            <Button
              onClick={onHome}
              variant="outline"
              disabled={rematchStatus === 'starting'}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-3 h-auto"
            >
              <Home className="w-5 h-5 mr-2" />
              Back to Menu
            </Button>
          </div>

          {/* Rematch Status */}
          {rematchStatus !== 'none' && (
            <div className="mt-4 p-3 bg-slate-800/50 rounded-lg text-center">
              <div className="flex items-center justify-center gap-4">
                <div className={`flex items-center gap-2 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-3 h-3 rounded-full ${youReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-sm">You</span>
                </div>
                <div className="text-slate-600">|</div>
                <div className={`flex items-center gap-2 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-3 h-3 rounded-full ${opponentRematchReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-sm">Opponent</span>
                </div>
              </div>
              {youReady && !opponentRematchReady && (
                <p className="text-xs text-slate-400 mt-2">Waiting for opponent to accept rematch...</p>
              )}
              {opponentRematchReady && !youReady && (
                <p className="text-xs text-emerald-400 mt-2">Opponent wants a rematch!</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}