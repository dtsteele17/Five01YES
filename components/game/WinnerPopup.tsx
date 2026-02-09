'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home, Loader2, Check } from 'lucide-react';
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

  // Helper to format stat comparison
  const StatRow = ({ 
    label, 
    icon: Icon, 
    winnerValue, 
    loserValue, 
    format = (v: number) => v.toFixed(1),
    suffix = '',
    color = 'bg-yellow-500'
  }: { 
    label: string;
    icon: any;
    winnerValue: number;
    loserValue: number;
    format?: (v: number) => string;
    suffix?: string;
    color?: string;
  }) => {
    const wStr = winnerValue > 0 ? format(winnerValue) + suffix : '-';
    const lStr = loserValue > 0 ? format(loserValue) + suffix : '-';
    const maxVal = Math.max(winnerValue, loserValue, 0.1);
    
    return (
      <div className="bg-slate-800/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-slate-400 mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-yellow-400">{wStr}</span>
          <div className="flex-1 mx-4">
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
              <div 
                className={`h-full ${color} rounded-l-full transition-all`}
                style={{ width: `${(winnerValue / maxVal) * 50}%` }}
              />
              <div 
                className="h-full bg-slate-600 rounded-r-full transition-all"
                style={{ width: `${(loserValue / maxVal) * 50}%` }}
              />
            </div>
          </div>
          <span className="text-xl font-bold text-slate-400">{lStr}</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white max-w-3xl p-0 overflow-hidden max-h-[95vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Banner */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30 p-4 text-center flex-shrink-0">
          <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mx-auto mb-2 flex items-center justify-center animate-bounce shadow-lg shadow-yellow-500/20">
            <Trophy className="w-9 h-9 text-white" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-white">
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm mt-1">
            {gameMode} • Best of {bestOf} Legs
          </p>
        </div>

        {/* Stats Comparison */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Final Result */}
          <div className="text-center mb-4">
            <p className="text-sm text-slate-400 uppercase tracking-wide">Final Result</p>
            <p className="text-4xl font-bold text-white">
              {winner.legs} - {loser.legs}
            </p>
          </div>

          {/* Players Header */}
          <div className="flex items-center justify-between mb-4 px-4">
            {/* Winner */}
            <div className="text-center flex-1">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mx-auto mb-2 flex items-center justify-center border-4 border-yellow-500/50 shadow-lg shadow-yellow-500/20">
                <span className="text-2xl font-bold text-white">
                  {winner.name[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-yellow-400 text-lg">{winner.name}</p>
              <p className="text-sm text-slate-500">Winner</p>
            </div>

            {/* VS */}
            <div className="px-6">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center">
                <span className="text-slate-500 font-bold">VS</span>
              </div>
            </div>

            {/* Loser */}
            <div className="text-center flex-1">
              <div className="w-16 h-16 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center border-4 border-slate-600">
                <span className="text-2xl font-bold text-slate-400">
                  {loser.name[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-slate-400 text-lg">{loser.name}</p>
              <p className="text-sm text-slate-500">Runner-up</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="space-y-3">
            <StatRow 
              label="3-Dart Average"
              icon={TrendingUp}
              winnerValue={winnerStats.threeDartAverage || 0}
              loserValue={loserStats?.threeDartAverage || 0}
              color="bg-yellow-500"
            />

            <StatRow 
              label="First 9 Dart Average"
              icon={Award}
              winnerValue={winnerStats.first9Average || 0}
              loserValue={loserStats?.first9Average || 0}
              color="bg-purple-500"
            />

            <StatRow 
              label="Highest Checkout"
              icon={Target}
              winnerValue={winnerStats.highestCheckout || 0}
              loserValue={loserStats?.highestCheckout || 0}
              format={(v) => v > 0 ? v.toString() : '-'}
              color="bg-green-500"
            />

            <StatRow 
              label="Checkout %"
              icon={Award}
              winnerValue={winnerStats.checkoutPercentage || 0}
              loserValue={loserStats?.checkoutPercentage || 0}
              suffix="%"
              color="bg-cyan-500"
            />

            {/* Best Leg (Fewest Darts) */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-sm font-medium">Best Leg (Fewest Darts)</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-center">
                  <span className="text-xl font-bold text-yellow-400">
                    {winnerStats.bestLegDarts > 0 ? winnerStats.bestLegDarts : '-'}
                  </span>
                  {winnerStats.bestLegNum > 0 && (
                    <p className="text-xs text-slate-500">Leg {winnerStats.bestLegNum}</p>
                  )}
                </div>
                <div className="flex-1 mx-4 text-center">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Darts</span>
                </div>
                <div className="text-center">
                  <span className="text-xl font-bold text-slate-400">
                    {loserStats?.bestLegDarts > 0 ? loserStats.bestLegDarts : '-'}
                  </span>
                  {loserStats?.bestLegNum > 0 && (
                    <p className="text-xs text-slate-500">Leg {loserStats.bestLegNum}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Total Darts */}
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Darts Thrown</span>
                <div className="flex gap-8">
                  <span className="font-bold text-yellow-400">{winnerStats.totalDartsThrown || 0}</span>
                  <span className="font-bold text-slate-400">{loserStats?.totalDartsThrown || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-5">
            <Button
              onClick={onRematch}
              disabled={youReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-lg font-semibold disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-3 h-auto text-lg"
            >
              <Home className="w-5 h-5 mr-2" />
              Back to Menu
            </Button>
          </div>
          
          {/* Rematch Status */}
          {(youReady || opponentRematchReady) && (
            <div className="mt-4 flex items-center justify-center gap-6 text-sm bg-slate-800/50 rounded-lg p-3">
              <div className={`flex items-center gap-2 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${youReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="font-medium">You {youReady ? '(Ready)' : ''}</span>
              </div>
              <div className="text-slate-600">|</div>
              <div className={`flex items-center gap-2 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${opponentRematchReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="font-medium">Opponent {opponentRematchReady ? '(Ready)' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
