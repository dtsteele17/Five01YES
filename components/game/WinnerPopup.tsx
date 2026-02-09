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
          <Check className="w-5 h-5 mr-2" />
          Starting (2/2)
        </>
      );
    }
    if (youReady) {
      return (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Waiting (1/2)
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

  // Format stat value
  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-3xl p-0 overflow-hidden"
        style={{ maxHeight: '95vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Banner */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30 p-6 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mx-auto mb-3 flex items-center justify-center shadow-lg">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-3xl font-bold text-white">
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-base">
            {gameMode} • Best of {bestOf} Legs
          </p>
        </div>

        {/* BIG LEG SCORE DISPLAY - Like DartCounter */}
        <div className="px-6 py-4">
          <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-2xl p-6 border border-slate-600">
            <div className="text-center mb-4">
              <span className="text-slate-400 text-lg uppercase tracking-widest font-semibold">Final Result</span>
            </div>
            <div className="flex items-center justify-center gap-8">
              {/* Winner Legs */}
              <div className="text-center">
                <div className="text-yellow-400 text-xl font-bold mb-2">{winner.name}</div>
                <div className="text-7xl font-black text-yellow-400 drop-shadow-lg">{winner.legs}</div>
                <div className="text-yellow-500/60 text-sm font-semibold mt-1">WINNER</div>
              </div>
              
              {/* VS Divider */}
              <div className="text-4xl font-bold text-slate-500">-</div>
              
              {/* Loser Legs */}
              <div className="text-center">
                <div className="text-slate-400 text-xl font-bold mb-2">{loser.name}</div>
                <div className="text-7xl font-black text-slate-400">{loser.legs}</div>
                <div className="text-slate-500 text-sm font-semibold mt-1">RUNNER-UP</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid - 2 Column Layout */}
        <div className="px-6 pb-6">
          {/* Player Headers */}
          <div className="flex items-center justify-between mb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-lg font-bold">
                {winner.name[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-yellow-400 text-lg leading-tight">{winner.name}</p>
                <p className="text-sm text-slate-500">Winner</p>
              </div>
            </div>
            <div className="text-slate-600 text-base font-bold">VS</div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="font-bold text-slate-400 text-lg leading-tight">{loser.name}</p>
                <p className="text-sm text-slate-500">Runner-up</p>
              </div>
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-lg font-bold text-slate-400 border border-slate-600">
                {loser.name[0]?.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Stats Table */}
          <div className="space-y-2">
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <TrendingUp className="w-5 h-5" />
                <span>3-Dart Avg</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-yellow-400 w-16 text-right text-xl">{fmt(winnerStats.threeDartAverage)}</span>
                <span className="font-bold text-slate-400 w-16 text-right text-xl">{fmt(loserStats?.threeDartAverage)}</span>
              </div>
            </div>

            {/* First 9 */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <Award className="w-5 h-5" />
                <span>First 9 Avg</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-yellow-400 w-16 text-right text-xl">{fmt(winnerStats.first9Average)}</span>
                <span className="font-bold text-slate-400 w-16 text-right text-xl">{fmt(loserStats?.first9Average)}</span>
              </div>
            </div>

            {/* Highest Checkout */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <Target className="w-5 h-5" />
                <span>Best Checkout</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-yellow-400 w-16 text-right text-xl">{fmtInt(winnerStats.highestCheckout)}</span>
                <span className="font-bold text-slate-400 w-16 text-right text-xl">{fmtInt(loserStats?.highestCheckout)}</span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <Zap className="w-5 h-5" />
                <span>Checkout %</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-yellow-400 w-16 text-right text-xl">{fmt(winnerStats.checkoutPercentage, '%')}</span>
                <span className="font-bold text-slate-400 w-16 text-right text-xl">{fmt(loserStats?.checkoutPercentage, '%')}</span>
              </div>
            </div>

            {/* Best Leg (Fewest Darts) */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <Target className="w-5 h-5" />
                <span>Best Leg (Darts)</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="w-16 text-right">
                  <span className="font-bold text-yellow-400 text-xl">{winnerStats.bestLegDarts > 0 ? winnerStats.bestLegDarts : '-'}</span>
                  {winnerStats.bestLegNum > 0 && <span className="text-xs text-slate-500 ml-1">L{winnerStats.bestLegNum}</span>}
                </div>
                <div className="w-16 text-right">
                  <span className="font-bold text-slate-400 text-xl">{loserStats?.bestLegDarts > 0 ? loserStats.bestLegDarts : '-'}</span>
                  {loserStats?.bestLegNum > 0 && <span className="text-xs text-slate-500 ml-1">L{loserStats.bestLegNum}</span>}
                </div>
              </div>
            </div>

            {/* Total Darts */}
            <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-slate-400 text-base">
                <TrendingUp className="w-5 h-5" />
                <span>Total Darts</span>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-bold text-yellow-400 w-16 text-right text-xl">{winnerStats.totalDartsThrown || 0}</span>
                <span className="font-bold text-slate-400 w-16 text-right text-xl">{loserStats?.totalDartsThrown || 0}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-5">
            <Button
              onClick={onRematch}
              disabled={youReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-base font-semibold disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-3 h-auto text-base"
            >
              <Home className="w-5 h-5 mr-2" />
              Menu
            </Button>
          </div>
          
          {/* Rematch Status */}
          {(youReady || opponentRematchReady) && (
            <div className="mt-3 flex items-center justify-center gap-6 text-sm bg-slate-800/50 rounded-lg p-3">
              <div className={`flex items-center gap-2 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${youReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>You {youReady ? '(Ready)' : ''}</span>
              </div>
              <div className="text-slate-600">|</div>
              <div className={`flex items-center gap-2 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${opponentRematchReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>Opponent {opponentRematchReady ? '(Ready)' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
