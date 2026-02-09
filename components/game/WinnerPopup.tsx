'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home, Loader2, Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlayerStats {
  id: string;
  name: string;
  legsWon: number;
  threeDartAverage: number;
  first9Average: number;
  highestCheckout: number;
  checkoutPercentage: number;
  totalDartsThrown: number;
  bestLegDarts: number;
  bestLegNum: number;
  totalScore: number;
  checkouts: number;
  checkoutAttempts: number;
}

interface SimplePlayer {
  id: string;
  name: string;
  legs: number;
}

interface WinnerPopupProps {
  winner: SimplePlayer;
  loser: SimplePlayer;
  winnerStats: PlayerStats;
  loserStats: PlayerStats;
  gameMode: string;
  bestOf: number;
  onRematch: () => void;
  onHome: () => void;
  rematchStatus?: 'none' | 'waiting' | 'ready';
  opponentRematchReady?: boolean;
  youReady?: boolean;
}

export function WinnerPopup({
  winner,
  loser,
  winnerStats,
  loserStats,
  gameMode,
  bestOf,
  onRematch,
  onHome,
  rematchStatus = 'none',
  opponentRematchReady = false,
  youReady = false,
}: WinnerPopupProps) {
  // Get rematch button content
  const getRematchButtonContent = () => {
    if (youReady && opponentRematchReady) {
      return (
        <>
          <Check className="w-4 h-4 mr-2" />
          Starting (2/2)
        </>
      );
    }
    if (youReady) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Waiting (1/2)
        </>
      );
    }
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-4 h-4 mr-2" />
          Rematch (1/2)
        </>
      );
    }
    return (
      <>
        <RotateCcw className="w-4 h-4 mr-2" />
        Rematch
      </>
    );
  };

  // Format stat value
  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-lg p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Banner */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30 p-3 text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mx-auto mb-1 flex items-center justify-center shadow-lg">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-xl font-bold text-white">
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-xs">
            {gameMode} • Best of {bestOf} Legs • {winner.legs}-{loser.legs}
          </p>
        </div>

        {/* Stats Grid - Compact 2 Column Layout */}
        <div className="p-3">
          {/* Player Headers */}
          <div className="flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-sm font-bold">
                {winner.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-yellow-400 text-sm leading-tight">{winner.name}</p>
                <p className="text-xs text-slate-500">Winner</p>
              </div>
            </div>
            <div className="text-slate-600 text-xs font-bold">VS</div>
            <div className="flex items-center gap-2 text-right">
              <div>
                <p className="font-bold text-slate-400 text-sm leading-tight">{loser.name}</p>
                <p className="text-xs text-slate-500">Runner-up</p>
              </div>
              <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-sm font-bold text-slate-400 border border-slate-600">
                {loser.name[0]?.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Stats Table */}
          <div className="space-y-1">
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <TrendingUp className="w-3 h-3" />
                <span>3-Dart Avg</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-yellow-400 w-12 text-right">{fmt(winnerStats.threeDartAverage)}</span>
                <span className="font-bold text-slate-400 w-12 text-right">{fmt(loserStats?.threeDartAverage)}</span>
              </div>
            </div>

            {/* First 9 */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Award className="w-3 h-3" />
                <span>First 9 Avg</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-yellow-400 w-12 text-right">{fmt(winnerStats.first9Average)}</span>
                <span className="font-bold text-slate-400 w-12 text-right">{fmt(loserStats?.first9Average)}</span>
              </div>
            </div>

            {/* Highest Checkout */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Target className="w-3 h-3" />
                <span>Best Checkout</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-yellow-400 w-12 text-right">{fmtInt(winnerStats.highestCheckout)}</span>
                <span className="font-bold text-slate-400 w-12 text-right">{fmtInt(loserStats?.highestCheckout)}</span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Zap className="w-3 h-3" />
                <span>Checkout %</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-yellow-400 w-12 text-right">{fmt(winnerStats.checkoutPercentage, '%')}</span>
                <span className="font-bold text-slate-400 w-12 text-right">{fmt(loserStats?.checkoutPercentage, '%')}</span>
              </div>
            </div>

            {/* Best Leg (Fewest Darts) */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Target className="w-3 h-3" />
                <span>Best Leg (Darts)</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 text-right">
                  <span className="font-bold text-yellow-400">{winnerStats.bestLegDarts > 0 ? winnerStats.bestLegDarts : '-'}</span>
                  {winnerStats.bestLegNum > 0 && <span className="text-[10px] text-slate-500 ml-1">L{winnerStats.bestLegNum}</span>}
                </div>
                <div className="w-12 text-right">
                  <span className="font-bold text-slate-400">{loserStats?.bestLegDarts > 0 ? loserStats.bestLegDarts : '-'}</span>
                  {loserStats?.bestLegNum > 0 && <span className="text-[10px] text-slate-500 ml-1">L{loserStats.bestLegNum}</span>}
                </div>
              </div>
            </div>

            {/* Total Darts */}
            <div className="bg-slate-800/50 rounded-lg px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <TrendingUp className="w-3 h-3" />
                <span>Total Darts</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-yellow-400 w-12 text-right">{winnerStats.totalDartsThrown || 0}</span>
                <span className="font-bold text-slate-400 w-12 text-right">{loserStats?.totalDartsThrown || 0}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-3">
            <Button
              onClick={onRematch}
              disabled={youReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 h-auto text-sm font-semibold disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-2 h-auto text-sm"
            >
              <Home className="w-4 h-4 mr-1" />
              Menu
            </Button>
          </div>
          
          {/* Rematch Status */}
          {(youReady || opponentRematchReady) && (
            <div className="mt-2 flex items-center justify-center gap-4 text-xs bg-slate-800/50 rounded-lg p-2">
              <div className={`flex items-center gap-1 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${youReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>You {youReady ? '(Ready)' : ''}</span>
              </div>
              <div className="text-slate-600">|</div>
              <div className={`flex items-center gap-1 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-2 h-2 rounded-full ${opponentRematchReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>Opponent {opponentRematchReady ? '(Ready)' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
